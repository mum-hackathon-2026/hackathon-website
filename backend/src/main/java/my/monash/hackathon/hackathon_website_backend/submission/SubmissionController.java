package my.monash.hackathon.hackathon_website_backend.submission;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import my.monash.hackathon.hackathon_website_backend.team.TeamMember;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.webhook.SubmissionImportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
    private final SubmissionImportService submissionImportService;

    @Value("${app.webhook.secret:}")
    private String webhookSecret;

    public SubmissionController(
            SubmissionRepository submissionRepository,
            UserRepository userRepository,
            TeamMemberRepository teamMemberRepository,
            SubmissionImportService submissionImportService) {
        this.submissionRepository = submissionRepository;
        this.userRepository = userRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.submissionImportService = submissionImportService;
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
            int version
    ) {}

    @GetMapping("/submissions/my")
    @Transactional(readOnly = true)
    public ResponseEntity<SubmissionResponse> getMySubmission(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String email = authentication.getName();
        var userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        var teamMemberOpt = teamMemberRepository.findById(userOpt.get().getId());
        if (teamMemberOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        Long teamId = teamMemberOpt.get().getTeam().getId();
        var submissionOpt = submissionRepository.findByTeamId(teamId);
        if (submissionOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        Submission s = submissionOpt.get();
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
                s.getVersion()
        ));
    }

    @PostMapping("/webhook/submissions")
    public ResponseEntity<?> triggerSubmissionSync(
            @RequestHeader(value = "X-Webhook-Secret", required = false) String headerSecret,
            @RequestParam(name = "secret", required = false) String paramSecret,
            @RequestParam(name = "dryRun", defaultValue = "false") boolean dryRun) {

        if (webhookSecret != null && !webhookSecret.isBlank()) {
            String provided = headerSecret != null ? headerSecret : paramSecret;
            if (!webhookSecret.equals(provided)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid or missing webhook secret"));
            }
        }

        try {
            var summary = submissionImportService.syncFromSheets(dryRun);
            return ResponseEntity.ok(summary);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "Sync failed"));
        }
    }
}
