package my.monash.hackathon.hackathon_website_backend.tools;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Imports Google Form project submissions from Google Sheets or CSV into the submissions table.
 */
public final class FormSubmissionImporter {

    private static final String DEFAULT_URL = "jdbc:postgresql://localhost:5433/hackathon_db";
    private static final String DEFAULT_USER = "hackathon_app";
    private static final String DEFAULT_PASSWORD = "dev_app_local";

    static final int EXIT_OK = 0;
    static final int EXIT_REJECTIONS = 1;
    static final int EXIT_ABORTED = 2;

    private static final String FIND_TEAM_BY_NAME =
            "select id, name, created_by from teams where lower(name) = lower(?)";

    private static final String FIND_USER_BY_EMAIL =
            "select id from users where lower(email) = lower(?)";

    private static final String FIND_TEAM_BY_USER_ID = """
            select t.id, t.name, t.created_by
            from team_members tm
            join teams t on t.id = tm.team_id
            where tm.user_id = ?
            """;

    private static final String FIND_SUBMISSION_BY_TEAM_ID = """
            select team_id, project_title, description, github_url, deployed_url,
                   slide_deck_url, video_demo_url, representative_name, representative_phone,
                   representative_email, track_label, status, submitted_at, version
            from submissions
            where team_id = ?
            """;

    private static final String INSERT_SUBMISSION = """
            insert into submissions (team_id, project_title, description, github_url, deployed_url,
                                     slide_deck_url, video_demo_url, representative_name, representative_phone,
                                     representative_email, track_label, status, submitted_at, version)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 0)
            """;

    private static final String UPDATE_SUBMISSION = """
            update submissions
            set project_title = ?,
                description = ?,
                github_url = ?,
                deployed_url = ?,
                slide_deck_url = ?,
                video_demo_url = ?,
                representative_name = ?,
                representative_phone = ?,
                representative_email = ?,
                track_label = coalesce(?, track_label),
                status = 'submitted',
                submitted_at = coalesce(submitted_at, ?),
                version = version + 1
            where team_id = ?
            """;

    private static final String INSERT_AUDIT = """
            insert into audit_log (actor_user_id, action, entity_type, entity_id, details)
            values (?, 'SUBMISSION_SYNCED', 'SUBMISSION', ?, cast(? as jsonb))
            """;

    public enum Status {
        IMPORTED("imported"),
        UPDATED("updated"),
        SKIPPED("skipped"),
        REJECTED("REJECTED");

        public final String label;
        Status(String label) { this.label = label; }
    }

    public record Outcome(Status status, String detail, List<String> warnings) {
        public static Outcome imported(String detail) {
            return new Outcome(Status.IMPORTED, detail, List.of());
        }
        public static Outcome updated(String detail) {
            return new Outcome(Status.UPDATED, detail, List.of());
        }
        public static Outcome skipped(String detail) {
            return new Outcome(Status.SKIPPED, detail, List.of());
        }
        public static Outcome rejected(String detail) {
            return new Outcome(Status.REJECTED, detail, List.of());
        }
    }

    public record ImportSummary(
            boolean success,
            int totalRows,
            int imported,
            int updated,
            int skipped,
            int rejected,
            List<String> logMessages
    ) {}

    public record Options(
            Path file,
            String sheetId,
            String tab,
            Path credentials,
            String url,
            String user,
            String password,
            boolean dryRun
    ) {}

