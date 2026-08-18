package my.monash.hackathon.hackathon_website_backend.admin;

import jakarta.validation.Valid;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminAssignmentDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminJudgeDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminOverviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminParticipantDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminTeamDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AuditLogDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.CreateAssignmentRequest;
import my.monash.hackathon.hackathon_website_backend.admin.dto.UpdateTeamRequest;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminBackendService adminService;

    public AdminController(AdminBackendService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/overview")
    public ResponseEntity<AdminOverviewDto> getOverview() {
        return ResponseEntity.ok(adminService.getOverview());
    }

    @GetMapping("/teams")
    public ResponseEntity<List<AdminTeamDto>> getTeams() {
        return ResponseEntity.ok(adminService.getTeams());
    }

    @PatchMapping("/teams/{teamId}")
    public ResponseEntity<?> updateTeam(
            @PathVariable Long teamId,
            @RequestBody UpdateTeamRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            var updated = adminService.updateTeam(teamId, request, currentUser);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/participants")
    public ResponseEntity<List<AdminParticipantDto>> getParticipants() {
        return ResponseEntity.ok(adminService.getParticipants());
    }

    @GetMapping("/judges")
    public ResponseEntity<List<AdminJudgeDto>> getJudges() {
        return ResponseEntity.ok(adminService.getJudges());
    }

    @PostMapping("/judges/{userId}")
    public ResponseEntity<?> promoteToJudge(
            @PathVariable Long userId,
            @AuthenticationPrincipal User currentUser) {
        try {
            adminService.promoteToJudge(userId, currentUser);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/judges/{userId}")
    public ResponseEntity<?> demoteJudge(
            @PathVariable Long userId,
            @AuthenticationPrincipal User currentUser) {
        try {
            adminService.demoteJudge(userId, currentUser);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/assignments")
    public ResponseEntity<List<AdminAssignmentDto>> getAssignments() {
        return ResponseEntity.ok(adminService.getAssignments());
    }

    @PostMapping("/assignments")
    public ResponseEntity<?> createAssignment(
            @Valid @RequestBody CreateAssignmentRequest request,
            @AuthenticationPrincipal User currentUser) {
        try {
            var assignment = adminService.createAssignment(request, currentUser);
            return ResponseEntity.ok(assignment);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/assignments/{assignmentId}")
    public ResponseEntity<?> deleteAssignment(
            @PathVariable Long assignmentId,
            @AuthenticationPrincipal User currentUser) {
        try {
            adminService.deleteAssignment(assignmentId, currentUser);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/audit")
    public ResponseEntity<List<AuditLogDto>> getAudit() {
        return ResponseEntity.ok(adminService.getAuditLogs());
    }
}
