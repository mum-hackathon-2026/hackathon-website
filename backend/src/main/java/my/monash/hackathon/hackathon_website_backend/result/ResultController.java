package my.monash.hackathon.hackathon_website_backend.result;

import my.monash.hackathon.hackathon_website_backend.event.EventSettings;
import my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Assignment;
import my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository;
import my.monash.hackathon.hackathon_website_backend.judging.JudgingCriteria;
import my.monash.hackathon.hackathon_website_backend.judging.JudgingCriteriaRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Score;
import my.monash.hackathon.hackathon_website_backend.judging.ScoreRepository;
import my.monash.hackathon.hackathon_website_backend.result.dto.CriterionResultDto;
import my.monash.hackathon.hackathon_website_backend.result.dto.JudgeScoreDto;
import my.monash.hackathon.hackathon_website_backend.result.dto.JudgeReviewDto;
import my.monash.hackathon.hackathon_website_backend.result.dto.MyDetailedResultDto;
import my.monash.hackathon.hackathon_website_backend.result.dto.PublicTeamResultDto;
import my.monash.hackathon.hackathon_website_backend.submission.Submission;
import my.monash.hackathon.hackathon_website_backend.submission.SubmissionRepository;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamMember;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/results")
public class ResultController {

    private final TeamResultRepository teamResultRepository;
    private final SubmissionRepository submissionRepository;
    private final EventSettingsRepository eventSettingsRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final AssignmentRepository assignmentRepository;
    private final ScoreRepository scoreRepository;
    private final JudgingCriteriaRepository judgingCriteriaRepository;