    public static ImportSummary importFromSheet(Connection connection, String sheetId, String tab,
                                                Path credentialsPath, boolean dryRun) throws Exception {
        CsvReader.Sheet sheet = GoogleSheetsReader.read(sheetId, tab, credentialsPath);
        if (sheet.rows().isEmpty()) {
            return new ImportSummary(true, 0, 0, 0, 0, 0, List.of("The sheet has no data rows"));
        }

        FormSubmissionImporter importer = new FormSubmissionImporter();
        List<Outcome> outcomes = new ArrayList<>();
        List<String> logMessages = new ArrayList<>();

        for (CsvReader.Row row : sheet.rows()) {
            Outcome outcome = importer.processRow(connection, row, dryRun);
            outcomes.add(outcome);
            logMessages.add("line " + row.lineNumber() + " " + outcome.status().label + " " + outcome.detail());
        }

        int imported = (int) outcomes.stream().filter(o -> o.status() == Status.IMPORTED).count();
        int updated = (int) outcomes.stream().filter(o -> o.status() == Status.UPDATED).count();
        int skipped = (int) outcomes.stream().filter(o -> o.status() == Status.SKIPPED).count();
        int rejected = (int) outcomes.stream().filter(o -> o.status() == Status.REJECTED).count();

        return new ImportSummary(rejected == 0, sheet.rows().size(), imported, updated, skipped, rejected, logMessages);
    }

    public Outcome processRow(Connection connection, CsvReader.Row row, boolean dryRun) {
        SubmissionData data = extractData(row);

        if (data.projectTitle == null || data.projectTitle.isBlank()) {
            return Outcome.rejected("Project Name / Title is required and cannot be blank");
        }

        try {
            TeamMatch teamMatch = findTeam(connection, data.teamName, data.representativeEmail);
            if (teamMatch == null) {
                String teamRef = data.teamName != null && !data.teamName.isBlank() ? "'" + data.teamName + "'" : "(unnamed)";
                String emailRef = data.representativeEmail != null && !data.representativeEmail.isBlank() ? "'" + data.representativeEmail + "'" : "(no email)";
                return Outcome.rejected("Could not find registered team " + teamRef + " or representative email " + emailRef);
            }

            OffsetDateTime timestamp = data.submittedAt != null ? data.submittedAt : OffsetDateTime.now(ZoneOffset.UTC);

            // Check existing submission
            ExistingSubmission existing = findExistingSubmission(connection, teamMatch.teamId);

            if (existing == null) {
                try (PreparedStatement statement = connection.prepareStatement(INSERT_SUBMISSION)) {
                    statement.setLong(1, teamMatch.teamId);
                    statement.setString(2, data.projectTitle);
                    setNullable(statement, 3, data.description);
                    setNullable(statement, 4, sanitizeUrl(data.githubUrl));
                    setNullable(statement, 5, sanitizeUrl(data.deployedUrl));
                    setNullable(statement, 6, sanitizeUrl(data.slideDeckUrl));
                    setNullable(statement, 7, sanitizeUrl(data.videoDemoUrl));
                    setNullable(statement, 8, data.representativeName);
                    setNullable(statement, 9, data.representativePhone);
                    setNullable(statement, 10, data.representativeEmail);
                    setNullable(statement, 11, data.trackLabel);
                    statement.setObject(12, timestamp);
                    statement.executeUpdate();
                }

                writeAudit(connection, teamMatch.createdBy, teamMatch.teamId,
                        "Created submission for team '" + teamMatch.teamName + "' with project '" + data.projectTitle + "'");

                if (!dryRun) {
                    connection.commit();
                } else {
                    connection.rollback();
                }
                return Outcome.imported("Team '" + teamMatch.teamName + "': project '" + data.projectTitle + "'");
            } else {
                // Check if unchanged
                if (isUnchanged(existing, data)) {
                    return Outcome.skipped("Team '" + teamMatch.teamName + "' submission already up to date");
                }

                try (PreparedStatement statement = connection.prepareStatement(UPDATE_SUBMISSION)) {
                    statement.setString(1, data.projectTitle);
                    setNullable(statement, 2, data.description);
                    setNullable(statement, 3, sanitizeUrl(data.githubUrl));
                    setNullable(statement, 4, sanitizeUrl(data.deployedUrl));
                    setNullable(statement, 5, sanitizeUrl(data.slideDeckUrl));
                    setNullable(statement, 6, sanitizeUrl(data.videoDemoUrl));
                    setNullable(statement, 7, data.representativeName);
                    setNullable(statement, 8, data.representativePhone);
                    setNullable(statement, 9, data.representativeEmail);
                    setNullable(statement, 10, data.trackLabel);
                    statement.setObject(11, timestamp);
                    statement.setLong(12, teamMatch.teamId);
                    statement.executeUpdate();
                }

                writeAudit(connection, teamMatch.createdBy, teamMatch.teamId,
                        "Updated submission for team '" + teamMatch.teamName + "' with project '" + data.projectTitle + "'");

                if (!dryRun) {
                    connection.commit();
                } else {
                    connection.rollback();
                }
                return Outcome.updated("Team '" + teamMatch.teamName + "': updated project '" + data.projectTitle + "'");
            }
        } catch (SQLException e) {
            rollbackQuietly(connection);
            return Outcome.rejected("Database error for team '" + data.teamName + "': " + e.getMessage());
        }
    }

