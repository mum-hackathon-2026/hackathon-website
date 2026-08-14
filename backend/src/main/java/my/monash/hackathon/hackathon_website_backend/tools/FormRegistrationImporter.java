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
 * Imports Google Form team registrations from an exported CSV into users, teams and
 * team_members.
 *
 * <h2>Why a plain Java main rather than a Python script</h2>
 *
 * <p>The choice is about what has to be installed and what has to be kept in step. This
 * repository already builds with Maven, already ships the PostgreSQL JDBC driver, and
 * already pins Java 21 in CI — so a Java tool adds no toolchain, no second dependency
 * manifest, and no separate thing for a teammate to install before they can run it. It is
 * compiled by the same {@code mvnw verify} that compiles everything else, which means a
 * column renamed in a later migration breaks the build rather than breaking at 2am during
 * registration. A Python script would need its own interpreter, its own {@code psycopg2},
 * and would be checked by nothing.
 *
 * <p>It deliberately does <em>not</em> boot Spring. Starting the application context would
 * run Flyway, run {@code ddl-auto=validate}, and demand the Google client id and JWT secret
 * this tool has no use for. Plain JDBC also gives exactly the control the task needs:
 * one explicit transaction per team, committed or rolled back by hand.
 *
 * <h2>Usage</h2>
 *
 * <pre>{@code
 * ./mvnw compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
 * ./mvnw compile exec:java "-Dexec.args=--file=registrations.csv"
 * }</pre>
 *
 * <p>Connection settings default to the local Docker container as the {@code hackathon_app}
 * role — DML only, which is all an importer needs; it has no business holding DDL rights.
 * Override with {@code IMPORT_DB_URL} / {@code IMPORT_DB_USER} / {@code IMPORT_DB_PASSWORD},
 * or with {@code --url=} / {@code --user=} / {@code --password=}. Prefer the environment
 * variables: a password on the command line is visible to anyone who can list processes.
 *
 * <h2>Idempotency</h2>
 *
 * <p>The form keeps collecting, so this runs again and again over a growing export. A team
 * whose name is already in the database <em>and</em> whose members are exactly the ones in
 * the CSV row is reported as already present and left alone. A team whose name is taken but
 * whose members differ is rejected rather than merged — that is two different teams that
 * picked the same name, and a person has to resolve it.
 *
 * <p>Each team is one transaction. A team that fails at any step is rolled back whole, so
 * there is no such thing as a half-registered team to clean up.
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

    // google_sub is deliberately absent from the column list: a form registration has no
    // Google identity yet, so the column takes its NULL. V3 dropped NOT NULL precisely so
    // this insert is possible. role and email_verified are stated rather than left to the
    // column DEFAULT so the tool's intent is legible in the SQL itself.
    // github_url below is users.github_url - the PERSON's own account, collected for
    // screening. It is not submissions.github_url, which is a team's project repository;
    // this tool never touches submissions at all.
    private static final String INSERT_USER = """
            insert into users (email, full_name, role, email_verified, phone, resume_url,
                               linkedin_url, github_url)
            values (?, ?, 'participant', false, ?, ?, ?, ?)
            """;

    // status and shortlisted take their column DEFAULTs ('forming', false). Submission
    // state is not this tool's business.
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

    /**
     * Postgres constraint names mapped to something a person can act on. This is the safety
     * net under the checks the importer makes for itself: if the database refuses a row for
     * a reason the tool did not anticipate, the report still says what happened in words
     * rather than printing a stack trace at somebody.
     */
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

    private record Options(Path file, boolean dryRun, String url, String user, String password) {}

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
        System.out.println("  file      : " + options.file().toAbsolutePath());
        System.out.println("  database  : " + options.url() + " as " + options.user());
        System.out.println("  mode      : " + (options.dryRun()
                ? "DRY RUN - every team is validated against the real database, then rolled back"
                : "LIVE - teams that validate are committed"));
        System.out.println();

        CsvReader.Sheet sheet;
        try {
            sheet = CsvReader.read(options.file());
        } catch (IOException e) {
            System.out.println("Could not read " + options.file() + ": " + e.getMessage());
            return EXIT_ABORTED;
        } catch (CsvReader.MalformedCsvException e) {
            System.out.println("Could not parse " + options.file() + ": " + e.getMessage());
            return EXIT_ABORTED;
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

        // A team already in the database with exactly these members is a re-run of a row
        // that already succeeded. Checked first, because on a second run every one of its
        // members' emails is legitimately taken and every other check below would fire.
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

        // Clashes with earlier rows in this same file. The database cannot catch these in a
        // dry run, because a dry run rolls each team back before the next one is read.
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

        // Clashes with people already in the database.
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

    /**
     * Writes one team inside one transaction. A dry run does the identical work and then
     * rolls back instead of committing, so what it validates is the real thing — every CHECK,
     * every UNIQUE index and every foreign key fires exactly as it would on a live run,
     * rather than being approximated by the tool's own checks.
     */
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
                // Claimed even though the insert was rolled back. Without this a dry run
                // would pass a file in which two rows share a member: row 1 leaves no trace
                // in the database for row 4's lookup to find, so only the in-run record
                // catches it. A dry run that misses a rejection a live run would make is
                // worse than no dry run at all.
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

    /**
     * Records a team's name and emails as taken for the rest of this run. Called for teams
     * that were written and for teams found already present, because in both cases those
     * identifiers genuinely belong to somebody by the time the next row is read.
     *
     * <p>A dry run calls it too, on a team whose insert was rolled back, because the rest of
     * the file still has to be judged as though that team exists.
     */
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

    /**
     * Turns a driver exception into one readable line. The constraint name is matched in the
     * message text rather than through {@code PSQLException.getServerErrorMessage()} so the
     * tool does not compile against the driver, which is a runtime-scoped dependency.
     */
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
     * continue if any member block mapped only part of itself. A silent mismatch here is the
     * worst failure this tool has - it would import a participant with a null resume and
     * report success - so the mapping is shown rather than assumed.
     *
     * <p>The rule is the same for all four blocks: <strong>all six columns or none at all</strong>.
     * Member 1 is the leader and every row has one, so its block may never be absent. Members
     * 2-4 may be absent entirely, because a form that only ever collects pairs is a legitimate
     * shape - but a block with <em>some</em> of its columns is not a smaller team, it is a
     * mis-titled question. A team with fewer than four members leaves those columns empty; it
     * does not omit them.
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

        // Block number to the labels it failed to map. Every offending block is collected
        // before anything is reported: fixing a header row means a trip to the spreadsheet,
        // and whoever makes it should be able to fix all of them in one go rather than
        // discovering the next one on the next run.
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

            // Member 1 is always required, so its block is always shown and always checked,
            // even when not one of its columns mapped.
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

        // The last line, in a fixed key=value shape, for a caller that is not a person.
        // Everything above is written to be read; this is written to be parsed, so that an
        // unattended job can tell that rejects happened without scraping the per-row report.
        // `mode` is part of it deliberately: a dry run and a live run otherwise produce
        // identical counts, and a scheduler must never mistake one for the other.
        // KEEP THE KEYS STABLE - something will grep for them.
        System.out.println();
        System.out.printf("RESULT mode=%s rows=%d imported=%d skipped=%d rejected=%d%n",
                dryRun ? "dry-run" : "live", outcomes.size(), imported, alreadyPresent, rejected);
    }

    private static Options parseArguments(String[] args) {
        Path file = null;
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

        if (file == null) {
            throw new IllegalArgumentException("--file is required");
        }
        if (!Files.isReadable(file)) {
            throw new IllegalArgumentException("cannot read '" + file + "'");
        }
        return new Options(file, dryRun, url, user, password);
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
                Imports Google Form team registrations from a CSV into the hackathon database.

                  --file=<path>       the CSV exported from the form's Google Sheet (required)
                  --dry-run           validate and report without keeping anything
                  --url=<jdbc url>    default jdbc:postgresql://localhost:5433/hackathon_db
                  --user=<role>       default hackathon_app
                  --password=<pw>     default the local development password
                  --help              this message

                The final line is machine-readable and its keys are stable:

                  RESULT mode=live rows=8 imported=2 skipped=0 rejected=6

                Exit codes:

                  0   the import ran to the end and nothing was rejected
                  1   the import ran to the end, but rejected= is non-zero and those
                      rows need a human. Everything else was still imported
                  2   nothing was imported. Bad arguments, an unreadable or malformed
                      CSV, a member block missing some of its columns, a file with no
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
                """);
    }
}
