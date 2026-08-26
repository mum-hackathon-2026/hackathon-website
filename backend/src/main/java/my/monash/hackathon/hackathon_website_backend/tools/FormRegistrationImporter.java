package my.monash.hackathon.hackathon_website_backend.tools;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Imports Google Form team registrations from an exported CSV or directly from Google Sheets API
 * into users, teams and team_members.
 *
 * <h2>Three outcomes</h2>
 *
 * <p>A team is IMPORTED, PENDING or REJECTED. IMPORTED and REJECTED are the original pair:
 * clean rows are written, structurally broken rows are refused. PENDING is
 * {@link EligibilityScreening}'s: the row is fine but somebody has to look at it — no member
 * on an obviously IT course, a GitHub URL in the LinkedIn box, a missing resume.
 *
 * <p><strong>A PENDING team is not written to the database at all</strong>, and nothing
 * records that it was held. That is what makes it self-clearing: the next run reads the
 * sheet again and screens it again, so correcting the spreadsheet is the entire fix and
 * there is no state to reconcile if a human decides the team is fine after all.
 *
 * <h2>Usage</h2>
 *
 * <pre>{@code
 * ./mvnw compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
 * ./mvnw compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --dry-run"
 * }</pre>
 */
public final class FormRegistrationImporter {

    /** Unambiguous in handwriting and over the phone: no I, O, 0 or 1. */
    private static final String JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int JOIN_CODE_LENGTH = 8;
    private static final int JOIN_CODE_ATTEMPTS = 25;

    private static final String DEFAULT_URL = "jdbc:postgresql://localhost:5433/hackathon_db";
    private static final String DEFAULT_USER = "hackathon_app";
    private static final String DEFAULT_PASSWORD = "dev_app_local";

    // Exit codes. An unattended caller reads these; the RESULT line stays the record of what
    // happened, but a scheduler should not have to parse anything to learn that a run failed.
    /** The import ran to the end and no row was rejected or held pending. */
    static final int EXIT_OK = 0;
    /**
     * The import ran to the end, but at least one row needs a human — either rejected
     * outright or held PENDING by screening. One code covers both because the question an
     * unattended caller asks is "does somebody have to look at this?", and the answer is yes
     * either way; the RESULT line's {@code rejected=} and {@code pending=} say which.
     */
    static final int EXIT_REJECTIONS = 1;
    /** Nothing was imported: bad arguments, an unreadable or mis-titled sheet, or no database. */
    static final int EXIT_ABORTED = 2;

    private static final String INSERT_USER = """
            insert into users (email, full_name, role, email_verified, phone, resume_url,
                               linkedin_url, github_url)
            values (?, ?, 'participant', false, ?, ?, ?, ?)
            """;

    private static final String INSERT_TEAM =
            "insert into teams (name, join_code, created_by, status) values (?, ?, ?, 'complete')";

    private static final String INSERT_TEAM_MEMBER =
            "insert into team_members (user_id, team_id) values (?, ?)";

    private static final String FIND_TEAM_BY_NAME = "select id from teams where name = ?";

    private static final String FIND_TEAM_MEMBER_EMAILS = """
            select u.email
            from team_members tm
            join users u on u.id = tm.user_id
            where tm.team_id = ?
            """;

    private static final String FIND_USER_BY_EMAIL = "select id from users where email = ?";

    private static final String FIND_TEAM_OF_USER = """
            select t.name
            from team_members tm
            join teams t on t.id = tm.team_id
            where tm.user_id = ?
            """;

    private static final String JOIN_CODE_EXISTS = "select 1 from teams where join_code = ?";

    /**
     * The permitted team size, which lives in the database and nowhere else.
     *
     * <p>{@code event_settings} is the singleton row V1 constrains with {@code check (id = 1)},
     * so this reads that row by id rather than taking whatever {@code select ... limit 1}
     * returns.
     */
    private static final String FIND_TEAM_SIZE_LIMITS =
            "select min_team_size, max_team_size from event_settings where id = 1";

    private static final Map<String, String> CONSTRAINT_EXPLANATIONS = Map.of(
            "users_email_key", "that email address is already registered",
            "users_email_lowercase_check",
                    "the email was not lowercased before insert - this is an importer bug, please report it",
            "users_email_length_check", "the email address is too long for the column",
            "users_full_name_length_check", "a member's name is too long for the column",
            "teams_name_key", "a team with that name already exists",
            "teams_join_code_key", "the generated join code collided with an existing one",
            "teams_name_length_check", "the team name is too long for the column",
            "team_members_pkey",
                    "one of the members is already on a team - a person may only belong to one");

    private final SecureRandom random = new SecureRandom();

    /** Team names claimed so far in this run, so two rows in one file cannot both take one. */
    private final Map<String, Integer> teamNamesSeen = new LinkedHashMap<>();

    /** Email to a description of who already claimed it in this run. */
    private final Map<String, String> emailsSeen = new LinkedHashMap<>();

    /** Join codes minted in this run — a dry run rolls them back, so the DB cannot see them. */
    private final Set<String> joinCodesMinted = new HashSet<>();

    /**
     * {@code success} is false when anything needs a human, pending or rejected — the
     * webhook reports it as a partial success, which is what it is.
     */
    public record ImportSummary(
            boolean success,
            int totalRows,
            int imported,
            int skipped,
            int rejected,
            int pending,
            List<String> logMessages
    ) {}

