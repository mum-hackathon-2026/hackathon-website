package my.monash.hackathon.hackathon_website_backend.admin;

import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminAssignmentDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminJudgeDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminOverviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminParticipantDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminResultDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminStatsDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminTeamDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AuditLogDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.BatchRegisterJudgesRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.CreateAssignmentRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.EventSettingsDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.RegisterJudgeRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.UpdateEventSettingsRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.UpdateTeamRequest;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLog;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLogRepository;
import my.monash.hackathon.hackathon_website_backend.event.EventSettings;
import my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Assignment;
import my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Score;
import my.monash.hackathon.hackathon_website_backend.judging.ScoreRepository;
import my.monash.hackathon.hackathon_website_backend.result.TeamResult;
import my.monash.hackathon.hackathon_website_backend.result.TeamResultRepository;
import my.monash.hackathon.hackathon_website_backend.submission.Submission;
import my.monash.hackathon.hackathon_website_backend.submission.SubmissionRepository;
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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class AdminBackendService {

    private static final Logger log = LoggerFactory.getLogger(AdminBackendService.class);
    private static final int JUDGES_PER_TEAM = 3;

    private final TeamRepository teamRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final UserRepository userRepository;
    private final SubmissionRepository submissionRepository;
    private final AssignmentRepository assignmentRepository;
    private final ScoreRepository scoreRepository;
    private final TeamResultRepository teamResultRepository;
    private final AuditLogRepository auditLogRepository;
    private final EventSettingsRepository eventSettingsRepository;

    public AdminBackendService(
            TeamRepository teamRepository,
            TeamMemberRepository teamMemberRepository,
            UserRepository userRepository,
            SubmissionRepository submissionRepository,
            AssignmentRepository assignmentRepository,
            ScoreRepository scoreRepository,
            TeamResultRepository teamResultRepository,
            AuditLogRepository auditLogRepository,
            EventSettingsRepository eventSettingsRepository) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.userRepository = userRepository;
        this.submissionRepository = submissionRepository;
        this.assignmentRepository = assignmentRepository;
        this.scoreRepository = scoreRepository;
        this.teamResultRepository = teamResultRepository;
        this.auditLogRepository = auditLogRepository;
        this.eventSettingsRepository = eventSettingsRepository;
    }

    @Transactional(readOnly = true)
    public AdminOverviewDto getOverview() {
        var teams = getTeams();
        var judges = getJudges();
        var allAssignments = assignmentRepository.findAll();
        int judgesPerTeam = eventSettingsRepository.findSingleton().map(EventSettings::getJudgesPerTeam).orElse(3);

        long totalTeams = teams.size();
        long totalParticipants = teams.stream().mapToInt(AdminTeamDto::memberCount).sum();
        long submitted = teams.stream().filter(t -> "submitted".equalsIgnoreCase(t.submissionStatus())).count();
        long drafts = teams.stream().filter(t -> "draft".equalsIgnoreCase(t.submissionStatus())).count();
        long noSubmission = teams.stream().filter(t -> t.submissionStatus() == null).count();

        long reviewsCompleted = allAssignments.stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .count();
        long reviewsExpected = submitted * judgesPerTeam;
        int percentJudged = reviewsExpected > 0 ? (int) Math.round(((double) reviewsCompleted / reviewsExpected) * 100) : 0;

        long needingAttention = teams.stream().filter(t -> !t.attention().isEmpty()).count();
        long activeTeams = teams.stream()
                .filter(t -> "forming".equalsIgnoreCase(t.status()) || "complete".equalsIgnoreCase(t.status()))
                .count();

        Map<Long, List<Assignment>> assignmentsByTeam = allAssignments.stream()
                .collect(Collectors.groupingBy(a -> a.getTeam().getId()));
        long unassignedTeams = teams.stream()
                .filter(t -> "submitted".equalsIgnoreCase(t.submissionStatus()))
                .filter(t -> assignmentsByTeam.getOrDefault(t.teamId(), List.of()).isEmpty())
                .count();

        var stats = new AdminStatsDto(
                totalTeams,
                totalParticipants,
                submitted,
                drafts,
                noSubmission,
                reviewsCompleted,
                reviewsExpected,
                percentJudged,
                needingAttention,
                activeTeams,
                judges.size(),
                unassignedTeams
        );

        var recentAudit = auditLogRepository.findAllByOrderByCreatedAtDesc().stream()
                .limit(10)
                .map(this::toAuditLogDto)
                .toList();

        return new AdminOverviewDto(stats, recentAudit);
    }

    @Transactional(readOnly = true)
    public List<AdminTeamDto> getTeams() {
        var allTeams = teamRepository.findAll();
        var allMembers = teamMemberRepository.findAll();
        var allSubmissions = submissionRepository.findAll();
        var allAssignments = assignmentRepository.findAll();
        var settingsOpt = eventSettingsRepository.findSingleton();

        int minTeamSize = settingsOpt.map(s -> s.getMinTeamSize()).orElse(2);
        boolean judgingOpen = settingsOpt.map(s -> s.isJudgingOpen()).orElse(false);
        int judgesPerTeam = settingsOpt.map(s -> s.getJudgesPerTeam()).orElse(3);

        Map<Long, List<TeamMember>> membersByTeam = allMembers.stream()
                .collect(Collectors.groupingBy(tm -> tm.getTeam().getId()));
        Map<Long, Submission> submissionsByTeam = allSubmissions.stream()
                .collect(Collectors.toMap(Submission::getTeamId, s -> s));
        Map<Long, List<Assignment>> assignmentsByTeam = allAssignments.stream()
                .collect(Collectors.groupingBy(a -> a.getTeam().getId()));

        List<AdminTeamDto> dtoList = new ArrayList<>();
        for (Team team : allTeams) {
            int memberCount = membersByTeam.getOrDefault(team.getId(), List.of()).size();
            Submission submission = submissionsByTeam.get(team.getId());
            List<Assignment> assignments = assignmentsByTeam.getOrDefault(team.getId(), List.of());

            int reviewsCompleted = (int) assignments.stream()
                    .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                    .count();
            int reviewsExpected = (submission != null && "submitted".equalsIgnoreCase(submission.getStatus()))
                    ? judgesPerTeam : 0;

            String submissionStatus = submission != null ? submission.getStatus() : null;
            String projectTitle = submission != null ? submission.getProjectTitle() : "";
            String trackLabel = submission != null && submission.getTrackLabel() != null ? submission.getTrackLabel() : "General";
            String githubUrl = submission != null && submission.getGithubUrl() != null ? submission.getGithubUrl() : "";
            String deployedUrl = submission != null && submission.getDeployedUrl() != null ? submission.getDeployedUrl() : "";
            OffsetDateTime submittedAt = submission != null ? submission.getSubmittedAt() : null;

            List<String> attention = new ArrayList<>();
            if (memberCount == 0) {
                attention.add("empty");
            } else if (memberCount < minTeamSize && !"withdrawn".equalsIgnoreCase(team.getStatus()) && !"disqualified".equalsIgnoreCase(team.getStatus())) {
                attention.add("undersized");
            }

            if (submission == null) {
                if (!"withdrawn".equalsIgnoreCase(team.getStatus()) && !"disqualified".equalsIgnoreCase(team.getStatus())) {
                    attention.add("no_submission");
                }
            } else if ("draft".equalsIgnoreCase(submission.getStatus())) {
                attention.add("draft_only");
            }

            if (judgingOpen && reviewsExpected > 0 && reviewsCompleted < reviewsExpected) {
                attention.add("unjudged");
            }

            dtoList.add(new AdminTeamDto(
                    team.getId(),
                    team.getName(),
                    team.getStatus(),
                    team.isShortlisted(),
                    memberCount,
                    submissionStatus,
                    projectTitle,
                    trackLabel,
                    reviewsCompleted,
                    reviewsExpected,
                    attention,
                    githubUrl,
                    deployedUrl,
                    submittedAt
            ));
        }

        return dtoList;
    }

    public AdminTeamDto updateTeam(Long teamId, UpdateTeamRequest request, User actor) {
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new IllegalArgumentException("Team not found with id: " + teamId));

        if (request.teamName() != null && !request.teamName().isBlank()) {
            String newName = request.teamName().trim();
            if (!newName.equalsIgnoreCase(team.getName())) {
                Optional<Team> existing = teamRepository.findByName(newName);
                if (existing.isPresent() && !existing.get().getId().equals(team.getId())) {
                    throw new IllegalArgumentException("Another team is already called: " + newName);
                }
                String oldName = team.getName();
                team.setName(newName);
                logAudit(actor, "Team renamed", "team", team.getId(), "{\"before\":\"" + oldName + "\",\"after\":\"" + newName + "\"}");
            }
        }

        if (request.status() != null && !request.status().isBlank()) {
            String newStatus = request.status().trim().toLowerCase();
            if (!newStatus.equals(team.getStatus())) {
                team.setStatus(newStatus);
                logAudit(actor, "Team status changed to " + newStatus, "team", team.getId(), "{\"status\":\"" + newStatus + "\"}");
            }
        }

        if (request.shortlisted() != null && request.shortlisted() != team.isShortlisted()) {
            team.setShortlisted(request.shortlisted());
            logAudit(actor, request.shortlisted() ? "Team shortlisted" : "Team removed from shortlist", "team", team.getId(), null);

            var trOpt = teamResultRepository.findById(team.getId());
            if (trOpt.isPresent()) {
                TeamResult tr = trOpt.get();
                tr.setOutcome(request.shortlisted() ? "finalist" : "participant");
                teamResultRepository.save(tr);
            }
        }

        teamRepository.save(team);
        return getTeams().stream().filter(t -> t.teamId() == teamId).findFirst().orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<AdminParticipantDto> getParticipants() {
        var allUsers = userRepository.findAll().stream()
                .filter(u -> !"admin".equalsIgnoreCase(u.getRole()) && !"judge".equalsIgnoreCase(u.getRole()))
                .toList();
        var allMembers = teamMemberRepository.findAll();
        var allTeams = teamRepository.findAll();

        Map<Long, Long> teamIdByUser = allMembers.stream()
                .collect(Collectors.toMap(TeamMember::getUserId, tm -> tm.getTeam().getId(), (a, b) -> a));
        Map<Long, String> teamNameById = allTeams.stream()
                .collect(Collectors.toMap(Team::getId, Team::getName));

        List<AdminParticipantDto> list = new ArrayList<>();
        for (User u : allUsers) {
            Long teamId = teamIdByUser.get(u.getId());
            String teamName = teamId != null ? teamNameById.getOrDefault(teamId, "") : "";

            String eligibility = u.isEmailVerified() ? "eligible" : "unverified";

            list.add(new AdminParticipantDto(
                    u.getId(),
                    u.getFullName() != null ? u.getFullName() : "",
                    u.getEmail(),
                    teamId,
                    teamName,
                    u.isEmailVerified(),
                    eligibility,
                    u.getRole(),
                    u.getPhone() != null ? u.getPhone() : "",
                    u.getGithubUrl() != null ? u.getGithubUrl() : "",
                    u.getLinkedinUrl() != null ? u.getLinkedinUrl() : "",
                    u.getResumeUrl() != null ? u.getResumeUrl() : ""
            ));
        }

        return list;
    }

    @Transactional(readOnly = true)
    public List<AdminJudgeDto> getJudges() {
        var judges = userRepository.findByRole("judge");
        var allAssignments = assignmentRepository.findAll();
        var allMembers = teamMemberRepository.findAll();
        var allTeams = teamRepository.findAll();

        Map<Long, List<Assignment>> assignmentsByJudge = allAssignments.stream()
                .collect(Collectors.groupingBy(a -> a.getJudge().getId()));
        Map<Long, Long> teamIdByUser = allMembers.stream()
                .collect(Collectors.toMap(TeamMember::getUserId, tm -> tm.getTeam().getId(), (a, b) -> a));
        Map<Long, String> teamNameById = allTeams.stream()
                .collect(Collectors.toMap(Team::getId, Team::getName));

        List<AdminJudgeDto> dtoList = new ArrayList<>();
        for (User j : judges) {
            List<Assignment> assignedList = assignmentsByJudge.getOrDefault(j.getId(), List.of());
            int completed = (int) assignedList.stream()
                    .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                    .count();

            Long compTeamId = teamIdByUser.get(j.getId());
            String competingTeam = compTeamId != null ? teamNameById.getOrDefault(compTeamId, "") : "";

            dtoList.add(new AdminJudgeDto(
                    j.getId(),
                    j.getFullName() != null ? j.getFullName() : j.getEmail(),
                    j.getEmail(),
                    assignedList.size(),
                    completed,
                    competingTeam
            ));
        }

        return dtoList;
    }

    public AdminJudgeDto registerJudge(RegisterJudgeRequest request, User actor) {
        if (request == null || request.email() == null || request.email().isBlank()) {
            throw new IllegalArgumentException("Email is required for judge registration.");
        }
        if (request.fullName() == null || request.fullName().isBlank()) {
            throw new IllegalArgumentException("Full name is required for judge registration.");
        }

        String email = request.email().trim().toLowerCase();
        String fullName = request.fullName().trim();

        User user = userRepository.findByEmail(email).orElse(null);
        if (user != null) {
            if ("admin".equalsIgnoreCase(user.getRole())) {
                throw new IllegalArgumentException("User " + email + " is an administrator and cannot be registered as a judge.");
            }
            user.setFullName(fullName);
            user.setRole("judge");
            user.setEmailVerified(true);
            user = userRepository.save(user);
            logAudit(actor, "Added to judging panel", "judge", user.getId(),
                    "{\"name\":\"" + user.getFullName() + "\",\"email\":\"" + user.getEmail() + "\"}");
        } else {
            user = new User(null, email, fullName);
            user.setRole("judge");
            user.setEmailVerified(true);
            user = userRepository.save(user);
            logAudit(actor, "Added to judging panel", "judge", user.getId(),
                    "{\"name\":\"" + user.getFullName() + "\",\"email\":\"" + user.getEmail() + "\"}");
        }

        var allAssignments = assignmentRepository.findByJudgeId(user.getId());
        int completed = (int) allAssignments.stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .count();

        return new AdminJudgeDto(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                allAssignments.size(),
                completed,
                ""
        );
    }

    public List<AdminJudgeDto> batchRegisterJudges(List<RegisterJudgeRequest> requests, User actor) {
        if (requests == null || requests.isEmpty()) {
            throw new IllegalArgumentException("Judge list cannot be empty.");
        }
        List<AdminJudgeDto> results = new ArrayList<>();
        for (RegisterJudgeRequest req : requests) {
            if (req != null && req.email() != null && !req.email().isBlank()
                    && req.fullName() != null && !req.fullName().isBlank()) {
                results.add(registerJudge(req, actor));
            }
        }
        return results;
    }

    public void promoteToJudge(Long userId, User actor) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found with id: " + userId));
        user.setRole("judge");
        userRepository.save(user);
        logAudit(actor, "Added to judging panel", "judge", user.getId(), "{\"name\":\"" + user.getFullName() + "\"}");
    }

    public void demoteJudge(Long userId, User actor) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found with id: " + userId));

        var assignments = assignmentRepository.findByJudgeId(userId);
        if (!assignments.isEmpty()) {
            throw new IllegalArgumentException("Judge " + (user.getFullName() != null ? user.getFullName() : user.getEmail())
                    + " still has " + assignments.size() + " assigned team(s). Reassign them first.");
        }

        user.setRole("participant");
        userRepository.save(user);
        logAudit(actor, "Judge removed from panel", "judge", user.getId(), "{\"name\":\"" + user.getFullName() + "\"}");
    }

    @Transactional(readOnly = true)
    public List<AdminAssignmentDto> getAssignments() {
        var allTeams = teamRepository.findAll();
        var allSubmissions = submissionRepository.findAll();
        var allAssignments = assignmentRepository.findAll();

        Map<Long, Submission> submissionsByTeam = allSubmissions.stream()
                .collect(Collectors.toMap(Submission::getTeamId, s -> s));
        Map<Long, List<Assignment>> assignmentsByTeam = allAssignments.stream()
                .collect(Collectors.groupingBy(a -> a.getTeam().getId()));

        List<AdminAssignmentDto> list = new ArrayList<>();
        for (Team t : allTeams) {
            Submission sub = submissionsByTeam.get(t.getId());
            if (sub == null) {
                continue; // only teams with submissions appear in judging assignment panel
            }

            List<Assignment> assignments = assignmentsByTeam.getOrDefault(t.getId(), List.of());
            List<AdminAssignmentDto.JudgeAssignmentInfo> judgeInfos = assignments.stream()
                    .map(a -> new AdminAssignmentDto.JudgeAssignmentInfo(
                            a.getId(),
                            t.getId(),
                            a.getJudge().getId(),
                            a.getJudge().getFullName() != null ? a.getJudge().getFullName() : a.getJudge().getEmail(),
                            a.getStatus(),
                            a.getAssignedAt(),
                            a.getCompletedAt()
                    ))
                    .toList();

            int judgesPerTeam = eventSettingsRepository.findSingleton().map(EventSettings::getJudgesPerTeam).orElse(3);
            boolean underAssigned = assignments.size() < judgesPerTeam
                    && !"withdrawn".equalsIgnoreCase(t.getStatus())
                    && !"disqualified".equalsIgnoreCase(t.getStatus());

            list.add(new AdminAssignmentDto(
                    t.getId(),
                    t.getName(),
                    sub.getTrackLabel() != null ? sub.getTrackLabel() : "General",
                    t.getStatus(),
                    true,
                    judgeInfos,
                    underAssigned
            ));
        }

        return list;
    }

    public AdminAssignmentDto createAssignment(CreateAssignmentRequest request, User actor) {
        Team team = teamRepository.findById(request.teamId())
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));
        User judge = userRepository.findById(request.judgeId())
                .orElseThrow(() -> new IllegalArgumentException("Judge not found"));

        if (!"judge".equalsIgnoreCase(judge.getRole())) {
            throw new IllegalArgumentException("User is not a judge");
        }

        if (assignmentRepository.findByJudgeIdAndTeamId(judge.getId(), team.getId()).isPresent()) {
            throw new IllegalArgumentException("Judge is already assigned to this team");
        }

        Assignment assignment = new Assignment(team, judge, actor);
        assignmentRepository.save(assignment);

        String judgeName = judge.getFullName() != null ? judge.getFullName() : judge.getEmail();
        logAudit(actor, "Judge assigned", "judge", assignment.getId(),
                "{\"target\":\"" + judgeName + " → " + team.getName() + "\"}");

        var allAssignments = assignmentRepository.findByTeamId(team.getId());
        List<AdminAssignmentDto.JudgeAssignmentInfo> judgeInfos = allAssignments.stream()
                .map(a -> new AdminAssignmentDto.JudgeAssignmentInfo(
                        a.getId(),
                        team.getId(),
                        a.getJudge().getId(),
                        a.getJudge().getFullName() != null ? a.getJudge().getFullName() : a.getJudge().getEmail(),
                        a.getStatus(),
                        a.getAssignedAt(),
                        a.getCompletedAt()
                ))
                .toList();

        Submission sub = submissionRepository.findByTeamId(team.getId()).orElse(null);
        int judgesPerTeam = eventSettingsRepository.findSingleton().map(EventSettings::getJudgesPerTeam).orElse(3);
        boolean underAssigned = allAssignments.size() < judgesPerTeam
                && !"withdrawn".equalsIgnoreCase(team.getStatus())
                && !"disqualified".equalsIgnoreCase(team.getStatus());

        return new AdminAssignmentDto(
                team.getId(),
                team.getName(),
                sub != null && sub.getTrackLabel() != null ? sub.getTrackLabel() : "General",
                team.getStatus(),
                sub != null,
                judgeInfos,
                underAssigned
        );
    }

    public void deleteAssignment(Long assignmentId, User actor) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new IllegalArgumentException("Assignment not found"));

        String judgeName = assignment.getJudge().getFullName() != null
                ? assignment.getJudge().getFullName() : assignment.getJudge().getEmail();
        String teamName = assignment.getTeam().getName();

        assignmentRepository.delete(assignment);
        logAudit(actor, "Judge unassigned", "judge", assignmentId,
                "{\"target\":\"" + judgeName + " → " + teamName + "\"}");
    }

    @Transactional(readOnly = true)
    public EventSettingsDto getSettings() {
        EventSettings settings = eventSettingsRepository.findSingleton()
                .orElseGet(() -> eventSettingsRepository.save(new EventSettings("Monash University Malaysia Hackathon")));
        return toEventSettingsDto(settings);
    }

    public EventSettingsDto updateSettings(UpdateEventSettingsRequest request, User actor) {
        EventSettings settings = eventSettingsRepository.findSingleton()
                .orElseGet(() -> new EventSettings("Monash University Malaysia Hackathon"));

        if (request.eventName() != null) {
            String name = request.eventName().trim();
            if (name.isEmpty()) {
                throw new IllegalArgumentException("The event needs a name.");
            }
            if (name.length() > 200) {
                throw new IllegalArgumentException("Event names cap at 200 characters.");
            }
            settings.setEventName(name);
        }

        if (request.minTeamSize() != null) {
            if (request.minTeamSize() < 1) {
                throw new IllegalArgumentException("The minimum team size must be at least 1.");
            }
            settings.setMinTeamSize(request.minTeamSize());
        }

        if (request.maxTeamSize() != null) {
            if (request.maxTeamSize() < settings.getMinTeamSize()) {
                throw new IllegalArgumentException("The maximum team size cannot be below the minimum.");
            }
            settings.setMaxTeamSize(request.maxTeamSize());
        }

        if (request.judgesPerTeam() != null) {
            if (request.judgesPerTeam() < 1 || request.judgesPerTeam() > 10) {
                throw new IllegalArgumentException("Judges per team must be between 1 and 10.");
            }
            settings.setJudgesPerTeam(request.judgesPerTeam());
        }

        // Validate min/max team size pair
        if (settings.getMinTeamSize() > settings.getMaxTeamSize()) {
            throw new IllegalArgumentException("The minimum team size cannot exceed the maximum team size.");
        }

        // Registration windows
        if (request.registrationOpensAt() != null || request.registrationClosesAt() != null) {
            OffsetDateTime opens = request.registrationOpensAt() != null ? request.registrationOpensAt() : settings.getRegistrationOpensAt();
            OffsetDateTime closes = request.registrationClosesAt() != null ? request.registrationClosesAt() : settings.getRegistrationClosesAt();

            if (opens != null && closes != null && !closes.isAfter(opens)) {
                throw new IllegalArgumentException("Registration has to close after it opens.");
            }
        }

        if (request.registrationOpensAt() != null) {
            settings.setRegistrationOpensAt(request.registrationOpensAt());
        }
        if (request.registrationClosesAt() != null) {
            settings.setRegistrationClosesAt(request.registrationClosesAt());
        }
        if (request.submissionDeadlineAt() != null) {
            settings.setSubmissionDeadlineAt(request.submissionDeadlineAt());
        }
        if (request.resultsPublishedAt() != null) {
            settings.setResultsPublishedAt(request.resultsPublishedAt());
        }
        if (request.judgingOpen() != null) {
            settings.setJudgingOpen(request.judgingOpen());
        }
        if (request.screeningEnabled() != null) {
            settings.setScreeningEnabled(request.screeningEnabled());
        }

        if (actor != null) {
            settings.setUpdatedBy(actor);
        }

        settings = eventSettingsRepository.save(settings);

        logAudit(actor, "Event settings changed", "settings", settings.getId(),
                "{\"target\":\"Event settings\"}");

        return toEventSettingsDto(settings);
    }

    private EventSettingsDto toEventSettingsDto(EventSettings s) {
        String updatedByName = s.getUpdatedBy() != null
                ? (s.getUpdatedBy().getFullName() != null ? s.getUpdatedBy().getFullName() : s.getUpdatedBy().getEmail())
                : null;

        return new EventSettingsDto(
                s.getId(),
                s.getEventName(),
                s.getRegistrationOpensAt(),
                s.getRegistrationClosesAt(),
                s.getSubmissionDeadlineAt(),
                s.getResultsPublishedAt(),
                s.isJudgingOpen(),
                s.getMinTeamSize(),
                s.getMaxTeamSize(),
                s.isScreeningEnabled(),
                s.getJudgesPerTeam(),
                updatedByName
        );
    }

    @Transactional(readOnly = true)
    public List<AuditLogDto> getAuditLogs() {
        return auditLogRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toAuditLogDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AdminResultDto> getResults() {
        var teams = teamRepository.findAll();
        var allSubmissions = submissionRepository.findAll().stream()
                .collect(Collectors.toMap(s -> s.getTeam().getId(), s -> s));
        var allAssignments = assignmentRepository.findAll();
        var completedAssignments = allAssignments.stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .toList();

        List<Long> completedIds = completedAssignments.stream().map(Assignment::getId).toList();
        Map<Long, List<Score>> scoresByAssignment = completedIds.isEmpty() ? Collections.emptyMap() :
                scoreRepository.findByAssignmentIdIn(completedIds).stream()
                        .collect(Collectors.groupingBy(s -> s.getAssignment().getId()));

        Map<Long, List<Assignment>> completedByTeam = completedAssignments.stream()
                .collect(Collectors.groupingBy(a -> a.getTeam().getId()));

        Map<Long, TeamResult> savedResults = teamResultRepository.findAll().stream()
                .collect(Collectors.toMap(TeamResult::getTeamId, r -> r));

        int judgesPerTeam = eventSettingsRepository.findSingleton()
                .map(EventSettings::getJudgesPerTeam)
                .orElse(JUDGES_PER_TEAM);

        class ScoredTeam {
            final Team team;
            final Submission submission;
            final BigDecimal finalScore;
            final int judgeCount;
            final TeamResult savedResult;

            ScoredTeam(Team team, Submission submission, BigDecimal finalScore, int judgeCount, TeamResult savedResult) {
                this.team = team;
                this.submission = submission;
                this.finalScore = finalScore;
                this.judgeCount = judgeCount;
                this.savedResult = savedResult;
            }
        }

        List<ScoredTeam> scoredTeams = new ArrayList<>();
        for (Team team : teams) {
            Submission submission = allSubmissions.get(team.getId());
            TeamResult saved = savedResults.get(team.getId());
            List<Assignment> teamCompleted = completedByTeam.getOrDefault(team.getId(), Collections.emptyList());

            BigDecimal computedScore = null;
            if (!teamCompleted.isEmpty()) {
                BigDecimal sumOfJudges = BigDecimal.ZERO;
                int validJudgeCount = 0;
                for (Assignment a : teamCompleted) {
                    List<Score> aScores = scoresByAssignment.getOrDefault(a.getId(), Collections.emptyList());
                    if (!aScores.isEmpty()) {
                        BigDecimal aTotal = aScores.stream()
                                .map(Score::getScore)
                                .reduce(BigDecimal.ZERO, BigDecimal::add);
                        sumOfJudges = sumOfJudges.add(aTotal);
                        validJudgeCount++;
                    }
                }
                if (validJudgeCount > 0) {
                    computedScore = sumOfJudges.divide(BigDecimal.valueOf(validJudgeCount), 2, RoundingMode.HALF_UP);
                }
            }

            BigDecimal scoreToUse = (saved != null && saved.getFinalScore() != null) ? saved.getFinalScore() : computedScore;
            int judgeCountToUse = (saved != null && saved.getJudgeCount() > 0) ? saved.getJudgeCount() : teamCompleted.size();

            scoredTeams.add(new ScoredTeam(team, submission, scoreToUse, judgeCountToUse, saved));
        }

        scoredTeams.sort((a, b) -> {
            if (a.finalScore == null && b.finalScore == null) return Long.compare(a.team.getId(), b.team.getId());
            if (a.finalScore == null) return 1;
            if (b.finalScore == null) return -1;
            int cmp = b.finalScore.compareTo(a.finalScore);
            if (cmp != 0) return cmp;
            return Long.compare(a.team.getId(), b.team.getId());
        });

        List<AdminResultDto> resultList = new ArrayList<>();
        for (int i = 0; i < scoredTeams.size(); i++) {
            ScoredTeam st = scoredTeams.get(i);
            Integer rank = null;
            boolean tied = false;

            if (st.finalScore != null) {
                if (i > 0 && scoredTeams.get(i - 1).finalScore != null &&
                        st.finalScore.compareTo(scoredTeams.get(i - 1).finalScore) == 0) {
                    rank = resultList.get(i - 1).rank();
                    tied = true;
                } else {
                    rank = i + 1;
                }
            }

            if (st.finalScore != null && i + 1 < scoredTeams.size() &&
                    scoredTeams.get(i + 1).finalScore != null &&
                    st.finalScore.compareTo(scoredTeams.get(i + 1).finalScore) == 0) {
                tied = true;
            }

            String outcome = null;
            if ("disqualified".equalsIgnoreCase(st.team.getStatus())) {
                outcome = "disqualified";
            } else if (st.team.isShortlisted()) {
                outcome = "finalist";
            } else if (rank != null) {
                outcome = (rank <= 10) ? "finalist" : "participant";
            }

            List<String> issues = new ArrayList<>();
            if (st.submission == null || !"submitted".equalsIgnoreCase(st.submission.getStatus())) {
                issues.add("not_submitted");
            }
            if ("withdrawn".equalsIgnoreCase(st.team.getStatus()) || "disqualified".equalsIgnoreCase(st.team.getStatus())) {
                issues.add("settled");
            }
            if (st.submission != null && "submitted".equalsIgnoreCase(st.submission.getStatus()) && st.judgeCount < judgesPerTeam) {
                issues.add("under_reviewed");
            }

            String projectTitle = st.submission != null && st.submission.getProjectTitle() != null ? st.submission.getProjectTitle() : "";
            String trackLabel = st.submission != null && st.submission.getTrackLabel() != null ? st.submission.getTrackLabel() : "General";
            String subStatus = st.submission != null ? st.submission.getStatus() : null;
            OffsetDateTime pubAt = st.savedResult != null ? st.savedResult.getPublishedAt() : null;

            resultList.add(new AdminResultDto(
                    st.team.getId(),
                    st.team.getName(),
                    projectTitle,
                    trackLabel,
                    st.finalScore,
                    rank,
                    outcome,
                    st.judgeCount,
                    tied,
                    st.team.isShortlisted(),
                    st.team.getStatus(),
                    subStatus,
                    pubAt,
                    issues
            ));
        }

        return resultList;
    }

    public List<AdminResultDto> publishResults(User currentUser) {
        var results = getResults();
        var scoredResults = results.stream().filter(r -> r.finalScore() != null).toList();
        if (scoredResults.isEmpty()) {
            throw new IllegalArgumentException("No team has a score yet, so there is nothing to publish.");
        }

        OffsetDateTime now = OffsetDateTime.now();

        for (AdminResultDto dto : scoredResults) {
            Team team = teamRepository.findById(dto.teamId())
                    .orElseThrow(() -> new IllegalArgumentException("Team not found: " + dto.teamId()));
            TeamResult result = teamResultRepository.findById(team.getId())
                    .orElseGet(() -> new TeamResult(team));
            result.setFinalScore(dto.finalScore());
            result.setRank(dto.rank());
            result.setOutcome(dto.outcome());
            result.setJudgeCount(dto.judgeCount());
            result.setPublishedAt(now);
            teamResultRepository.save(result);
        }

        EventSettings settings = eventSettingsRepository.findSingleton()
                .orElseGet(() -> new EventSettings("Averis Hackathon 2026"));
        settings.setResultsPublishedAt(now);
        eventSettingsRepository.save(settings);

        logAudit(currentUser, "Results published", "result", 1L, "{\"target\":\"" + scoredResults.size() + " teams\"}");

        return getResults();
    }

    public void unpublishResults(User currentUser) {
        List<TeamResult> allResults = teamResultRepository.findAll();
        for (TeamResult tr : allResults) {
            tr.setPublishedAt(null);
            teamResultRepository.save(tr);
        }

        EventSettings settings = eventSettingsRepository.findSingleton()
                .orElseGet(() -> new EventSettings("Averis Hackathon 2026"));
        settings.setResultsPublishedAt(null);
        eventSettingsRepository.save(settings);

        logAudit(currentUser, "Results unpublished", "result", 1L, "{\"target\":\"Event results\"}");
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

    private AuditLogDto toAuditLogDto(AuditLog al) {
        String actorName = al.getActorUser() != null
                ? (al.getActorUser().getFullName() != null ? al.getActorUser().getFullName() : al.getActorUser().getEmail())
                : "System";

        String target = "ID #" + al.getEntityId();
        if (al.getDetails() != null && al.getDetails().contains("\"target\":")) {
            try {
                int start = al.getDetails().indexOf("\"target\":\"") + 10;
                int end = al.getDetails().indexOf("\"", start);
                if (start >= 10 && end > start) {
                    target = al.getDetails().substring(start, end);
                }
            } catch (Exception ignored) {}
        }

        return new AuditLogDto(
                al.getId(),
                al.getEntityType(),
                al.getAction(),
                target,
                actorName,
                al.getCreatedAt() != null ? al.getCreatedAt() : OffsetDateTime.now()
        );
    }
}
