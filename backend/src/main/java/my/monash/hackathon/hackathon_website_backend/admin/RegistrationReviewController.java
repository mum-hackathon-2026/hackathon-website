package my.monash.hackathon.hackathon_website_backend.admin;

import java.util.List;
import java.util.Map;
import my.monash.hackathon.hackathon_website_backend.admin.dto.ApproveRegistrationReviewRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.RegistrationReviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.ReviewDecisionRequest;
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
@RequestMapping("/api/admin/registration-reviews")
public class RegistrationReviewController {

    private final RegistrationReviewService reviewService;

    public RegistrationReviewController(RegistrationReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping
    public ResponseEntity<List<RegistrationReviewDto>> list() {
        return ResponseEntity.ok(reviewService.list());
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(
            @PathVariable Long id,
            @RequestBody ApproveRegistrationReviewRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            return ResponseEntity.ok(reviewService.approve(id, request, currentUser));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> reject(
            @PathVariable Long id,
            @RequestBody(required = false) ReviewDecisionRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            return ResponseEntity.ok(reviewService.reject(id, request, currentUser));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/needs-fix")
    public ResponseEntity<?> needsFix(
            @PathVariable Long id,
            @RequestBody(required = false) ReviewDecisionRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            return ResponseEntity.ok(reviewService.requestFix(id, request, currentUser));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<?> reopen(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        try {
            return ResponseEntity.ok(reviewService.reopen(id, currentUser));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