    /**
     * Programmatic entry point to import registrations from Google Sheets directly using a SQL Connection.
     */
    public static ImportSummary importFromSheet(Connection connection, String sheetId, String tab,
                                                Path credentialsPath, boolean dryRun) throws Exception {
        CsvReader.Sheet sheet = GoogleSheetsReader.read(sheetId, tab, credentialsPath);

        // Same rule as the CLI path: the permitted team size comes from event_settings and
        // there is no fallback. A scheduled sync that cannot read the limits does nothing
        // rather than importing against guessed ones.
        TeamRow.SizeLimits limits;
        try {
            limits = readTeamSizeLimits(connection);
        } catch (MissingLimitsException e) {
            return new ImportSummary(false, sheet.rows().size(), 0, 0, sheet.rows().size(), 0,
                    List.of("STOPPING: " + e.getMessage()));
        }

        if (!reportColumnMapping(sheet, limits)) {
            return new ImportSummary(false, sheet.rows().size(), 0, 0, sheet.rows().size(), 0,
                    List.of("Column mapping failed - incomplete member block, a missing "
                            + "Major column, or a disallowed repository question"));
        }
        if (sheet.rows().isEmpty()) {
            return new ImportSummary(true, 0, 0, 0, 0, 0, List.of("The sheet has no data rows"));
        }

        FormRegistrationImporter importer = new FormRegistrationImporter();
        List<Outcome> outcomes = new ArrayList<>();
        List<String> logMessages = new ArrayList<>();
        logMessages.add("team size limits: " + limits.describe() + " (from event_settings)");

        for (CsvReader.Row row : sheet.rows()) {
            Outcome outcome = importer.processRow(connection, row, limits, dryRun);
            outcomes.add(outcome);
            // Flattened: a pending reason spans lines in the console report, and a log line
            // that contains a newline is a log line that reads as two unrelated entries.
            logMessages.add("line " + row.lineNumber() + " " + outcome.status().label + " "
                    + outcome.detail().replace("\n", " "));
        }

        int imported = (int) outcomes.stream()
                .filter(o -> o.status() == Status.IMPORTED || o.status() == Status.WOULD_IMPORT)
                .count();
        int skipped = (int) outcomes.stream().filter(o -> o.status() == Status.ALREADY_PRESENT).count();
        int rejected = (int) outcomes.stream().filter(o -> o.status() == Status.REJECTED).count();
        int pending = (int) outcomes.stream().filter(o -> o.status() == Status.PENDING).count();

        return new ImportSummary(rejected == 0 && pending == 0, outcomes.size(), imported,
                skipped, rejected, pending, logMessages);
    }

    private enum Status {
        IMPORTED("IMPORTED"),
        WOULD_IMPORT("WOULD IMPORT"),
        ALREADY_PRESENT("SKIPPED"),
        /**
         * Screening held this team back. Nothing was written, so the next run screens it
         * again from the sheet — correcting the spreadsheet is the whole of the fix.
         */
        PENDING("PENDING"),
        REJECTED("REJECTED");

        private final String label;

        Status(String label) {
            this.label = label;
        }
    }

    private record Outcome(Status status, String detail, List<String> warnings) {

        static Outcome of(Status status, String detail) {
            return new Outcome(status, detail, List.of());
        }
    }

    private record Options(Path file, String sheetId, String tab, Path credentials,
                           boolean dryRun, String url, String user, String password) {}

    /**
     * Raised when {@code event_settings} cannot tell us the permitted team size.
     *
     * <p>Deliberately fatal. There is no default to fall back on: importing a season's
     * registrations against guessed limits would admit teams the organisers did not agree to
     * and reject ones they did, and nothing downstream would notice.
     */
    static final class MissingLimitsException extends Exception {
        MissingLimitsException(String reason) {
            super(reason);
        }
    }

    /**
     * Reads the permitted team size from the {@code event_settings} singleton.
     *
     * <p>This is the only copy of the limits the importer has. It used to hold its own
     * constant beside the column, which is what made a change of policy a change of code;
     * the column is now the source and this is the read.
     */
    static TeamRow.SizeLimits readTeamSizeLimits(Connection connection)
            throws SQLException, MissingLimitsException {
        try (PreparedStatement statement = connection.prepareStatement(FIND_TEAM_SIZE_LIMITS);
                ResultSet results = statement.executeQuery()) {
            if (!results.next()) {
                throw new MissingLimitsException(
                        "event_settings has no row with id = 1, so the permitted team size is "
                                + "unknown. V1 seeds this row; a database missing it has not been "
                                + "migrated. Nothing was imported.");
            }

            int min = results.getInt("min_team_size");
            boolean minIsNull = results.wasNull();
            int max = results.getInt("max_team_size");
            boolean maxIsNull = results.wasNull();

            if (minIsNull || maxIsNull) {
                throw new MissingLimitsException(
                        "event_settings.min_team_size / max_team_size is null, so the permitted "
                                + "team size is unknown. Set both before importing. Nothing was "
                                + "imported.");
            }
            if (min < 1 || max < min) {
                throw new MissingLimitsException(
                        "event_settings holds a nonsensical team size: min_team_size=" + min
                                + ", max_team_size=" + max + ". Nothing was imported.");
            }

            return new TeamRow.SizeLimits(min, max);
        }
    }

