package my.monash.hackathon.hackathon_website_backend.event;

import my.monash.hackathon.hackathon_website_backend.admin.AdminBackendService;
import my.monash.hackathon.hackathon_website_backend.admin.dto.EventSettingsDto;
import org.springframework.http.ResponseEntity;
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

    @GetMapping("/settings")
    public ResponseEntity<EventSettingsDto> getSettings() {
        return ResponseEntity.ok(adminBackendService.getSettings());
    }
}
