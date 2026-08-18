package my.monash.hackathon.hackathon_website_backend.webhook;

import my.monash.hackathon.hackathon_website_backend.tools.FormRegistrationImporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;

@Service
public class RegistrationImportService {

    private static final Logger log = LoggerFactory.getLogger(RegistrationImportService.class);

    private final DataSource dataSource;
    private final SheetsProperties sheetsProperties;

    public RegistrationImportService(DataSource dataSource, SheetsProperties sheetsProperties) {
        this.dataSource = dataSource;
        this.sheetsProperties = sheetsProperties;
    }

    public FormRegistrationImporter.ImportSummary syncFromSheets(boolean dryRun) throws Exception {
        String sheetId = sheetsProperties.sheetId();
        if (sheetId == null || sheetId.isBlank()) {
            throw new IllegalStateException("Google Sheet ID is not configured (app.sheets.sheet-id)");
        }

        String tab = sheetsProperties.tab();
        Path credentialsPath = resolveCredentialsPath(sheetsProperties.credentialsPath());

        log.info("Triggering Google Sheets registration sync for sheetId={}, tab={}, dryRun={}",
                sheetId, tab, dryRun);

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            return FormRegistrationImporter.importFromSheet(connection, sheetId, tab, credentialsPath, dryRun);
        }
    }

    @org.springframework.scheduling.annotation.Scheduled(
            fixedDelayString = "${app.sheets.poll-interval-ms:15000}",
            initialDelay = 3000)
    public void scheduledSync() {
        if (sheetsProperties.sheetId() == null || sheetsProperties.sheetId().isBlank()) {
            return;
        }
        try {
            var summary = syncFromSheets(false);
            if (summary.imported() > 0) {
                log.info("Scheduled sync imported {} new registration(s)", summary.imported());
            }
        } catch (Exception e) {
            log.debug("Scheduled sync poll check: {}", e.getMessage());
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