    public static void main(String[] args) {
        System.exit(run(args));
    }

    /**
     * The real entry point. Returns the exit code rather than setting it so that a test can
     * assert on it without taking the JVM down with it; {@link #main} is the thin shell that
     * turns the return value into a process status.
     */
    static int run(String[] args) {
        Options options;
        try {
            options = parseArguments(args);
        } catch (IllegalArgumentException e) {
            System.out.println("error: " + e.getMessage());
            System.out.println();
            printUsage();
            return EXIT_ABORTED;
        }
        if (options == null) {
            printUsage();
            return EXIT_OK;
        }
        return new FormRegistrationImporter().execute(options);
    }

    private int execute(Options options) {
        System.out.println("Google Form registration import");
        if (options.file() != null) {
            System.out.println("  file        : " + options.file().toAbsolutePath());
        } else {
            System.out.println("  sheet id    : " + options.sheetId()
                    + " (tab '" + (options.tab() == null ? GoogleSheetsReader.DEFAULT_TAB : options.tab()) + "')");
            System.out.println("  credentials : " + options.credentials().toAbsolutePath());
        }
        System.out.println("  database    : " + options.url() + " as " + options.user());
        System.out.println("  mode        : " + (options.dryRun()
                ? "DRY RUN - every team is validated against the real database, then rolled back"
                : "LIVE - teams that validate are committed"));

        CsvReader.Sheet sheet;
        if (options.file() != null) {
            try {
                sheet = CsvReader.read(options.file());
            } catch (IOException e) {
                System.out.println("Could not read " + options.file() + ": " + e.getMessage());
                return EXIT_ABORTED;
            } catch (CsvReader.MalformedCsvException e) {
                System.out.println("Could not parse " + options.file() + ": " + e.getMessage());
                return EXIT_ABORTED;
            }
        } else {
            try {
                sheet = GoogleSheetsReader.read(options.sheetId(), options.tab(), options.credentials());
            } catch (GoogleSheetsReader.SheetsException e) {
                System.out.println("STOPPING: " + e.getMessage());
                return EXIT_ABORTED;
            } catch (CsvReader.MalformedCsvException e) {
                System.out.println("STOPPING: could not parse sheet: " + e.getMessage());
                return EXIT_ABORTED;
            }
        }

        // The database is opened BEFORE the column mapping is reported, because the mapping
        // depends on it: how many "Member N" blocks the form is expected to carry is
        // max_team_size, and that lives in event_settings. Nothing is written until
        // importAll.
        try (Connection connection = DriverManager.getConnection(
                options.url(), options.user(), options.password())) {
            connection.setAutoCommit(false);

            TeamRow.SizeLimits limits;
            try {
                limits = readTeamSizeLimits(connection);
            } catch (MissingLimitsException e) {
                System.out.println();
                System.out.println("STOPPING: " + e.getMessage());
                return EXIT_ABORTED;
            } catch (SQLException e) {
                // Distinguished from the connection failure below: we are connected, and it
                // was reading event_settings that failed.
                System.out.println();
                System.out.println("STOPPING: could not read event_settings for the permitted "
                        + "team size: " + e.getMessage());
                return EXIT_ABORTED;
            }

            // Printed so the operator can see which limits were actually enforced, rather
            // than assuming the ones they have in mind. The keyword list is printed for the
            // same reason: a team held for "no clear IT-related course" was judged against
            // these exact terms, and the person reading the report should not have to open
            // the source to find out what they were.
            System.out.println("  team size   : " + limits.describe() + " (from event_settings)");
            System.out.println("  IT keywords : " + EligibilityScreening.IT_COURSE_KEYWORDS.size()
                    + " terms, matched as case-insensitive substrings of a member's major");
            System.out.println("                " + EligibilityScreening.describeKeywords());
            System.out.println();

            if (!reportColumnMapping(sheet, limits)) {
                return EXIT_ABORTED;
            }

            if (sheet.rows().isEmpty()) {
                System.out.println("The file has a header row but no data rows. Nothing to do.");
                return EXIT_ABORTED;
            }

            return importAll(connection, sheet, limits, options.dryRun());
        } catch (SQLException e) {
            System.out.println();
            System.out.println("Could not connect to " + options.url() + " as " + options.user()
                    + ": " + e.getMessage());
            System.out.println("Is the Docker container running? `docker start hackathon-pg16`");
            return EXIT_ABORTED;
        }
    }

    private int importAll(Connection connection, CsvReader.Sheet sheet,
                          TeamRow.SizeLimits limits, boolean dryRun) throws SQLException {
        List<Outcome> outcomes = new ArrayList<>();

        // Kept alongside the outcomes so the two follow-up lists can be reprinted together
        // at the end. Whoever chases these reads the bottom of the output, not the middle:
        // in a run of eighty rows the six that need a person are invisible in row order.
        List<String> pendingReport = new ArrayList<>();
        List<String> rejectedReport = new ArrayList<>();

        System.out.println("Rows");
        System.out.println("-".repeat(78));

        for (CsvReader.Row row : sheet.rows()) {
            Outcome outcome = processRow(connection, row, limits, dryRun);
            outcomes.add(outcome);
            printOutcome(row.lineNumber(), outcome);

            if (outcome.status() == Status.PENDING) {
                pendingReport.add(describeForFollowUp(row.lineNumber(), outcome));
            } else if (outcome.status() == Status.REJECTED) {
                rejectedReport.add(describeForFollowUp(row.lineNumber(), outcome));
            }
        }

        printSummary(outcomes, dryRun, pendingReport, rejectedReport);

        boolean needsHuman = outcomes.stream()
                .anyMatch(o -> o.status() == Status.REJECTED || o.status() == Status.PENDING);
        return needsHuman ? EXIT_REJECTIONS : EXIT_OK;
    }

