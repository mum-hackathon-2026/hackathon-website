package my.monash.hackathon.hackathon_website_backend.event;

import my.monash.hackathon.hackathon_website_backend.admin.AdminBackendService;
import my.monash.hackathon.hackathon_website_backend.admin.dto.EventSettingsDto;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/event")
public class EventSettingsController {

    private final AdminBackendService adminBackendService;

    public EventSettingsController(AdminBackendService adminBackendService) {
        this.adminBackendService = adminBackendService;
    }

    /**
     * The public event configuration — dates, limits and flags the site renders before
     * anyone signs in. This endpoint is {@code permitAll}, so what it returns is world
     * readable.
     *
     * <p>{@code updatedBy} is withheld from anonymous callers: it is the full name of
     * the organiser who last edited the settings, which the site has no reason to show
     * a visitor and which does not belong in an unauthenticated response. Signed-in
     * callers still get it, because the admin workspace displays it.
     */
    @GetMapping("/settings")
    public ResponseEntity<EventSettingsDto> getSettings(@AuthenticationPrincipal User currentUser) {
        EventSettingsDto settings = adminBackendService.getSettings();

        if (currentUser == null && settings != null) {
            settings = new EventSettingsDto(
                    settings.id(),
                    settings.eventName(),
                    settings.registrationOpensAt(),
                    settings.registrationClosesAt(),
                    settings.submissionDeadlineAt(),
                    settings.resultsPublishedAt(),
                    settings.judgingOpen(),
                    settings.minTeamSize(),
                    settings.maxTeamSize(),
                    settings.screeningEnabled(),
                    settings.judgesPerTeam(),
                    null);
        }

        return ResponseEntity.ok(settings);
    }
}
