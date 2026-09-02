package my.monash.hackathon.hackathon_website_backend.admin;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import my.monash.hackathon.hackathon_website_backend.admin.dto.ApproveRegistrationReviewRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.RegistrationReviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.RegistrationReviewMemberDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.ReviewDecisionRequest;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLog;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLogRepository;
import my.monash.hackathon.hackathon_website_backend.event.EventSettings;
import my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamMember;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.team.TeamRepository;
import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * The admin side of the registration review queue: listing what {@code FormRegistrationImporter}
 * has flagged, and turning an admin's decision into either a real import or a closed-out row.
 *
 * <p>Deliberately does not reach into {@code tools/} to reuse {@code TeamRow}'s validation,
 * even though the two small regexes below duplicate it. That package is documented as the one
 * deliberately non-Spring, raw-JDBC corner of the backend — a small duplication here is a
 * smaller cost than crossing that boundary.
 *
 * <p>Approve, reject and needs-fix all require the review to still be {@code awaiting_review}
 * or {@code needs_fix} — see {@link #requireDecidable}. Once a decision is made it is final
 * from this service's own actions; only {@link #reopen} moves a row backward, and even that
 * refuses an already-{@code approved} row, since undoing an import is not what it does.
 */
@Service
@Transactional
public class RegistrationReviewService {

    private static final Logger log = LoggerFactory.getLogger(RegistrationReviewService.class);

    private static final List<String> ALL_STATUSES =
            List.of("awaiting_review", "needs_fix", "approved", "rejected");
    private static final List<String> DECIDABLE_STATUSES = List.of("awaiting_review", "needs_fix");

    private static final int MAX_TEAM_NAME_LENGTH = 120;

    /** Mirrors TeamRow's own EMAIL pattern — see the class comment for why this is not shared. */
    private static final Pattern EMAIL =
            Pattern.compile("^[^\\s@,;]+@[^\\s@,;.]+(\\.[^\\s@,;.]+)+$");
    private static final Pattern URL = Pattern.compile("^https?://\\S+$");

    private static final String JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int JOIN_CODE_LENGTH = 8;
    private static final int JOIN_CODE_ATTEMPTS = 25;

    private final RegistrationReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final EventSettingsRepository eventSettingsRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;
    private final SecureRandom random = new SecureRandom();

    public RegistrationReviewService(
            RegistrationReviewRepository reviewRepository,
            UserRepository userRepository,
            TeamRepository teamRepository,
            TeamMemberRepository teamMemberRepository,
            EventSettingsRepository eventSettingsRepository,
            AuditLogRepository auditLogRepository,
            ObjectMapper objectMapper) {
        this.reviewRepository = reviewRepository;
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.eventSettingsRepository = eventSettingsRepository;
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<RegistrationReviewDto> list() {
        return reviewRepository.findByStatusInOrderByCreatedAtDesc(ALL_STATUSES).stream()
                .map(this::toDto)
                .toList();
    }

    /**
     * Imports the team for real. The submitted data is re-validated here exactly as it would
     * be by the CLI importer — a member missing a name or email, an unparseable link, or a
     * team name/email collision that has appeared since the row was flagged all refuse with a
     * specific reason rather than silently dropping or guessing at the value.
     */
    public RegistrationReviewDto approve(Long id, ApproveRegistrationReviewRequest request, User actor) {
        RegistrationReview review = requireDecidable(id);

        String teamName = request.teamName() == null ? "" : request.teamName().trim();
        if (teamName.isEmpty()) {
            throw new IllegalArgumentException("Team name is required.");
        }
        if (teamName.length() > MAX_TEAM_NAME_LENGTH) {
            throw new IllegalArgumentException("Team name is " + teamName.length()
                    + " characters; the limit is " + MAX_TEAM_NAME_LENGTH + ".");
        }

        List<RegistrationReviewMemberDto> members =
                request.members() == null ? List.of() : request.members();

        EventSettings settings = eventSettingsRepository.findSingleton()
                .orElseThrow(() -> new IllegalArgumentException(
                        "event_settings has no row with id = 1 - cannot read the permitted team size."));
        if (members.size() < settings.getMinTeamSize() || members.size() > settings.getMaxTeamSize()) {
            throw new IllegalArgumentException("Team size is " + members.size()
                    + "; teams must have between " + settings.getMinTeamSize() + " and "
                    + settings.getMaxTeamSize() + " members.");
        }

        List<String> emailsSeen = new ArrayList<>();
        List<User> newUsers = new ArrayList<>();
        for (RegistrationReviewMemberDto member : members) {
            String fullName = member.fullName() == null ? "" : member.fullName().trim();
            if (fullName.isEmpty()) {
                throw new IllegalArgumentException("Every member needs a name.");
            }
            if (fullName.length() > 200) {
                throw new IllegalArgumentException(fullName.substring(0, 40) + "... - name is "
                        + fullName.length() + " characters; the limit is 200.");
            }

            String email = member.email() == null
                    ? "" : member.email().trim().toLowerCase(Locale.ROOT);
            if (email.isEmpty() || !EMAIL.matcher(email).matches()) {
                throw new IllegalArgumentException(fullName + " needs a valid email address - '"
                        + email + "' does not look like one.");
            }
            if (emailsSeen.contains(email)) {
                throw new IllegalArgumentException(email
                        + " is listed for more than one member.");
            }
            emailsSeen.add(email);

            String resumeUrl = validatedUrlOrNull(member.resumeUrl(), fullName, "resume");
            String linkedinUrl = validatedUrlOrNull(member.linkedinUrl(), fullName, "LinkedIn");
            String githubUrl = validatedUrlOrNull(member.githubUrl(), fullName, "GitHub");

            if (userRepository.findByEmail(email).isPresent()) {
                throw new IllegalArgumentException(email + " is already registered. Either "
                        + "they registered twice, or this collides with an existing account.");
            }

            User user = new User(null, email, fullName);
            String phone = member.phone() == null || member.phone().isBlank()
                    ? null : member.phone().trim();
            user.setPhone(phone);
            user.setResumeUrl(resumeUrl);
            user.setLinkedinUrl(linkedinUrl);
            user.setGithubUrl(githubUrl);
            newUsers.add(user);
        }

        if (teamRepository.findByName(teamName).isPresent()) {
            throw new IllegalArgumentException("A team named '" + teamName
                    + "' already exists - rename this team before approving it.");
        }

        List<User> savedUsers = userRepository.saveAll(newUsers);

        Team team = new Team(teamName, mintJoinCode(), savedUsers.get(0));
        team.setStatus("complete");
        team = teamRepository.save(team);

        for (User user : savedUsers) {
            teamMemberRepository.save(new TeamMember(user, team));
        }

        review.setStatus("approved");
        review.setReviewedBy(actor);
        review.setReviewedAt(OffsetDateTime.now());
        review = reviewRepository.save(review);

        logAudit(actor, "Registration approved", "team", team.getId(),
                "{\"teamName\":\"" + escape(teamName) + "\",\"members\":" + savedUsers.size() + "}");

        return toDto(review);
    }

    public RegistrationReviewDto reject(Long id, ReviewDecisionRequest request, User actor) {
        RegistrationReview review = requireDecidable(id);
        review.setStatus("rejected");
        review.setAdminNote(request == null ? null : request.note());
        review.setReviewedBy(actor);
        review.setReviewedAt(OffsetDateTime.now());
        review = reviewRepository.save(review);
        logAudit(actor, "Registration rejected", "registration_review", review.getId(),
                noteJson(request));
        return toDto(review);
    }

    public RegistrationReviewDto requestFix(Long id, ReviewDecisionRequest request, User actor) {
        RegistrationReview review = requireDecidable(id);
        review.setStatus("needs_fix");
        review.setAdminNote(request == null ? null : request.note());
        review.setReviewedBy(actor);
        review.setReviewedAt(OffsetDateTime.now());
        review = reviewRepository.save(review);
        logAudit(actor, "Registration sent back for a fix", "registration_review", review.getId(),
                noteJson(request));
        return toDto(review);
    }

    /**
     * Puts a {@code rejected} or {@code needs_fix} row back to {@code awaiting_review}, for
     * when an admin changes their mind. Refuses an {@code approved} row on purpose — the team
     * already exists in {@code teams}, and reopening the review here would not undo that.
     */
    public RegistrationReviewDto reopen(Long id, User actor) {
        RegistrationReview review = reviewRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Registration review not found with id: " + id));
        if ("approved".equals(review.getStatus())) {
            throw new IllegalArgumentException(
                    "This team was already approved and imported; reopening it here would not undo that.");
        }
        review.setStatus("awaiting_review");
        review.setReviewedBy(actor);
        review.setReviewedAt(OffsetDateTime.now());
        review = reviewRepository.save(review);
        logAudit(actor, "Registration reopened for review", "registration_review",
                review.getId(), null);
        return toDto(review);
    }

    private RegistrationReview requireDecidable(Long id) {
        RegistrationReview review = reviewRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Registration review not found with id: " + id));
        if (!DECIDABLE_STATUSES.contains(review.getStatus())) {
            throw new IllegalArgumentException(
                    "This registration was already decided (status: " + review.getStatus()
                            + "). Reopen it first if you want to change that decision.");
        }
        return review;
    }

    private String validatedUrlOrNull(String value, String fullName, String what) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty() || isPlaceholder(trimmed)) {
            return null;
        }
        if (!URL.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(fullName + "'s " + what + " link is not a URL: '"
                    + trimmed + "' - it must start with http:// or https://, or be left blank.");
        }
        return trimmed;
    }

    private static boolean isPlaceholder(String val) {
        String lower = val.trim().toLowerCase(Locale.ROOT);
        return lower.equals("n/a") || lower.equals("na") || lower.equals("none")
                || lower.equals("nil") || lower.equals("-") || lower.equals("--")
                || lower.equals("null") || lower.equals("no") || lower.equals("n.a.")
                || lower.equals("n/a.");
    }

    private String mintJoinCode() {
        for (int attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt++) {
            StringBuilder code = new StringBuilder(JOIN_CODE_LENGTH);
            for (int i = 0; i < JOIN_CODE_LENGTH; i++) {
                code.append(JOIN_CODE_ALPHABET.charAt(random.nextInt(JOIN_CODE_ALPHABET.length())));
            }
            String candidate = code.toString();
            if (teamRepository.findByJoinCode(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new IllegalStateException("could not generate an unused join code in "
                + JOIN_CODE_ATTEMPTS + " attempts - this should be impossible");
    }

    private String noteJson(ReviewDecisionRequest request) {
        String note = request == null ? null : request.note();
        return note == null || note.isBlank() ? null : "{\"note\":\"" + escape(note) + "\"}";
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void logAudit(User actor, String action, String entityType, Long entityId, String details) {
        try {
            AuditLog logEntry = new AuditLog(action, entityType);
            logEntry.setActorUser(actor);
            logEntry.setEntityId(entityId);
            logEntry.setDetails(details);
            auditLogRepository.save(logEntry);
        } catch (Exception e) {
            log.warn("Failed to write audit log entry: {}", e.getMessage());
        }
    }

    private RegistrationReviewDto toDto(RegistrationReview review) {
        List<RegistrationReviewMemberDto> members = List.of();
        try {
            StoredPayload payload = objectMapper.readValue(review.getRawPayload(), StoredPayload.class);
            members = payload.members() == null ? List.of() : payload.members().stream()
                    .map(m -> new RegistrationReviewMemberDto(
                            m.block(), m.name(), m.email(), m.phone(), m.major(),
                            blankToNull(m.resume()), blankToNull(m.linkedin()), blankToNull(m.github())))
                    .toList();
        } catch (JacksonException e) {
            log.warn("Could not parse raw_payload for registration review {}: {}",
                    review.getId(), e.getMessage());
        }

        List<String> issues = List.of();
        try {
            issues = objectMapper.readValue(review.getIssues(),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        } catch (JacksonException e) {
            log.warn("Could not parse issues for registration review {}: {}",
                    review.getId(), e.getMessage());
        }

        String reviewedByName = review.getReviewedBy() == null ? null
                : (review.getReviewedBy().getFullName() != null
                        ? review.getReviewedBy().getFullName() : review.getReviewedBy().getEmail());

        return new RegistrationReviewDto(
                review.getId(),
                review.getTeamName(),
                members,
                issues,
                review.getStatus(),
                review.getAdminNote(),
                reviewedByName,
                review.getReviewedAt(),
                review.getCreatedAt(),
                review.getUpdatedAt());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** Mirrors the shape {@code FormRegistrationImporter.buildRawPayload} writes. */
    private record StoredMember(
            String block, String name, String email, String phone, String major,
            String resume, String linkedin, String github) {}

    private record StoredPayload(String teamName, List<StoredMember> members) {}
}