    /**
     * One row of the per-line report. A detail may run to several lines — a pending team
     * lists every reason it was held, and the course check quotes every major — so the
     * continuation lines are indented under the first rather than wrapped into it.
     */
    private static void printOutcome(int lineNumber, Outcome outcome) {
        List<String> lines = outcome.detail().lines().toList();
        System.out.printf("line %-4d %-13s %s%n",
                lineNumber, outcome.status().label, lines.getFirst());
        for (String continuation : lines.subList(1, lines.size())) {
            System.out.printf("%s  %s%n", " ".repeat(18), continuation);
        }
        for (String warning : outcome.warnings()) {
            System.out.printf("%s  note: %s%n", " ".repeat(18), warning);
        }
    }

    /** "line 4   'Team' - reason", with any continuation lines indented under it. */
    private static String describeForFollowUp(int lineNumber, Outcome outcome) {
        List<String> lines = outcome.detail().lines().toList();
        StringBuilder text = new StringBuilder(String.format("  line %-4d %s", lineNumber,
                lines.getFirst()));
        for (String continuation : lines.subList(1, lines.size())) {
            text.append(System.lineSeparator()).append("            ").append(continuation);
        }
        return text.toString();
    }

    /**
     * Handles one team. Every rejection returns an {@link Outcome} rather than throwing, so
     * one bad row never stops the import — the point of the report is that a human can chase
     * all the rejects in one pass instead of discovering them one re-run at a time.
     */
    private Outcome processRow(Connection connection, CsvReader.Row row,
                               TeamRow.SizeLimits limits, boolean dryRun) {
        TeamRow team;
        try {
            team = TeamRow.from(row, limits);
        } catch (TeamRow.InvalidRowException e) {
            return Outcome.of(Status.REJECTED, e.getMessage());
        }

        String label = "'" + team.teamName() + "'";

        Optional<Long> existingTeamId;
        try {
            existingTeamId = findTeamByName(connection, team.teamName());
        } catch (SQLException e) {
            return Outcome.of(Status.REJECTED, label + " - database error: " + readable(e));
        }

        if (existingTeamId.isPresent()) {
            Set<String> existingEmails;
            try {
                existingEmails = findTeamMemberEmails(connection, existingTeamId.get());
            } catch (SQLException e) {
                return Outcome.of(Status.REJECTED, label + " - database error: " + readable(e));
            }
            Set<String> csvEmails = new LinkedHashSet<>(team.emails());
            if (existingEmails.equals(csvEmails)) {
                claim(team);
                return Outcome.of(Status.ALREADY_PRESENT, label + " - already imported (team "
                        + existingTeamId.get() + ", same " + describeSize(csvEmails.size()) + ")");
            }
            return Outcome.of(Status.REJECTED, label + " - a different team already has this "
                    + "name (team " + existingTeamId.get() + ", members "
                    + String.join(", ", existingEmails) + "). Two teams cannot share a name; "
                    + "one of them has to rename.");
        }

        Integer claimedOn = teamNamesSeen.get(team.teamName());
        if (claimedOn != null) {
            return Outcome.of(Status.REJECTED, label + " - a team on line " + claimedOn
                    + " of this file already uses this name");
        }
        for (String email : team.emails()) {
            String claimedBy = emailsSeen.get(email);
            if (claimedBy != null) {
                return Outcome.of(Status.REJECTED, label + " - " + email + " is already on "
                        + claimedBy + ". A person may only be on one team.");
            }
        }

        try {
            for (String email : team.emails()) {
                Optional<Long> existingUserId = findUserByEmail(connection, email);
                if (existingUserId.isPresent()) {
                    Optional<String> theirTeam = findTeamOfUser(connection, existingUserId.get());
                    if (theirTeam.isPresent()) {
                        return Outcome.of(Status.REJECTED, label + " - " + email
                                + " is already registered and is on team '" + theirTeam.get()
                                + "'. A person may only be on one team.");
                    }
                    return Outcome.of(Status.REJECTED, label + " - " + email
                            + " is already registered (they have an account but no team). "
                            + "Either they registered twice, or this is a judge or admin.");
                }
            }
        } catch (SQLException e) {
            return Outcome.of(Status.REJECTED, label + " - database error: " + readable(e));
        }

        // Screening runs last, on a team that would otherwise have been imported. Everything
        // above it is structural and decides the row on its own terms: a team of six or a
        // person already on another team is not "pending a look", it is wrong, and reporting
        // it as pending would put it on the wrong list and understate it.
        //
        // A pending team deliberately does NOT claim() its name or emails. It holds no rows
        // in the database and no reservation in this run, because it may never be imported
        // at all - and a name reserved by a team that never arrives would reject the team
        // that legitimately takes it.
        List<String> pendingReasons = EligibilityScreening.screen(team);
        if (!pendingReasons.isEmpty()) {
            return new Outcome(Status.PENDING, label + " - " + String.join("\n", pendingReasons),
                    team.warnings());
        }

        return insertTeam(connection, team, label, dryRun);
    }

