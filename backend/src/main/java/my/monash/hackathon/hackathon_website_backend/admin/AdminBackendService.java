package my.monash.hackathon.hackathon_website_backend.admin;

import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminAssignmentDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminJudgeDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminOverviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminParticipantDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminStatsDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminTeamDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AuditLogDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.CreateAssignmentRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.UpdateTeamRequest;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLog;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLogRepository;
import my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Assignment;
import my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository;
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
    private static final String STUDENT_DOMAIN = "student.monash.edu";

    private final TeamRepository teamRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final UserRepository userRepository;
    private final SubmissionRepository submissionRepository;
    private final AssignmentRepository assignmentRepository;
    private final AuditLogRepository auditLogRepository;
    private final EventSettingsRepository eventSettingsRepository;

    public AdminBackendService(
            TeamRepository teamRepository,
            TeamMemberRepository teamMemberRepository,
            UserRepository userRepository,
            SubmissionRepository submissionRepository,
            AssignmentRepository assignmentRepository,
            AuditLogRepository auditLogRepository,
            EventSettingsRepository eventSettingsRepository) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.userRepository = userRepository;
        this.submissionRepository = submissionRepository;
        this.assignmentRepository = assignmentRepository;
        this.auditLogRepository = auditLogRepository;
        this.eventSettingsRepository = eventSettingsRepository;
    }

    @Transactional(readOnly = true)
    public AdminOverviewDto getOverview() {
        var teams = getTeams();
        var judges = getJudges();
        var allAssignments = assignmentRepository.findAll();

        long totalTeams = teams.size();
        long totalParticipants = teams.stream().mapToInt(AdminTeamDto::memberCount).sum();
        long submitted = teams.stream().filter(t -> "submitted".equalsIgnoreCase(t.submissionStatus())).count();
        long drafts = teams.stream().filter(t -> "draft".equalsIgnoreCase(t.submissionStatus())).count();
        long noSubmission = teams.stream().filter(t -> t.submissionStatus() == null).count();

        long reviewsCompleted = allAssignments.stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .count();
        long reviewsExpected = submitted * JUDGES_PER_TEAM;
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

        int minTeamSize = settingsOpt.map(s -> s.getMinTeamSize()).orElse(1);
        boolean judgingOpen = settingsOpt.map(s -> s.isJudgingOpen()).orElse(false);

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
                    ? JUDGES_PER_TEAM : 0;

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
        }

        teamRepository.save(team);
        return getTeams().stream().filter(t -> t.teamId() == teamId).findFirst().orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<AdminParticipantDto> getParticipants() {
        var allUsers = userRepository.findAll();
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

            boolean studentAddress = u.getEmail() != null && (u.getEmail().endsWith("@" + STUDENT_DOMAIN) || u.getEmail().contains(STUDENT_DOMAIN));
            String eligibility;
            if (!studentAddress) {
                eligibility = "not_student";
            } else {
                eligibility = u.isEmailVerified() ? "eligible" : "unverified";
            }

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

            boolean underAssigned = assignments.size() < JUDGES_PER_TEAM
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

    public AdminAssignmentDto.JudgeAssignmentInfo createAssignment(CreateAssignmentRequest request, User actor) {
        Team team = teamRepository.findById(request.teamId())
                .orElseThrow(() -> new IllegalArgumentException("Team not found: " + request.teamId()));
        User judge = userRepository.findById(request.judgeId())
                .orElseThrow(() -> new IllegalArgumentException("Judge not found: " + request.judgeId()));

        if (!"judge".equalsIgnoreCase(judge.getRole())) {
            throw new IllegalArgumentException("User " + judge.getEmail() + " does not have the judge role.");
        }

        List<Assignment> existing = assignmentRepository.findByTeamId(team.getId());
        boolean alreadyAssigned = existing.stream().anyMatch(a -> a.getJudge().getId().equals(judge.getId()));
        if (alreadyAssigned) {
            throw new IllegalArgumentException("Judge " + judge.getFullName() + " is already assigned to team " + team.getName());
        }

        Assignment assignment = new Assignment(team, judge, actor);
        assignment.setStatus("pending");
        Assignment saved = assignmentRepository.save(assignment);

        logAudit(actor, "Judge assigned", "judge", saved.getId(),
                "{\"target\":\"" + judge.getFullName() + " → " + team.getName() + "\"}");

        return new AdminAssignmentDto.JudgeAssignmentInfo(
                saved.getId(),
                team.getId(),
                judge.getId(),
                judge.getFullName() != null ? judge.getFullName() : judge.getEmail(),
                saved.getStatus(),
                saved.getAssignedAt() != null ? saved.getAssignedAt() : OffsetDateTime.now(),
                saved.getCompletedAt()
        );
    }

    public void deleteAssignment(Long assignmentId, User actor) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new IllegalArgumentException("Assignment not found with id: " + assignmentId));

        String judgeName = assignment.getJudge().getFullName() != null ? assignment.getJudge().getFullName() : assignment.getJudge().getEmail();
        String teamName = assignment.getTeam().getName();

        assignmentRepository.delete(assignment);
        logAudit(actor, "Judge unassigned", "judge", assignmentId,
                "{\"target\":\"" + judgeName + " → " + teamName + "\"}");
    }

    @Transactional(readOnly = true)
    public List<AuditLogDto> getAuditLogs() {
        return auditLogRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toAuditLogDto)
                .toList();
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
