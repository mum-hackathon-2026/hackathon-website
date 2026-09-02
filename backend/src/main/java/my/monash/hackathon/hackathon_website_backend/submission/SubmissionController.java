package my.monash.hackathon.hackathon_website_backend.submission;

import my.monash.hackathon.hackathon_website_backend.event.EventSettings;
import my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Assignment;
import my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository;
import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import my.monash.hackathon.hackathon_website_backend.team.TeamMember;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.webhook.SubmissionImportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SubmissionController {

    private final SubmissionRepository submissionRepository;
    private final UserRepository userRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final AssignmentRepository assignmentRepository;
    private final EventSettingsRepository eventSettingsRepository;
    private final SubmissionImportService submissionImportService;
    private final my.monash.hackathon.hackathon_website_backend.webhook.WebhookSecretValidator webhookSecretValidator;

    public SubmissionController(
            SubmissionRepository submissionRepository,
            UserRepository userRepository,
            TeamMemberRepository teamMemberRepository,
            AssignmentRepository assignmentRepository,
            EventSettingsRepository eventSettingsRepository,
            SubmissionImportService submissionImportService,
            my.monash.hackathon.hackathon_website_backend.webhook.WebhookSecretValidator webhookSecretValidator) {
        this.submissionRepository = submissionRepository;
        this.userRepository = userRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.assignmentRepository = assignmentRepository;
        this.eventSettingsRepository = eventSettingsRepository;
        this.submissionImportService = submissionImportService;
        this.webhookSecretValidator = webhookSecretValidator;
    }

    public record SubmissionResponse(
            Long teamId,
            String projectTitle,
            String description,
            String githubUrl,
            String deployedUrl,
            String slideDeckUrl,
            String videoDemoUrl,
            String representativeName,
            String representativePhone,
            String representativeEmail,
            String trackLabel,
            String status,
            OffsetDateTime submittedAt,
            int version,
            int reviewsCompleted,
            int reviewsExpected,
            boolean judgingComplete
    ) {}

    @GetMapping("/submissions/my")
    @Transactional(readOnly = true)
    public ResponseEntity<SubmissionResponse> getMySubmission(@AuthenticationPrincipal User currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        var teamMemberOpt = teamMemberRepository.findById(currentUser.getId());
        if (teamMemberOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        Long teamId = teamMemberOpt.get().getTeam().getId();
        var submissionOpt = submissionRepository.findByTeamId(teamId);
        if (submissionOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        Submission s = submissionOpt.get();
        var assignments = assignmentRepository.findByTeamId(teamId);
        int completed = (int) assignments.stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()))
                .count();
        int targetJudges = eventSettingsRepository.findSingleton()
                .map(my.monash.hackathon.hackathon_website_backend.event.EventSettings::getJudgesPerTeam)
                .orElse(3);
        int expected = Math.max(assignments.size(), targetJudges);
        boolean judgingComplete = completed >= expected && expected > 0;

        return ResponseEntity.ok(new SubmissionResponse(
                s.getTeamId(),
                s.getProjectTitle(),
                s.getDescription(),
                s.getGithubUrl(),
                s.getDeployedUrl(),
                s.getSlideDeckUrl(),
                s.getVideoDemoUrl(),
                s.getRepresentativeName(),
                s.getRepresentativePhone(),
                s.getRepresentativeEmail(),
                s.getTrackLabel(),
                s.getStatus(),
                s.getSubmittedAt(),
                s.getVersion(),
                completed,
                expected,
                judgingComplete
        ));
    }

    @PostMapping("/webhook/submissions")
    public ResponseEntity<?> triggerSubmissionSync(
            @RequestHeader(value = "X-Webhook-Secret", required = false) String headerSecret,
            @RequestParam(name = "secret", required = false) String paramSecret,
            @RequestParam(name = "dryRun", defaultValue = "false") boolean dryRun) {

        if (!webhookSecretValidator.isValid(headerSecret, null, paramSecret)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid or missing webhook secret"));
        }

        try {
            var summary = submissionImportService.syncFromSheets(dryRun);
            return ResponseEntity.ok(Map.of(
                    "status", summary.success() ? "success" : "partial_success",
                    "totalRows", summary.totalRows(),
                    "imported", summary.imported(),
                    "updated", summary.updated(),
                    "skipped", summary.skipped(),
                    "rejected", summary.rejected()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "Sync failed"));
        }
    }
}