    private Outcome insertTeam(Connection connection, TeamRow team, String label, boolean dryRun) {
        try {
            List<Long> userIds = new ArrayList<>();
            for (TeamRow.Member member : team.members()) {
                userIds.add(insertUser(connection, member));
            }

            String joinCode = mintJoinCode(connection);
            long teamId = insertTeamRow(connection, team.teamName(), joinCode, userIds.getFirst());

            for (Long userId : userIds) {
                insertTeamMember(connection, userId, teamId);
            }

            if (dryRun) {
                connection.rollback();
                claim(team);
                return new Outcome(Status.WOULD_IMPORT, label + " - "
                        + describeSize(team.members().size()) + ", leader "
                        + team.leader().email(), team.warnings());
            }

            connection.commit();
            claim(team);
            return new Outcome(Status.IMPORTED, label + " - " + describeSize(team.members().size())
                    + ", leader " + team.leader().email() + ", join code " + joinCode,
                    team.warnings());

        } catch (SQLException e) {
            rollbackQuietly(connection);
            return Outcome.of(Status.REJECTED, label + " - " + readable(e));
        }
    }

    private void claim(TeamRow team) {
        teamNamesSeen.put(team.teamName(), team.lineNumber());
        for (String email : team.emails()) {
            emailsSeen.put(email, "team '" + team.teamName() + "' (line " + team.lineNumber() + ")");
        }
    }

