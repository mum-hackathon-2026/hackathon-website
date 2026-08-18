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
    /** The import ran to the end and no row was rejected. */
    static final int EXIT_OK = 0;
    /** The import ran to the end, but at least one row was rejected and needs a human. */
    static final int EXIT_REJECTIONS = 1;
    /** Nothing was imported: bad arguments, an unreadable or mis-titled sheet, or no database. */
    static final int EXIT_ABORTED = 2;

    private static final String INSERT_USER = """
            insert into users (email, full_name, role, email_verified, phone, resume_url,
                               linkedin_url, github_url)
            values (?, ?, 'participant', false, ?, ?, ?, ?)
            """;

    private static final String INSERT_TEAM =
            "insert into teams (name, join_code, created_by) values (?, ?, ?)";

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

    private enum Status {
        IMPORTED("IMPORTED"),
        WOULD_IMPORT("WOULD IMPORT"),
        ALREADY_PRESENT("SKIPPED"),
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
        System.out.println();

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

        if (!reportColumnMapping(sheet)) {
            return EXIT_ABORTED;
        }

        if (sheet.rows().isEmpty()) {
            System.out.println("The file has a header row but no data rows. Nothing to do.");
            return EXIT_ABORTED;
        }

        try (Connection connection = DriverManager.getConnection(
                options.url(), options.user(), options.password())) {
            connection.setAutoCommit(false);
            return importAll(connection, sheet, options.dryRun());
        } catch (SQLException e) {
            System.out.println();
            System.out.println("Could not connect to " + options.url() + " as " + options.user()
                    + ": " + e.getMessage());
            System.out.println("Is the Docker container running? `docker start hackathon-pg16`");
            return EXIT_ABORTED;
        }
    }

    private int importAll(Connection connection, CsvReader.Sheet sheet, boolean dryRun)
            throws SQLException {
        List<Outcome> outcomes = new ArrayList<>();

        System.out.println("Rows");
        System.out.println("-".repeat(78));

        for (CsvReader.Row row : sheet.rows()) {
            Outcome outcome = processRow(connection, row, dryRun);
            outcomes.add(outcome);

            System.out.printf("line %-4d %-13s %s%n",
                    row.lineNumber(), outcome.status().label, outcome.detail());
            for (String warning : outcome.warnings()) {
                System.out.printf("%s  note: %s%n", " ".repeat(18), warning);
            }
        }

        printSummary(outcomes, dryRun);

        boolean anyRejected = outcomes.stream().anyMatch(o -> o.status() == Status.REJECTED);
        return anyRejected ? EXIT_REJECTIONS : EXIT_OK;
    }

    /**
     * Handles one team. Every rejection returns an {@link Outcome} rather than throwing, so
     * one bad row never stops the import — the point of the report is that a human can chase
     * all the rejects in one pass instead of discovering them one re-run at a time.
     */
    private Outcome processRow(Connection connection, CsvReader.Row row, boolean dryRun) {
        TeamRow team;
        try {
            team = TeamRow.from(row);
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
    private static boolean reportColumnMapping(CsvReader.Sheet sheet) {
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
        for (int block = 1; block <= TeamRow.MAX_TEAM_SIZE; block++) {
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

        for (int block = 1; block <= TeamRow.MAX_TEAM_SIZE; block++) {
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
        if (!incompleteBlocks.isEmpty()) {
            reportIncompleteBlocks(incompleteBlocks);
            return false;
        }
        return true;
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

    /** Explains every member block that mapped some but not all of its six columns. */
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
        System.out.println("A member block is all six columns or none at all: "
                + String.join(", ", TeamRow.fieldLabels()) + ".");
        System.out.println("Member 1 is the leader and every row has one, so its six columns are "
                + "always required. Members 2-4 may be left out of the form entirely, but a team "
                + "with fewer than four members leaves those columns EMPTY - it does not omit "
                + "them. A block with only some of its columns is a mis-titled question, and "
                + "importing it would silently store nulls for data the form did collect.");
        System.out.println();
        System.out.println("Rename the sheet's header row to the canonical names:");
        for (Integer block : incompleteBlocks.keySet()) {
            System.out.println("  member " + block + ": " + TeamRow.canonicalHeaders(block));
        }
    }

    private static void printSummary(List<Outcome> outcomes, boolean dryRun) {
        long imported = outcomes.stream()
                .filter(o -> o.status() == Status.IMPORTED || o.status() == Status.WOULD_IMPORT)
                .count();
        long alreadyPresent =
                outcomes.stream().filter(o -> o.status() == Status.ALREADY_PRESENT).count();
        long rejected = outcomes.stream().filter(o -> o.status() == Status.REJECTED).count();

        System.out.println("-".repeat(78));
        System.out.printf("%d data row%s: %d %s, %d already present, %d rejected%n",
                outcomes.size(), outcomes.size() == 1 ? "" : "s",
                imported, dryRun ? "would import" : "imported",
                alreadyPresent, rejected);

        if (rejected > 0) {
            System.out.printf("%d row%s %s a human - see the REJECTED lines above.%n",
                    rejected, rejected == 1 ? "" : "s", rejected == 1 ? "needs" : "need");
        }
        if (dryRun) {
            System.out.println();
            System.out.println("DRY RUN - nothing was committed. Every team above was written and "
                    + "then rolled back, so the constraints really did run. Re-run without "
                    + "--dry-run to keep the results.");
        }

        System.out.println();
        System.out.printf("RESULT mode=%s rows=%d imported=%d skipped=%d rejected=%d%n",
                dryRun ? "dry-run" : "live", outcomes.size(), imported, alreadyPresent, rejected);
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

                  RESULT mode=live rows=8 imported=2 skipped=0 rejected=6

                Exit codes:

                  0   the import ran to the end and nothing was rejected
                  1   the import ran to the end, but rejected= is non-zero and those
                      rows need a human. Everything else was still imported
                  2   nothing was imported. Bad arguments, unreadable credentials or sheet,
                      a member block missing some of its columns, a file with no
                      data rows, or no reachable database

                A RESULT line is printed for 0 and 1 and never for 2, so an unattended
                caller can rely on the exit code alone.

                Connection settings also read IMPORT_DB_URL, IMPORT_DB_USER and
                IMPORT_DB_PASSWORD. Prefer those over --password, which is visible to
                anyone who can list processes.

                Expected columns (case and punctuation are ignored, unknown columns such as
                Google's Timestamp are skipped):

                  Team Name
                  Member 1 Name, Member 1 Email, Member 1 Phone, Member 1 Resume,
                  Member 1 LinkedIn, Member 1 GitHub
                  ... and the same six for Member 2, Member 3 and Member 4.

                Member N GitHub is the PERSON's GitHub account, collected so admins can
                screen applicants. It is not a project repository - this tool never
                writes submissions.github_url.

                Re-running is safe. A team already in the database with exactly the members
                the CSV lists is reported and left alone; each team is one transaction, so
                nothing is ever half-written.

                Example:
                  ./mvnw compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
                  ./mvnw compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --dry-run"
                """);
    }
}
