package my.monash.hackathon.hackathon_website_backend.judging;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLog;
import my.monash.hackathon.hackathon_website_backend.audit.AuditLogRepository;
import my.monash.hackathon.hackathon_website_backend.judging.dto.CriterionScoreResponse;
import my.monash.hackathon.hackathon_website_backend.judging.dto.JudgeAssignmentResponse;
import my.monash.hackathon.hackathon_website_backend.judging.dto.JudgingCriterionDto;
import my.monash.hackathon.hackathon_website_backend.judging.dto.SaveReviewRequest;
import my.monash.hackathon.hackathon_website_backend.judging.dto.ScoreRequest;
import my.monash.hackathon.hackathon_website_backend.submission.Submission;
import my.monash.hackathon.hackathon_website_backend.submission.SubmissionRepository;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class JudgeBackendService {

    private static final Logger log = LoggerFactory.getLogger(JudgeBackendService.class);

    private final AssignmentRepository assignmentRepository;
    private final JudgingCriteriaRepository judgingCriteriaRepository;
    private final ScoreRepository scoreRepository;
    private final SubmissionRepository submissionRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final AuditLogRepository auditLogRepository;

    public JudgeBackendService(AssignmentRepository assignmentRepository,
                               JudgingCriteriaRepository judgingCriteriaRepository,
                               ScoreRepository scoreRepository,
                               SubmissionRepository submissionRepository,
                               TeamMemberRepository teamMemberRepository,
                               AuditLogRepository auditLogRepository) {
        this.assignmentRepository = assignmentRepository;
        this.judgingCriteriaRepository = judgingCriteriaRepository;
        this.scoreRepository = scoreRepository;
        this.submissionRepository = submissionRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional(readOnly = true)
    public List<JudgeAssignmentResponse> getAssignmentsForJudge(User judge) {
        if (judge == null) {
            throw new IllegalArgumentException("Authenticated judge is required.");
        }

        List<Assignment> assignments = assignmentRepository.findByJudgeId(judge.getId());
        List<JudgingCriteria> allCriteria = judgingCriteriaRepository.findAll();
        Map<Long, JudgingCriteria> criteriaMap = allCriteria.stream()
                .collect(Collectors.toMap(JudgingCriteria::getId, c -> c));

        List<JudgeAssignmentResponse> responses = new ArrayList<>();

        for (Assignment assignment : assignments) {
            Team team = assignment.getTeam();
            Submission submission = submissionRepository.findByTeamId(team.getId()).orElse(null);
            int memberCount = teamMemberRepository.findByTeamId(team.getId()).size();

            List<Score> scores = scoreRepository.findByAssignmentId(assignment.getId());
            List<CriterionScoreResponse> scoreResponses = scores.stream()
                    .map(score -> {
                        JudgingCriteria criterion = criteriaMap.get(score.getCriteria().getId());
                        String title = criterion != null ? criterion.getTitle() : "Criterion #" + score.getCriteria().getId();
                        String description = criterion != null && criterion.getDescription() != null ? criterion.getDescription() : "";
                        BigDecimal maxScore = score.getCriteriaMaxScoreSnapshot();
                        BigDecimal weight = score.getCriteriaWeightSnapshot();
                        return new CriterionScoreResponse(
                                score.getCriteria().getId(),
                                title,
                                description,
                                maxScore,
                                weight,
                                score.getScore(),
                                score.getComment() != null ? score.getComment() : "",
                                score.getCriteriaMaxScoreSnapshot(),
                                score.getCriteriaWeightSnapshot()
                        );
                    })
                    .toList();

            responses.add(new JudgeAssignmentResponse(
                    assignment.getId(),
                    team.getId(),
                    team.getName(),
                    submission != null ? submission.getProjectTitle() : "",
                    submission != null && submission.getTrackLabel() != null ? submission.getTrackLabel() : "",
                    submission != null && submission.getDescription() != null ? submission.getDescription() : "",
                    submission != null && submission.getGithubUrl() != null ? submission.getGithubUrl() : "",
                    submission != null && submission.getDeployedUrl() != null ? submission.getDeployedUrl() : "",
                    submission != null && submission.getSlideDeckUrl() != null ? submission.getSlideDeckUrl() : "",
                    submission != null && submission.getVideoDemoUrl() != null ? submission.getVideoDemoUrl() : "",
                    memberCount,
                    assignment.getStatus(),
                    assignment.getAssignedAt() != null ? assignment.getAssignedAt() : OffsetDateTime.now(),
                    assignment.getCompletedAt(),
                    assignment.getOverallFeedback() != null ? assignment.getOverallFeedback() : "",
                    scoreResponses
            ));
        }

        return responses;
    }

    @Transactional(readOnly = true)
    public List<JudgingCriterionDto> getActiveCriteria() {
        return judgingCriteriaRepository.findByIsActiveTrueOrderByDisplayOrder().stream()
                .map(c -> new JudgingCriterionDto(
                        c.getId(),
                        c.getTitle(),
                        c.getDescription() != null ? c.getDescription() : "",
                        c.getMaxScore(),
                        c.getWeight(),
                        c.getDisplayOrder(),
                        c.getIsActive()
                ))
                .toList();
    }

    public JudgeAssignmentResponse saveDraft(Long assignmentId, SaveReviewRequest request, User judge) {
        Assignment assignment = getVerifiedAssignment(assignmentId, judge);

        if ("declined".equalsIgnoreCase(assignment.getStatus())) {
            throw new IllegalArgumentException("You declined this assignment. An organiser can reassign it.");
        }

        if (request != null && request.overallFeedback() != null) {
            assignment.setOverallFeedback(request.overallFeedback().trim());
        }

        if ("pending".equalsIgnoreCase(assignment.getStatus())) {
            assignment.setStatus("in_progress");
        }

        assignment = assignmentRepository.save(assignment);

        if (request != null && request.scores() != null) {
            saveScores(assignment, request.scores(), false);
        }

        logAudit(judge, "Saved draft scores", "assignment", assignment.getId(),
                "{\"team\":\"" + assignment.getTeam().getName() + "\"}");

        return getSingleAssignmentResponse(assignment);
    }

    public JudgeAssignmentResponse completeReview(Long assignmentId, SaveReviewRequest request, User judge) {
        Assignment assignment = getVerifiedAssignment(assignmentId, judge);

        if ("declined".equalsIgnoreCase(assignment.getStatus())) {
            throw new IllegalArgumentException("You declined this assignment and cannot submit scores.");
        }

        List<JudgingCriteria> activeCriteria = judgingCriteriaRepository.findByIsActiveTrueOrderByDisplayOrder();
        if (request == null || request.scores() == null || request.scores().isEmpty()) {
            throw new IllegalArgumentException("All active rubric criteria must be scored.");
        }

        Map<Long, ScoreRequest> scoreMap = new HashMap<>();
        for (ScoreRequest sr : request.scores()) {
            if (sr != null && sr.criteriaId() != null && sr.score() != null) {
                scoreMap.put(sr.criteriaId(), sr);
            }
        }

        for (JudgingCriteria c : activeCriteria) {
            ScoreRequest sr = scoreMap.get(c.getId());
            if (sr == null || sr.score() == null) {
                throw new IllegalArgumentException("Score every criterion before submitting this review. Missing: " + c.getTitle());
            }
            if (sr.score().compareTo(BigDecimal.ZERO) < 0 || sr.score().compareTo(c.getMaxScore()) > 0) {
                throw new IllegalArgumentException(c.getTitle() + " score must be between 0 and " + c.getMaxScore());
            }
        }

        saveScores(assignment, request.scores(), true);

        if (request.overallFeedback() != null) {
            assignment.setOverallFeedback(request.overallFeedback().trim());
        }

        assignment.setStatus("completed");
        assignment.setCompletedAt(OffsetDateTime.now());
        assignment = assignmentRepository.save(assignment);

        logAudit(judge, "Submitted review", "assignment", assignment.getId(),
                "{\"team\":\"" + assignment.getTeam().getName() + "\"}");

        return getSingleAssignmentResponse(assignment);
    }

    public void declineAssignment(Long assignmentId, User judge) {
        Assignment assignment = getVerifiedAssignment(assignmentId, judge);

        if (!"pending".equalsIgnoreCase(assignment.getStatus())) {
            throw new IllegalArgumentException("You have already started or finished this review and cannot decline it.");
        }

        assignment.setStatus("declined");
        assignmentRepository.save(assignment);

        logAudit(judge, "Declined assignment", "assignment", assignment.getId(),
                "{\"team\":\"" + assignment.getTeam().getName() + "\"}");
    }

    private void saveScores(Assignment assignment, List<ScoreRequest> scoreRequests, boolean complete) {
        List<Score> existingScores = scoreRepository.findByAssignmentId(assignment.getId());
        Map<Long, Score> existingMap = existingScores.stream()
                .collect(Collectors.toMap(s -> s.getCriteria().getId(), s -> s));

        List<JudgingCriteria> criteriaList = judgingCriteriaRepository.findAll();
        Map<Long, JudgingCriteria> criteriaMap = criteriaList.stream()
                .collect(Collectors.toMap(JudgingCriteria::getId, c -> c));

        Set<Long> updatedCriteriaIds = scoreRequests.stream()
                .map(ScoreRequest::criteriaId)
                .collect(Collectors.toSet());

        for (ScoreRequest req : scoreRequests) {
            if (req.criteriaId() == null) continue;

            JudgingCriteria criterion = criteriaMap.get(req.criteriaId());
            if (criterion == null) {
                throw new IllegalArgumentException("Criterion id " + req.criteriaId() + " not found.");
            }

            Score existing = existingMap.get(req.criteriaId());

            if (req.score() == null) {
                if (existing != null && !complete) {
                    scoreRepository.delete(existing);
                }
                continue;
            }

            if (req.score().compareTo(BigDecimal.ZERO) < 0 || req.score().compareTo(criterion.getMaxScore()) > 0) {
                throw new IllegalArgumentException(criterion.getTitle() + " score must be between 0 and " + criterion.getMaxScore());
            }

            if (existing != null) {
                existing.setScore(req.score());
                existing.setComment(req.comment() != null ? req.comment().trim() : null);
                scoreRepository.save(existing);
            } else {
                Score newScore = new Score(assignment, criterion, req.score());
                newScore.setComment(req.comment() != null ? req.comment().trim() : null);
                scoreRepository.save(newScore);
            }
        }
    }

    private Assignment getVerifiedAssignment(Long assignmentId, User judge) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new IllegalArgumentException("Assignment not found with id: " + assignmentId));

        if (!assignment.getJudge().getId().equals(judge.getId())) {
            throw new IllegalArgumentException("This assignment does not belong to you.");
        }

        return assignment;
    }

    private JudgeAssignmentResponse getSingleAssignmentResponse(Assignment assignment) {
        Team team = assignment.getTeam();
        Submission submission = submissionRepository.findByTeamId(team.getId()).orElse(null);
        int memberCount = teamMemberRepository.findByTeamId(team.getId()).size();

        List<Score> scores = scoreRepository.findByAssignmentId(assignment.getId());
        List<JudgingCriteria> allCriteria = judgingCriteriaRepository.findAll();
        Map<Long, JudgingCriteria> criteriaMap = allCriteria.stream()
                .collect(Collectors.toMap(JudgingCriteria::getId, c -> c));

        List<CriterionScoreResponse> scoreResponses = scores.stream()
                .map(score -> {
                    JudgingCriteria criterion = criteriaMap.get(score.getCriteria().getId());
                    String title = criterion != null ? criterion.getTitle() : "Criterion #" + score.getCriteria().getId();
                    String description = criterion != null && criterion.getDescription() != null ? criterion.getDescription() : "";
                    return new CriterionScoreResponse(
                            score.getCriteria().getId(),
                            title,
                            description,
                            score.getCriteriaMaxScoreSnapshot(),
                            score.getCriteriaWeightSnapshot(),
                            score.getScore(),
                            score.getComment() != null ? score.getComment() : "",
                            score.getCriteriaMaxScoreSnapshot(),
                            score.getCriteriaWeightSnapshot()
                    );
                })
                .toList();

        return new JudgeAssignmentResponse(
                assignment.getId(),
                team.getId(),
                team.getName(),
                submission != null ? submission.getProjectTitle() : "",
                submission != null && submission.getTrackLabel() != null ? submission.getTrackLabel() : "",
                submission != null && submission.getDescription() != null ? submission.getDescription() : "",
                submission != null && submission.getGithubUrl() != null ? submission.getGithubUrl() : "",
                submission != null && submission.getDeployedUrl() != null ? submission.getDeployedUrl() : "",
                submission != null && submission.getSlideDeckUrl() != null ? submission.getSlideDeckUrl() : "",
                submission != null && submission.getVideoDemoUrl() != null ? submission.getVideoDemoUrl() : "",
                memberCount,
                assignment.getStatus(),
                assignment.getAssignedAt() != null ? assignment.getAssignedAt() : OffsetDateTime.now(),
                assignment.getCompletedAt(),
                assignment.getOverallFeedback() != null ? assignment.getOverallFeedback() : "",
                scoreResponses
        );
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
}