    public ResultController(
            TeamResultRepository teamResultRepository,
            SubmissionRepository submissionRepository,
            EventSettingsRepository eventSettingsRepository,
            TeamMemberRepository teamMemberRepository,
            AssignmentRepository assignmentRepository,
            ScoreRepository scoreRepository,
            JudgingCriteriaRepository judgingCriteriaRepository) {
        this.teamResultRepository = teamResultRepository;
        this.submissionRepository = submissionRepository;
        this.eventSettingsRepository = eventSettingsRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.assignmentRepository = assignmentRepository;
        this.scoreRepository = scoreRepository;
        this.judgingCriteriaRepository = judgingCriteriaRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<PublicTeamResultDto>> getPublicResults(@AuthenticationPrincipal User currentUser) {
        EventSettings settings = eventSettingsRepository.findSingleton().orElse(null);
        boolean isPrivileged = currentUser != null && ("admin".equalsIgnoreCase(currentUser.getRole()) || "judge".equalsIgnoreCase(currentUser.getRole()));

        if (!isPrivileged && (settings == null || settings.getResultsPublishedAt() == null)) {
            return ResponseEntity.ok(List.of());
        }

        var allSubmissions = submissionRepository.findAll().stream()
                .collect(Collectors.toMap(s -> s.getTeam().getId(), s -> s));
        var allAssignments = assignmentRepository.findAll();
        var completedAssignments = allAssignments.stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .toList();

        List<Long> completedIds = completedAssignments.stream().map(Assignment::getId).toList();
        Map<Long, List<Score>> scoresByAssignment = completedIds.isEmpty() ? Map.of() :
                scoreRepository.findByAssignmentIdIn(completedIds).stream()
                        .collect(Collectors.groupingBy(s -> s.getAssignment().getId()));

        Map<Long, List<Assignment>> completedByTeam = completedAssignments.stream()
                .collect(Collectors.groupingBy(a -> a.getTeam().getId()));

        List<TeamResult> allSavedResults = teamResultRepository.findAll();
        Map<Long, TeamResult> savedResults = allSavedResults.stream()
                .collect(Collectors.toMap(TeamResult::getTeamId, r -> r));

        Map<Long, String> teamNames = new HashMap<>();
        for (TeamResult tr : allSavedResults) {
            if (tr.getTeam() != null) teamNames.put(tr.getTeamId(), tr.getTeam().getName());
        }
        for (Submission sub : allSubmissions.values()) {
            if (sub.getTeam() != null) teamNames.put(sub.getTeam().getId(), sub.getTeam().getName());
        }
        for (Assignment a : allAssignments) {
            if (a.getTeam() != null) teamNames.put(a.getTeam().getId(), a.getTeam().getName());
        }

        class TeamScoreRow {
            final Long teamId;
            final String teamName;
            final Submission submission;
            final BigDecimal finalScore;
            final int judgeCount;
            final TeamResult savedResult;

            TeamScoreRow(Long teamId, String teamName, Submission submission, BigDecimal finalScore, int judgeCount, TeamResult savedResult) {
                this.teamId = teamId;
                this.teamName = teamName;
                this.submission = submission;
                this.finalScore = finalScore;
                this.judgeCount = judgeCount;
                this.savedResult = savedResult;
            }
        }

        List<TeamScoreRow> rows = new ArrayList<>();
        for (Map.Entry<Long, String> entry : teamNames.entrySet()) {
            Long teamId = entry.getKey();
            String teamName = entry.getValue();
            Submission submission = allSubmissions.get(teamId);
            TeamResult saved = savedResults.get(teamId);
            List<Assignment> teamCompleted = completedByTeam.getOrDefault(teamId, List.of());

            BigDecimal computedScore = null;
            if (!teamCompleted.isEmpty()) {
                BigDecimal sumOfJudges = BigDecimal.ZERO;
                int validJudgeCount = 0;
                for (Assignment a : teamCompleted) {
                    List<Score> aScores = scoresByAssignment.getOrDefault(a.getId(), List.of());
                    if (!aScores.isEmpty()) {
                        BigDecimal aTotal = aScores.stream()
                                .map(s -> {
                                    if (s.getScore() == null || s.getCriteriaMaxScoreSnapshot() == null || s.getCriteriaWeightSnapshot() == null) return BigDecimal.ZERO;
                                    if (s.getCriteriaMaxScoreSnapshot().compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
                                    return s.getScore().divide(s.getCriteriaMaxScoreSnapshot(), 4, RoundingMode.HALF_UP).multiply(s.getCriteriaWeightSnapshot());
                                })
                                .reduce(BigDecimal.ZERO, BigDecimal::add);
                        sumOfJudges = sumOfJudges.add(aTotal);
                        validJudgeCount++;
                    }
                }
                if (validJudgeCount > 0) {
                    computedScore = sumOfJudges.divide(BigDecimal.valueOf(validJudgeCount), 2, RoundingMode.HALF_UP);
                }
            }

            BigDecimal finalScoreToUse = computedScore != null ? computedScore : (saved != null ? saved.getFinalScore() : null);
            int judgeCountToUse = !teamCompleted.isEmpty() ? teamCompleted.size() : (saved != null ? saved.getJudgeCount() : 0);

            if (finalScoreToUse != null || isPrivileged) {
                rows.add(new TeamScoreRow(teamId, teamName, submission, finalScoreToUse, judgeCountToUse, saved));
            }
        }

        rows.sort((a, b) -> {
            if (a.finalScore == null && b.finalScore == null) return Long.compare(a.teamId, b.teamId);
            if (a.finalScore == null) return 1;
            if (b.finalScore == null) return -1;
            int cmp = b.finalScore.compareTo(a.finalScore);
            if (cmp != 0) return cmp;
            return Long.compare(a.teamId, b.teamId);
        });

        List<PublicTeamResultDto> dtoList = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            TeamScoreRow st = rows.get(i);
            Integer rank = null;
            boolean tied = false;

            if (st.finalScore != null) {
                if (i > 0 && rows.get(i - 1).finalScore != null &&
                        st.finalScore.compareTo(rows.get(i - 1).finalScore) == 0) {
                    rank = dtoList.get(i - 1).rank();
                    tied = true;
                } else {
                    rank = i + 1;
                }
            }

            if (st.finalScore != null && i + 1 < rows.size() &&
                    rows.get(i + 1).finalScore != null &&
                    st.finalScore.compareTo(rows.get(i + 1).finalScore) == 0) {
                tied = true;
            }

            String projectTitle = st.submission != null && st.submission.getProjectTitle() != null ? st.submission.getProjectTitle() : "";
            String trackLabel = st.submission != null && st.submission.getTrackLabel() != null ? st.submission.getTrackLabel() : "Open Innovation";
            boolean isShortlisted = (st.savedResult != null && st.savedResult.getTeam() != null && st.savedResult.getTeam().isShortlisted()) ||
                    (st.submission != null && st.submission.getTeam() != null && st.submission.getTeam().isShortlisted());
            String outcome = isShortlisted ? "finalist" : ((st.savedResult != null && st.savedResult.getOutcome() != null) ? st.savedResult.getOutcome() : "participant");

            dtoList.add(new PublicTeamResultDto(
                    st.teamId,
                    st.teamName,
                    projectTitle,
                    trackLabel,
                    st.finalScore,
                    rank,
                    outcome,
                    st.judgeCount,
                    tied
            ));
        }

        return ResponseEntity.ok(dtoList);
    }

    @GetMapping("/my")
    @Transactional(readOnly = true)
    public ResponseEntity<MyDetailedResultDto> getMyDetailedResult(@AuthenticationPrincipal User currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EventSettings settings = eventSettingsRepository.findSingleton().orElse(null);
        if (settings == null || settings.getResultsPublishedAt() == null) {
            return ResponseEntity.noContent().build();
        }

        var memberOpt = teamMemberRepository.findById(currentUser.getId());
        if (memberOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        Team team = memberOpt.get().getTeam();
        List<Assignment> completedAssignments = assignmentRepository.findByTeamId(team.getId()).stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .toList();

        List<Long> assignmentIds = completedAssignments.stream().map(Assignment::getId).toList();
        List<Score> allScores = assignmentIds.isEmpty() ? List.of() : scoreRepository.findByAssignmentIdIn(assignmentIds);
        Map<Long, List<Score>> scoresByAssignment = allScores.stream()
                .collect(Collectors.groupingBy(s -> s.getAssignment().getId()));

        BigDecimal computedScore = null;
        if (!completedAssignments.isEmpty()) {
            BigDecimal sumOfJudges = BigDecimal.ZERO;
            int validJudgeCount = 0;
            for (Assignment a : completedAssignments) {
                List<Score> aScores = scoresByAssignment.getOrDefault(a.getId(), List.of());
                if (!aScores.isEmpty()) {
                    BigDecimal aTotal = aScores.stream()
                            .map(s -> {
                                if (s.getScore() == null || s.getCriteriaMaxScoreSnapshot() == null || s.getCriteriaWeightSnapshot() == null) return BigDecimal.ZERO;
                                if (s.getCriteriaMaxScoreSnapshot().compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
                                return s.getScore().divide(s.getCriteriaMaxScoreSnapshot(), 4, RoundingMode.HALF_UP).multiply(s.getCriteriaWeightSnapshot());
                            })
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    sumOfJudges = sumOfJudges.add(aTotal);
                    validJudgeCount++;
                }
            }
            if (validJudgeCount > 0) {
                computedScore = sumOfJudges.divide(BigDecimal.valueOf(validJudgeCount), 2, RoundingMode.HALF_UP);
            }
        }

        var teamResultOpt = teamResultRepository.findById(team.getId());
        TeamResult tr = teamResultOpt.orElse(null);
        BigDecimal finalScore = computedScore != null ? computedScore : (tr != null ? tr.getFinalScore() : null);

        Submission sub = submissionRepository.findByTeamId(team.getId()).orElse(null);
        String projectTitle = sub != null && sub.getProjectTitle() != null ? sub.getProjectTitle() : "";
        String trackLabel = sub != null && sub.getTrackLabel() != null ? sub.getTrackLabel() : "Open Innovation";

        Integer rank = tr != null ? tr.getRank() : null;
        String outcome = tr != null ? tr.getOutcome() : (team.isShortlisted() ? "finalist" : "participant");

        PublicTeamResultDto resultDto = new PublicTeamResultDto(
                team.getId(),
                team.getName(),
                projectTitle,
                trackLabel,
                finalScore,
                rank,
                outcome,
                completedAssignments.size(),
                false
        );

        List<JudgeReviewDto> reviewDtos = new ArrayList<>();
        for (int i = 0; i < completedAssignments.size(); i++) {
            Assignment a = completedAssignments.get(i);
            String judgeLabel = "Judge " + (char) ('A' + i);
            List<Score> assignmentScores = scoresByAssignment.getOrDefault(a.getId(), List.of());
            List<JudgeScoreDto> scoreDtos = assignmentScores.stream()
                    .map(sc -> new JudgeScoreDto(sc.getCriteria().getTitle(), sc.getScore()))
                    .toList();

            reviewDtos.add(new JudgeReviewDto(
                    a.getId(),
                    judgeLabel,
                    a.getOverallFeedback() != null ? a.getOverallFeedback() : "",
                    scoreDtos
            ));
        }

        List<JudgingCriteria> criteriaList = judgingCriteriaRepository.findAll();
        Map<Long, List<BigDecimal>> criterionScores = new HashMap<>();
        for (Score sc : allScores) {
            criterionScores.computeIfAbsent(sc.getCriteria().getId(), k -> new ArrayList<>())
                    .add(sc.getScore());
        }

        List<CriterionResultDto> criteriaDtos = new ArrayList<>();
        for (JudgingCriteria c : criteriaList) {
            List<BigDecimal> marks = criterionScores.getOrDefault(c.getId(), List.of());
            BigDecimal avgScore = BigDecimal.ZERO;
            if (!marks.isEmpty()) {
                BigDecimal sum = marks.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
                avgScore = sum.divide(BigDecimal.valueOf(marks.size()), 1, RoundingMode.HALF_UP);
            }
            criteriaDtos.add(new CriterionResultDto(
                    c.getTitle(),
                    c.getWeight(),
                    c.getMaxScore(),
                    avgScore
            ));
        }

        return ResponseEntity.ok(new MyDetailedResultDto(resultDto, criteriaDtos, reviewDtos));
    }
}
