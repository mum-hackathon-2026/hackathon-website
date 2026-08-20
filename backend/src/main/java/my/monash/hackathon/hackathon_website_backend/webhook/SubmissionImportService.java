package my.monash.hackathon.hackathon_website_backend.webhook;

import my.monash.hackathon.hackathon_website_backend.tools.FormSubmissionImporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;

@Service
public class SubmissionImportService {

    private static final Logger log = LoggerFactory.getLogger(SubmissionImportService.class);

    private final DataSource dataSource;
    private final SheetsProperties sheetsProperties;

    public SubmissionImportService(DataSource dataSource, SheetsProperties sheetsProperties) {
        this.dataSource = dataSource;
        this.sheetsProperties = sheetsProperties;
    }

    public FormSubmissionImporter.ImportSummary syncFromSheets(boolean dryRun) throws Exception {
        String sheetId = sheetsProperties.submissionSheetId();
        if (sheetId == null || sheetId.isBlank()) {
            sheetId = sheetsProperties.sheetId();
        }
        if (sheetId == null || sheetId.isBlank()) {
            throw new IllegalStateException("Google Sheet ID is not configured (app.sheets.submission-sheet-id)");
        }

        String tab = sheetsProperties.submissionTab();
        if (tab == null || tab.isBlank()) {
            tab = "Form Responses 1";
        }
        Path credentialsPath = resolveCredentialsPath(sheetsProperties.credentialsPath());

        log.info("Triggering Google Sheets project submission sync for sheetId={}, tab={}, dryRun={}",
                sheetId, tab, dryRun);

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            return FormSubmissionImporter.importFromSheet(connection, sheetId, tab, credentialsPath, dryRun);
        }
    }

    @Scheduled(
            fixedDelayString = "${app.sheets.poll-interval-ms:15000}",
            initialDelay = 5000)
    public void scheduledSync() {
        String sheetId = sheetsProperties.submissionSheetId();
        if (sheetId == null || sheetId.isBlank()) {
            return;
        }
        try {
            var summary = syncFromSheets(false);
            if (summary.imported() > 0 || summary.updated() > 0) {
                log.info("Scheduled submission sync: {} imported, {} updated", summary.imported(), summary.updated());
            }
        } catch (Exception e) {
            log.debug("Scheduled submission sync poll check: {}", e.getMessage());
        }
    }

    private Path resolveCredentialsPath(String configuredPath) {
        if (configuredPath != null && !configuredPath.isBlank()) {
            Path p = Path.of(configuredPath);
            if (Files.exists(p)) {
                return p;
            }
        }
        String envCreds = System.getenv("GOOGLE_APPLICATION_CREDENTIALS");
        if (envCreds != null && !envCreds.isBlank()) {
            Path p = Path.of(envCreds);
            if (Files.exists(p)) {
                return p;
            }
        }
        if (Files.exists(Path.of("backend", "credentials", "sheets-key.json"))) {
            return Path.of("backend", "credentials", "sheets-key.json");
        }
        if (Files.exists(Path.of("credentials", "sheets-key.json"))) {
            return Path.of("credentials", "sheets-key.json");
        }
        return Path.of("backend", "credentials", "sheets-key.json");
    }
}