    private long insertUser(Connection connection, TeamRow.Member member) throws SQLException {
        try (PreparedStatement statement =
                connection.prepareStatement(INSERT_USER, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, member.email());
            statement.setString(2, member.fullName());
            setNullable(statement, 3, member.phone());
            setNullable(statement, 4, member.resumeUrl());
            setNullable(statement, 5, member.linkedinUrl());
            setNullable(statement, 6, member.githubUrl());
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (!keys.next()) {
                    throw new SQLException("the database returned no id for " + member.email());
                }
                return keys.getLong("id");
            }
        }
    }

    private long insertTeamRow(Connection connection, String name, String joinCode, long leaderId)
            throws SQLException {
        try (PreparedStatement statement =
                connection.prepareStatement(INSERT_TEAM, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, name);
            statement.setString(2, joinCode);
            statement.setLong(3, leaderId);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (!keys.next()) {
                    throw new SQLException("the database returned no id for team '" + name + "'");
                }
                return keys.getLong("id");
            }
        }
    }

    private void insertTeamMember(Connection connection, long userId, long teamId)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(INSERT_TEAM_MEMBER)) {
            statement.setLong(1, userId);
            statement.setLong(2, teamId);
            statement.executeUpdate();
        }
    }

    private String mintJoinCode(Connection connection) throws SQLException {
        for (int attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt++) {
            StringBuilder code = new StringBuilder(JOIN_CODE_LENGTH);
            for (int i = 0; i < JOIN_CODE_LENGTH; i++) {
                code.append(JOIN_CODE_ALPHABET.charAt(random.nextInt(JOIN_CODE_ALPHABET.length())));
            }
            String candidate = code.toString();
            if (joinCodesMinted.contains(candidate)) {
                continue;
            }
            try (PreparedStatement statement = connection.prepareStatement(JOIN_CODE_EXISTS)) {
                statement.setString(1, candidate);
                try (ResultSet results = statement.executeQuery()) {
                    if (!results.next()) {
                        joinCodesMinted.add(candidate);
                        return candidate;
                    }
                }
            }
        }
        throw new SQLException("could not generate an unused join code in " + JOIN_CODE_ATTEMPTS
                + " attempts - this should be impossible and suggests something is wrong");
    }

    private Optional<Long> findTeamByName(Connection connection, String name) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(FIND_TEAM_BY_NAME)) {
            statement.setString(1, name);
            try (ResultSet results = statement.executeQuery()) {
                return results.next() ? Optional.of(results.getLong(1)) : Optional.empty();
            }
        }
    }

    private Set<String> findTeamMemberEmails(Connection connection, long teamId)
            throws SQLException {
        Set<String> emails = new LinkedHashSet<>();
        try (PreparedStatement statement = connection.prepareStatement(FIND_TEAM_MEMBER_EMAILS)) {
            statement.setLong(1, teamId);
            try (ResultSet results = statement.executeQuery()) {
                while (results.next()) {
                    emails.add(results.getString(1));
                }
            }
        }
        return emails;
    }

    private Optional<Long> findUserByEmail(Connection connection, String email) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(FIND_USER_BY_EMAIL)) {
            statement.setString(1, email);
            try (ResultSet results = statement.executeQuery()) {
                return results.next() ? Optional.of(results.getLong(1)) : Optional.empty();
            }
        }
    }

    private Optional<String> findTeamOfUser(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(FIND_TEAM_OF_USER)) {
            statement.setLong(1, userId);
            try (ResultSet results = statement.executeQuery()) {
                return results.next() ? Optional.of(results.getString(1)) : Optional.empty();
            }
        }
    }

    private static void setNullable(PreparedStatement statement, int index, String value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.VARCHAR);
        } else {
            statement.setString(index, value);
        }
    }

    private static void rollbackQuietly(Connection connection) {
        try {
            connection.rollback();
        } catch (SQLException e) {
            System.out.println("  warning: rollback failed: " + e.getMessage());
        }
    }

    private static String readable(SQLException e) {
        String message = e.getMessage() == null ? "" : e.getMessage();
        for (Map.Entry<String, String> entry : CONSTRAINT_EXPLANATIONS.entrySet()) {
            if (message.contains(entry.getKey())) {
                return entry.getValue() + " (" + entry.getKey() + ")";
            }
        }
        return message.replaceAll("\\s+", " ").trim();
    }

    private static String describeSize(int size) {
        return size + (size == 1 ? " member" : " members");
    }

    /**
     * Prints which CSV column fed which field before touching the database, and refuses to
     * continue if any member block mapped only part of itself or contains a disallowed repository question.
     */
    private static boolean reportColumnMapping(CsvReader.Sheet sheet, TeamRow.SizeLimits limits) {
        System.out.println("Column mapping");
        System.out.println("-".repeat(78));

        String teamNameHeader = null;
        for (String alias : TeamRow.teamNameHeaders()) {
            if (sheet.hasHeader(alias)) {
                teamNameHeader = sheet.originalHeader(alias);
                break;
            }
        }
        System.out.printf("  %-22s <- %s%n", "team name",
                teamNameHeader == null ? "(NOT PRESENT)" : "'" + teamNameHeader + "'");

        // Check for disallowed GitHub questions containing "repo" or "repository"
        for (int block = 1; block <= limits.max(); block++) {
            String disallowedHeader = findDisallowedGithubHeader(sheet, block);
            if (disallowedHeader != null) {
                System.out.println();
                System.out.println("STOPPING: GitHub question is titled '" + disallowedHeader
                        + "'. A project repository must not be imported into users.github_url. Rename the form question to 'Member "
                        + block + ": GitHub Profile URL'.");
                return false;
            }
        }

        Map<Integer, List<String>> incompleteBlocks = new LinkedHashMap<>();

        for (int block = 1; block <= limits.max(); block++) {
            List<String> lines = new ArrayList<>();
            boolean blockDeclared = false;
            List<String> missing = new ArrayList<>();
            for (TeamRow.Field field : TeamRow.Field.values()) {
                String found = null;
                for (String alias : field.aliases(block)) {
                    if (sheet.hasHeader(alias)) {
                        found = sheet.originalHeader(alias);
                        break;
                    }
                }
                if (found != null) {
                    blockDeclared = true;
                } else {
                    missing.add(field.label());
                }
                lines.add(String.format("  %-22s <- %s",
                        "member " + block + " " + field.label().toLowerCase(Locale.ROOT),
                        found == null ? "(not present)" : "'" + found + "'"));
            }

            if (block == 1 || blockDeclared) {
                lines.forEach(System.out::println);
                if (!missing.isEmpty()) {
                    incompleteBlocks.put(block, missing);
                }
            } else {
                System.out.printf("  %-22s %s%n", "member " + block, "(no columns - not collected)");
            }
        }
        System.out.println();

        if (teamNameHeader == null) {
            System.out.println("STOPPING: no team name column. Expected a header matching one of "
                    + TeamRow.teamNameHeaders() + " once case and punctuation are ignored.");
            return false;
        }
        if (!hasAnyMajorColumn(sheet, limits)) {
            reportMissingMajorColumn();
            return false;
        }
        if (!incompleteBlocks.isEmpty()) {
            reportIncompleteBlocks(incompleteBlocks);
            return false;
        }
        return true;
    }

    /** Whether the sheet carries a Major column for any member block at all. */
    private static boolean hasAnyMajorColumn(CsvReader.Sheet sheet, TeamRow.SizeLimits limits) {
        for (int block = 1; block <= limits.max(); block++) {
            for (String alias : TeamRow.Field.MAJOR.aliases(block)) {
                if (sheet.hasHeader(alias)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * The one failure this tool must never turn into a quiet success.
     *
     * <p>Screening decides whether a team is on an IT course by reading their major. With no
     * Major column there is no answer to read, and the only two things the importer could do
     * instead are import everybody unchecked or hold everybody pending. The first silently
     * admits a season of registrations nobody screened, which is the exact outcome this
     * check exists to prevent; the second reports every team as needing a human and buries
     * the real ones. So it stops, imports nothing, and says which column to add.
     *
     * <p>It is deliberately reported separately from the generic incomplete-block message,
     * which would otherwise render this as "member 1's block is incomplete" — true, but it
     * reads as a typo in one question rather than as the whole screening step being absent.
     */
    private static void reportMissingMajorColumn() {
        System.out.println("STOPPING: the sheet has no Major column for any member, so no team "
                + "can be screened for an IT-related course.");
        System.out.println();
        System.out.println("Nothing was imported. This is not a row-level problem to chase - the "
                + "question is missing from the form, and importing everyone unscreened because "
                + "a column vanished is worse than importing nobody.");
        System.out.println();
        System.out.println("Add the question to the Google Form, titled 'Member N: Major / Field "
                + "of Study', and re-export. Recognised spellings for member 1, once case and "
                + "punctuation are ignored:");
        System.out.println("  " + String.join(", ", TeamRow.Field.MAJOR.aliases(1)));
    }

    private static String findDisallowedGithubHeader(CsvReader.Sheet sheet, int block) {
        for (Map.Entry<String, String> entry : sheet.headersByNormalisedName().entrySet()) {
            String norm = entry.getKey();
            String orig = entry.getValue();
            if (norm.startsWith("member" + block)) {
                if ((norm.contains("github") || norm.contains("git"))
                        && (norm.contains("repo") || norm.contains("project") || orig.toLowerCase(Locale.ROOT).contains("repository"))) {
                    return orig;
                }
            }
        }
        return null;
    }

    /** Explains every member block that mapped some but not all of its columns. */
    private static void reportIncompleteBlocks(Map<Integer, List<String>> incompleteBlocks) {
        for (Map.Entry<Integer, List<String>> entry : incompleteBlocks.entrySet()) {
            int block = entry.getKey();
            String who = block == 1
                    ? "the leader's block (member 1)"
                    : "member " + block + "'s block";
            System.out.println("STOPPING: " + who + " is incomplete - no column for "
                    + String.join(", ", entry.getValue()) + ".");
        }
        System.out.println();
        System.out.println("A member block is all " + TeamRow.fieldLabels().size()
                + " columns or none at all: " + String.join(", ", TeamRow.fieldLabels()) + ".");
        System.out.println("Member 1 is the leader and every row has one, so its columns are "
                + "always required. Members 2-5 may be left out of the form entirely, but a team "
                + "with fewer than five members leaves those columns EMPTY - it does not omit "
                + "them. A block with only some of its columns is a mis-titled question, and "
                + "importing it would silently store nulls for data the form did collect.");
        System.out.println();
        System.out.println("Rename the sheet's header row to the canonical names:");
        for (Integer block : incompleteBlocks.keySet()) {
            System.out.println("  member " + block + ": " + TeamRow.canonicalHeaders(block));
        }
    }

    private static void printSummary(List<Outcome> outcomes, boolean dryRun,
                                     List<String> pendingReport, List<String> rejectedReport) {
        long imported = outcomes.stream()
                .filter(o -> o.status() == Status.IMPORTED || o.status() == Status.WOULD_IMPORT)
                .count();
        long alreadyPresent =
                outcomes.stream().filter(o -> o.status() == Status.ALREADY_PRESENT).count();
        long rejected = outcomes.stream().filter(o -> o.status() == Status.REJECTED).count();
        long pending = outcomes.stream().filter(o -> o.status() == Status.PENDING).count();

        System.out.println("-".repeat(78));
        System.out.printf("%d data row%s: %d %s, %d already present, %d pending, %d rejected%n",
                outcomes.size(), outcomes.size() == 1 ? "" : "s",
                imported, dryRun ? "would import" : "imported",
                alreadyPresent, pending, rejected);

        long needingAHuman = pending + rejected;
        if (needingAHuman > 0) {
            System.out.printf("%d row%s %s a human - see the two lists below.%n",
                    needingAHuman, needingAHuman == 1 ? "" : "s",
                    needingAHuman == 1 ? "needs" : "need");
        }

        // The two lists are printed apart because the two jobs are different. Chasing a
        // pending team means editing the spreadsheet; a rejected team has to register again.
        // Whoever does the chasing should not have to sort one from the other by eye.
        if (pending > 0) {
            System.out.println();
            System.out.printf("PENDING - %d team%s NOT imported, waiting on a human:%n",
                    pending, pending == 1 ? " was" : "s were");
            pendingReport.forEach(System.out::println);
            System.out.println("  Nothing was written for these teams. Fix the sheet and run "
                    + "again - they are re-checked");
            System.out.println("  from scratch every run, so there is nothing to undo and "
                    + "nothing to clear.");
        }

        if (rejected > 0) {
            System.out.println();
            System.out.printf("REJECTED - %d team%s not be imported as %s stand%s:%n",
                    rejected, rejected == 1 ? " could" : "s could",
                    rejected == 1 ? "it" : "they", rejected == 1 ? "s" : "");
            rejectedReport.forEach(System.out::println);
            System.out.println("  These are not fixable by re-running. The row itself has to "
                    + "change - usually a new");
            System.out.println("  registration from the team, or a decision about which team "
                    + "keeps a name or a member.");
        }

        if (dryRun) {
            System.out.println();
            System.out.println("DRY RUN - nothing was committed. Every team above was written and "
                    + "then rolled back, so the constraints really did run. Re-run without "
                    + "--dry-run to keep the results.");
        }

        // The four original keys keep their names, their meanings and their order: they are
        // documented as stable and something unattended may already be reading them.
        // pending= is appended rather than inserted for the same reason.
        System.out.println();
        System.out.printf("RESULT mode=%s rows=%d imported=%d skipped=%d rejected=%d pending=%d%n",
                dryRun ? "dry-run" : "live", outcomes.size(), imported, alreadyPresent, rejected,
                pending);
    }

    private static Options parseArguments(String[] args) {
        Path file = null;
        String sheetId = null;
        String tab = null;
        Path credentials = null;
        boolean dryRun = false;
        String url = envOrDefault("IMPORT_DB_URL", DEFAULT_URL);
        String user = envOrDefault("IMPORT_DB_USER", DEFAULT_USER);
        String password = envOrDefault("IMPORT_DB_PASSWORD", DEFAULT_PASSWORD);

        for (String arg : args) {
            if (arg.equals("--help") || arg.equals("-h")) {
                return null;
            } else if (arg.equals("--dry-run")) {
                dryRun = true;
            } else if (arg.startsWith("--file=")) {
                file = Path.of(value(arg));
            } else if (arg.startsWith("--sheet-id=")) {
                sheetId = value(arg);
            } else if (arg.startsWith("--tab=")) {
                tab = value(arg);
            } else if (arg.startsWith("--credentials=")) {
                credentials = Path.of(value(arg));
            } else if (arg.startsWith("--url=")) {
                url = value(arg);
            } else if (arg.startsWith("--user=")) {
                user = value(arg);
            } else if (arg.startsWith("--password=")) {
                password = value(arg);
            } else {
                throw new IllegalArgumentException("unrecognised argument '" + arg + "'");
            }
        }

        if (file == null && sheetId == null) {
            throw new IllegalArgumentException("either --file or --sheet-id is required");
        }
        if (file != null && sheetId != null) {
            throw new IllegalArgumentException("cannot specify both --file and --sheet-id");
        }
        if (file != null && !Files.isReadable(file)) {
            throw new IllegalArgumentException("cannot read '" + file + "'");
        }
        if (sheetId != null) {
            if (credentials == null) {
                String envCreds = System.getenv("GOOGLE_APPLICATION_CREDENTIALS");
                if (envCreds != null && !envCreds.isBlank()) {
                    credentials = Path.of(envCreds);
                } else if (Files.exists(Path.of("backend", "credentials", "sheets-key.json"))) {
                    credentials = Path.of("backend", "credentials", "sheets-key.json");
                } else if (Files.exists(Path.of("credentials", "sheets-key.json"))) {
                    credentials = Path.of("credentials", "sheets-key.json");
                } else {
                    credentials = Path.of("backend", "credentials", "sheets-key.json");
                }
            }
        }
        return new Options(file, sheetId, tab, credentials, dryRun, url, user, password);
    }

    private static String value(String arg) {
        String value = arg.substring(arg.indexOf('=') + 1);
        if (value.isBlank()) {
            throw new IllegalArgumentException("'" + arg + "' has no value");
        }
        return value;
    }

    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static void printUsage() {
        System.out.println("""
                Imports Google Form team registrations from a CSV or directly from Google Sheets into the database.

                  --file=<path>            the CSV exported from the form's Google Sheet
                  --sheet-id=<id>          the Google Spreadsheet ID to read directly via Sheets API
                  --tab=<tabName>          tab name when using --sheet-id (default 'Form responses 1')
                  --credentials=<path>     service account JSON key path (default backend/credentials/sheets-key.json)
                  --dry-run                validate and report without keeping anything
                  --url=<jdbc url>         default jdbc:postgresql://localhost:5433/hackathon_db
                  --user=<role>            default hackathon_app
                  --password=<pw>          default the local development password
                  --help                   this message

                The final line is machine-readable and its keys are stable:

                  RESULT mode=live rows=8 imported=2 skipped=0 rejected=5 pending=1

                Exit codes:

                  0   the import ran to the end and nothing needs a human
                  1   the import ran to the end, but rejected= or pending= is non-zero and
                      those rows need a human. Everything else was still imported
                  2   nothing was imported. Bad arguments, unreadable credentials or sheet,
                      a member block missing some of its columns, no Major column at all,
                      a file with no data rows, or no reachable database

                A RESULT line is printed for 0 and 1 and never for 2, so an unattended
                caller can rely on the exit code alone.

                Three outcomes per team:

                  IMPORTED  clean, written to the database
                  PENDING   screening held it for a human. NOT written to the database, and
                            re-checked from the sheet on every run - correct the sheet and
                            the team imports itself; there is nothing to undo or clear
                  REJECTED  structurally wrong and unfixable without a new registration: a
                            duplicate email, a person on two teams, a duplicate team name,
                            a team outside the permitted size

                Screening holds a team PENDING when no member's major contains an IT
                keyword, when a resume, LinkedIn or GitHub link is blank or on the wrong
                domain, or when a phone number is not 8-15 digits. The keyword list is
                printed in the run header, before anything is read.

                Links are checked for SHAPE and DOMAIN ONLY. Nothing calls the network, so
                a clean run is not evidence that a link resolves, that a Drive file is
                shared, or that a profile exists or belongs to the person who typed it.

                Connection settings also read IMPORT_DB_URL, IMPORT_DB_USER and
                IMPORT_DB_PASSWORD. Prefer those over --password, which is visible to
                anyone who can list processes.

                Expected columns (case and punctuation are ignored, unknown columns such as
                Google's Timestamp are skipped):

                  Team Name
                  Member 1 Name, Member 1 Email, Member 1 Phone, Member 1 Major,
                  Member 1 Resume, Member 1 LinkedIn, Member 1 GitHub
                  ... and the same seven for Member 2, Member 3, Member 4 and Member 5.

                Member N GitHub is the PERSON's GitHub account, collected so admins can
                screen applicants. It is not a project repository - this tool never
                writes submissions.github_url.

                Member N Major feeds the IT course check and is stored nowhere: users has
                no major column. If the sheet has no Major column at all, the run aborts
                with exit 2 rather than importing a season of registrations unscreened.

                Re-running is safe. A team already in the database with exactly the members
                the CSV lists is reported and left alone; each team is one transaction, so
                nothing is ever half-written.

                Example:
                  ./mvnw compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
                  ./mvnw compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --dry-run"
                """);
    }
}
