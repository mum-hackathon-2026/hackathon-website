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
    public ResponseEntity<List<PublicTeamResultDto>> getPublicResults() {
        EventSettings settings = eventSettingsRepository.findSingleton().orElse(null);
        if (settings == null || settings.getResultsPublishedAt() == null) {
            return ResponseEntity.ok(List.of());
        }

        List<TeamResult> allResults = teamResultRepository.findAllByOrderByRankAsc();
        List<TeamResult> publishedResults = allResults.stream()
                .filter(r -> r.getPublishedAt() != null && r.getFinalScore() != null)
                .toList();

        if (publishedResults.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }

        List<Long> teamIds = publishedResults.stream().map(TeamResult::getTeamId).toList();
        Map<Long, Submission> submissionMap = submissionRepository.findAllById(teamIds).stream()
                .collect(Collectors.toMap(Submission::getTeamId, s -> s));

        Map<Integer, Long> rankCounts = publishedResults.stream()
                .filter(r -> r.getRank() != null)
                .collect(Collectors.groupingBy(TeamResult::getRank, Collectors.counting()));

        List<PublicTeamResultDto> dtoList = new ArrayList<>();
        for (TeamResult tr : publishedResults) {
            Submission sub = submissionMap.get(tr.getTeamId());
            String teamName = tr.getTeam() != null ? tr.getTeam().getName() : "Team " + tr.getTeamId();
            String projectTitle = sub != null && sub.getProjectTitle() != null ? sub.getProjectTitle() : "";
            String trackLabel = sub != null && sub.getTrackLabel() != null ? sub.getTrackLabel() : "Open Innovation";
            String outcome = tr.getOutcome();
            if (tr.getTeam() != null && tr.getTeam().isShortlisted()) {
                outcome = "finalist";
            } else if (outcome == null && tr.getRank() != null) {
                outcome = tr.getRank() <= 10 ? "finalist" : "participant";
            }

            dtoList.add(new PublicTeamResultDto(
                    tr.getTeamId(),
                    teamName,
                    projectTitle,
                    trackLabel,
                    tr.getFinalScore(),
                    tr.getRank(),
                    outcome,
                    tr.getJudgeCount(),
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
        var teamResultOpt = teamResultRepository.findById(team.getId());
        if (teamResultOpt.isEmpty() || teamResultOpt.get().getPublishedAt() == null) {
            return ResponseEntity.noContent().build();
        }

        TeamResult tr = teamResultOpt.get();
        Submission sub = submissionRepository.findByTeamId(team.getId()).orElse(null);
        String projectTitle = sub != null && sub.getProjectTitle() != null ? sub.getProjectTitle() : "";
        String trackLabel = sub != null && sub.getTrackLabel() != null ? sub.getTrackLabel() : "Open Innovation";

        List<TeamResult> allResults = teamResultRepository.findAllByOrderByRankAsc();
        boolean tied = tr.getRank() != null && allResults.stream()
                .filter(r -> r.getPublishedAt() != null && tr.getRank().equals(r.getRank()))
                .count() > 1;

        String outcome = tr.getOutcome();
        if (team.isShortlisted()) {
            outcome = "finalist";
        } else if (outcome == null && tr.getRank() != null) {
            outcome = tr.getRank() <= 10 ? "finalist" : "participant";
        }

        PublicTeamResultDto resultDto = new PublicTeamResultDto(
                tr.getTeamId(),
                team.getName(),
                projectTitle,
                trackLabel,
                tr.getFinalScore(),
                tr.getRank(),
                outcome,
                tr.getJudgeCount(),
                tied
        );

        List<Assignment> completedAssignments = assignmentRepository.findByTeamId(team.getId()).stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .toList();

        List<Long> assignmentIds = completedAssignments.stream().map(Assignment::getId).toList();
        List<Score> allScores = scoreRepository.findByAssignmentIdIn(assignmentIds);
        Map<Long, List<Score>> scoresByAssignment = allScores.stream()
                .collect(Collectors.groupingBy(s -> s.getAssignment().getId()));

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
