package my.monash.hackathon.hackathon_website_backend.webhook;

import my.monash.hackathon.hackathon_website_backend.tools.FormRegistrationImporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/webhooks")
public class RegistrationWebhookController {

    private static final Logger log = LoggerFactory.getLogger(RegistrationWebhookController.class);

    private final RegistrationImportService importService;
    private final WebhookSecretValidator webhookSecretValidator;

    public RegistrationWebhookController(RegistrationImportService importService,
                                         WebhookSecretValidator webhookSecretValidator) {
        this.importService = importService;
        this.webhookSecretValidator = webhookSecretValidator;
    }

    @PostMapping("/forms/registration")
    public ResponseEntity<Map<String, Object>> handleFormSubmissionWebhook(
            @RequestHeader(value = "X-Webhook-Secret", required = false) String headerSecret,
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun
    ) {
        if (!webhookSecretValidator.isValid(headerSecret, authHeader, null)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "status", "unauthorized",
                    "message", "Invalid or missing webhook secret"
            ));
        }

        try {
            FormRegistrationImporter.ImportSummary summary = importService.syncFromSheets(dryRun);
            log.info("Webhook import completed: total={}, imported={}, skipped={}, rejected={}, "
                            + "pending={}",
                    summary.totalRows(), summary.imported(), summary.skipped(), summary.rejected(),
                    summary.pending());

            return ResponseEntity.ok(Map.of(
                    "status", summary.success() ? "success" : "partial_success",
                    "timestamp", Instant.now().toString(),
                    "totalRows", summary.totalRows(),
                    "imported", summary.imported(),
                    "skipped", summary.skipped(),
                    "rejected", summary.rejected(),
                    // Teams screening held back. They are not in the database and will be
                    // screened again on the next poll; details go to server log only.
                    "pending", summary.pending()
            ));
        } catch (Exception e) {
            log.error("Failed to process Google Form submission webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "status", "error",
                    "timestamp", Instant.now().toString(),
                    "message", e.getMessage() == null ? "Unknown import error" : e.getMessage()
            ));
        }
    }
}