    private static boolean isUnchanged(ExistingSubmission existing, SubmissionData data) {
        return Objects.equals(existing.projectTitle, data.projectTitle)
                && Objects.equals(existing.description, data.description)
                && Objects.equals(existing.githubUrl, sanitizeUrl(data.githubUrl))
                && Objects.equals(existing.deployedUrl, sanitizeUrl(data.deployedUrl))
                && Objects.equals(existing.slideDeckUrl, sanitizeUrl(data.slideDeckUrl))
                && Objects.equals(existing.videoDemoUrl, sanitizeUrl(data.videoDemoUrl))
                && Objects.equals(existing.representativeName, data.representativeName)
                && Objects.equals(existing.representativePhone, data.representativePhone)
                && Objects.equals(existing.representativeEmail, data.representativeEmail)
                && (data.trackLabel == null || Objects.equals(existing.trackLabel, data.trackLabel));
    }

    private static String sanitizeUrl(String url) {
        if (url == null || url.isBlank()) return null;
        String trimmed = url.trim();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            return "https://" + trimmed;
        }
        return trimmed;
    }

    private static void setNullable(PreparedStatement statement, int index, String value) throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.VARCHAR);
        } else {
            statement.setString(index, value);
        }
    }

    private static void writeAudit(Connection connection, Long userId, Long teamId, String details) {
        try (PreparedStatement statement = connection.prepareStatement(INSERT_AUDIT)) {
            if (userId != null) {
                statement.setLong(1, userId);
            } else {
                statement.setNull(1, Types.BIGINT);
            }
            if (teamId != null) {
                statement.setLong(2, teamId);
            } else {
                statement.setNull(2, Types.BIGINT);
            }
            String safeMsg = details != null ? details.replace("\\", "\\\\").replace("\"", "\\\"") : "";
            statement.setString(3, "{\"message\":\"" + safeMsg + "\"}");
            statement.executeUpdate();
        } catch (SQLException ignored) {}
    }

    private static void rollbackQuietly(Connection connection) {
        try {
            connection.rollback();
        } catch (SQLException ignored) {}
    }

    private record TeamMatch(long teamId, String teamName, Long createdBy) {}

    private TeamMatch findTeam(Connection connection, String teamName, String repEmail) throws SQLException {
        if (teamName != null && !teamName.isBlank()) {
            try (PreparedStatement statement = connection.prepareStatement(FIND_TEAM_BY_NAME)) {
                statement.setString(1, teamName.trim());
                try (ResultSet results = statement.executeQuery()) {
                    if (results.next()) {
                        long teamId = results.getLong("id");
                        String name = results.getString("name");
                        long createdByVal = results.getLong("created_by");
                        Long createdBy = results.wasNull() ? null : createdByVal;
                        return new TeamMatch(teamId, name, createdBy);
                    }
                }
            }
        }

        if (repEmail != null && !repEmail.isBlank()) {
            Long userId = null;
            try (PreparedStatement statement = connection.prepareStatement(FIND_USER_BY_EMAIL)) {
                statement.setString(1, repEmail.trim().toLowerCase(Locale.ROOT));
                try (ResultSet results = statement.executeQuery()) {
                    if (results.next()) {
                        userId = results.getLong("id");
                    }
                }
            }

            if (userId != null) {
                try (PreparedStatement statement = connection.prepareStatement(FIND_TEAM_BY_USER_ID)) {
                    statement.setLong(1, userId);
                    try (ResultSet results = statement.executeQuery()) {
                        if (results.next()) {
                            long teamId = results.getLong("id");
                            String name = results.getString("name");
                            long createdByVal = results.getLong("created_by");
                            Long createdBy = results.wasNull() ? null : createdByVal;
                            return new TeamMatch(teamId, name, createdBy);
                        }
                    }
                }
            }
        }

        return null;
    }

    private record ExistingSubmission(
            long teamId,
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

    private ExistingSubmission findExistingSubmission(Connection connection, long teamId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(FIND_SUBMISSION_BY_TEAM_ID)) {
            statement.setLong(1, teamId);
            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    OffsetDateTime submittedAt = rs.getObject("submitted_at", OffsetDateTime.class);
                    return new ExistingSubmission(
                            rs.getLong("team_id"),
                            rs.getString("project_title"),
                            rs.getString("description"),
                            rs.getString("github_url"),
                            rs.getString("deployed_url"),
                            rs.getString("slide_deck_url"),
                            rs.getString("video_demo_url"),
                            rs.getString("representative_name"),
                            rs.getString("representative_phone"),
                            rs.getString("representative_email"),
                            rs.getString("track_label"),
                            rs.getString("status"),
                            submittedAt,
                            rs.getInt("version")
                    );
                }
            }
        }
        return null;
    }

    private static final List<String> TEAM_NAME_HEADERS = List.of(
            "team name", "team", "team_name"
    );

    private static final List<String> REP_NAME_HEADERS = List.of(
            "team representative full name", "team representative name",
            "representative full name", "representative name", "submitter full name", "full name"
    );

    private static final List<String> REP_PHONE_HEADERS = List.of(
            "team representative whatsapp / phone number", "team representative whatsapp/phone number",
            "team representative phone number", "team representative phone", "representative phone",
            "whatsapp / phone number", "whatsapp number", "phone number", "phone"
    );

    private static final List<String> REP_EMAIL_HEADERS = List.of(
            "team representative email address", "team representative email",
            "representative email", "email address", "submitter email", "email"
    );

    private static final List<String> PROJECT_NAME_HEADERS = List.of(
            "project name", "project title", "project", "title"
    );

    private static final List<String> DESCRIPTION_HEADERS = List.of(
            "project description / summary", "project description/summary",
            "project description", "description / summary", "description", "summary", "project summary"
    );

    private static final List<String> GITHUB_URL_HEADERS = List.of(
            "github repository url", "github repo url", "github repository", "github repo",
            "github link", "repository url", "github url", "repo url", "repository link", "repo link", "github", "repository", "repo"
    );

    private static final List<String> DEMO_URL_HEADERS = List.of(
            "live prototype / demo url", "live prototype/demo url",
            "live prototype url", "live demo url", "prototype url", "demo url", "deployed url", "live url",
            "live demo", "prototype link", "demo link", "live link", "deployed link", "prototype", "demo", "website"
    );

    private static final List<String> SLIDE_DECK_HEADERS = List.of(
            "slide deck / documentation url", "slide deck/documentation url",
            "slide deck url", "slide deck", "slide deck link", "slides url", "slides link", "slides",
            "documentation url", "documentation link", "documentation", "presentation url", "presentation link",
            "presentation", "pitch deck url", "pitch deck", "deck url", "deck"
    );

    private static final List<String> VIDEO_DEMO_HEADERS = List.of(
            "video demo url (5 minutes maximum)", "video demo url (5 min max)",
            "video demo url", "video demo link", "video demo", "video url", "video link", "demo video url",
            "demo video link", "demo video", "youtube url", "youtube link", "youtube", "video"
    );

    private static final List<String> TRACK_HEADERS = List.of(
            "challenge track", "track", "track label", "category"
    );

    private static final List<String> TIMESTAMP_HEADERS = List.of(
            "timestamp", "timestamp (utc)", "submitted at"
    );

    public record SubmissionData(
            String teamName,
            String representativeName,
            String representativePhone,
            String representativeEmail,
            String projectTitle,
            String description,
            String githubUrl,
            String deployedUrl,
            String slideDeckUrl,
            String videoDemoUrl,
            String trackLabel,
            OffsetDateTime submittedAt
    ) {}

    public static SubmissionData extractData(CsvReader.Row row) {
        String teamName = findValue(row, TEAM_NAME_HEADERS);
        String repName = findValue(row, REP_NAME_HEADERS);
        String repPhone = findValue(row, REP_PHONE_HEADERS);
        String repEmail = findValue(row, REP_EMAIL_HEADERS);
        String projectTitle = findValue(row, PROJECT_NAME_HEADERS);
        String description = findValue(row, DESCRIPTION_HEADERS);
        String githubUrl = findValue(row, GITHUB_URL_HEADERS);
        String deployedUrl = findValue(row, DEMO_URL_HEADERS);
        String slideDeckUrl = findValue(row, SLIDE_DECK_HEADERS);
        String videoDemoUrl = findValue(row, VIDEO_DEMO_HEADERS);
        String trackLabel = findValue(row, TRACK_HEADERS);
        String timestampStr = findValue(row, TIMESTAMP_HEADERS);

        OffsetDateTime submittedAt = parseTimestamp(timestampStr);

        return new SubmissionData(
            trimOrNull(teamName),
            trimOrNull(repName),
            trimOrNull(repPhone),
            trimOrNull(repEmail),
            trimOrNull(projectTitle),
            trimOrNull(description),
            trimOrNull(githubUrl),
            trimOrNull(deployedUrl),
            trimOrNull(slideDeckUrl),
            trimOrNull(videoDemoUrl),
            trimOrNull(trackLabel),
            submittedAt
        );
    }

    private static String findValue(CsvReader.Row row, List<String> aliases) {
        // 1. Exact match on normalized header
        for (String alias : aliases) {
            String val = row.byNormalisedHeader().get(CsvReader.normalise(alias));
            if (val != null && !val.isBlank()) {
                return val.trim();
            }
        }
        // 2. Contains match on normalized header
        for (Map.Entry<String, String> entry : row.byNormalisedHeader().entrySet()) {
            String header = entry.getKey();
            String val = entry.getValue();
            if (val != null && !val.isBlank()) {
                for (String alias : aliases) {
                    String normAlias = CsvReader.normalise(alias);
                    if (header.contains(normAlias) || normAlias.contains(header)) {
                        return val.trim();
                    }
                }
            }
        }
        return null;
    }

    private static String trimOrNull(String val) {
        if (val == null) return null;
        String t = val.trim();
        return t.isBlank() ? null : t;
    }

    private static final List<DateTimeFormatter> TIMESTAMP_FORMATTERS = List.of(
            DateTimeFormatter.ISO_OFFSET_DATE_TIME,
            DateTimeFormatter.ISO_DATE_TIME,
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("yyyy/MM/dd h:mm:ss a").toFormatter(Locale.US),
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("yyyy/M/d h:mm:ss a").toFormatter(Locale.US),
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("M/d/yyyy h:mm:ss a").toFormatter(Locale.US),
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("M/d/yyyy H:mm:ss").toFormatter(Locale.US),
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("yyyy/MM/dd H:mm:ss").toFormatter(Locale.US),
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("dd/MM/yyyy HH:mm:ss").toFormatter(Locale.US),
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("d/M/yyyy HH:mm:ss").toFormatter(Locale.US)
    );

    private static OffsetDateTime parseTimestamp(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String cleaned = raw.trim();

        for (DateTimeFormatter fmt : TIMESTAMP_FORMATTERS) {
            try {
                java.time.temporal.TemporalAccessor accessor = fmt.parse(cleaned);
                try {
                    return OffsetDateTime.from(accessor);
                } catch (Exception e1) {
                    try {
                        return java.time.LocalDateTime.from(accessor).atOffset(ZoneOffset.UTC);
                    } catch (Exception e2) {
                        try {
                            return java.time.LocalDate.from(accessor).atStartOfDay().atOffset(ZoneOffset.UTC);
                        } catch (Exception ignored) {}
                    }
                }
            } catch (Exception ignored) {}
        }
        return null;
    }
}
