package my.monash.hackathon.hackathon_website_backend.judging;

import java.util.List;
import java.util.Map;
import my.monash.hackathon.hackathon_website_backend.judging.dto.JudgeAssignmentResponse;
import my.monash.hackathon.hackathon_website_backend.judging.dto.JudgingCriterionDto;
import my.monash.hackathon.hackathon_website_backend.judging.dto.SaveReviewRequest;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/judge")
public class JudgeController {

    private final JudgeBackendService judgeBackendService;

    public JudgeController(JudgeBackendService judgeBackendService) {
        this.judgeBackendService = judgeBackendService;
    }

    @GetMapping("/assignments")
    public ResponseEntity<List<JudgeAssignmentResponse>> getAssignments(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(judgeBackendService.getAssignmentsForJudge(currentUser));
    }

    @GetMapping("/criteria")
    public ResponseEntity<List<JudgingCriterionDto>> getCriteria() {
        return ResponseEntity.ok(judgeBackendService.getActiveCriteria());
    }

    @PostMapping("/assignments/{assignmentId}/draft")
    public ResponseEntity<?> saveDraft(
            @PathVariable Long assignmentId,
            @RequestBody SaveReviewRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            JudgeAssignmentResponse response = judgeBackendService.saveDraft(assignmentId, request, currentUser);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/assignments/{assignmentId}/complete")
    public ResponseEntity<?> completeReview(
            @PathVariable Long assignmentId,
            @RequestBody SaveReviewRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            JudgeAssignmentResponse response = judgeBackendService.completeReview(assignmentId, request, currentUser);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/assignments/{assignmentId}/decline")
    public ResponseEntity<?> declineAssignment(
            @PathVariable Long assignmentId,
            @AuthenticationPrincipal User currentUser) {
        try {
            judgeBackendService.declineAssignment(assignmentId, currentUser);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
