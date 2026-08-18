package my.monash.hackathon.hackathon_website_backend.tools;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Covers the column guards and the exit codes of {@link FormRegistrationImporter}.
 *
 * <p>Deliberately not a Spring test. The importer is a plain {@code main} on raw JDBC and
 * booting a context to exercise it would test something other than what runs in anger. It
 * calls {@link FormRegistrationImporter#run(String[])}, which returns the exit code instead
 * of setting it, so the assertions can read the code without ending the JVM.
 *
 * <p>Runs against the same real PostgreSQL the rest of the suite uses - hackathon_db_test
 * locally, or the CI service container when DB_TEST_URL is set. The importer commits, so
 * unlike the JPA slices these rows are not rolled back for us; every row this class creates
 * is tagged with {@link #EMAIL_DOMAIN} or {@link #TEAM_PREFIX} and deleted before and after
 * each test. Tagging rather than truncating keeps the blast radius to this class's own data.
 */
class FormRegistrationImporterTest {

    private static final String DB_URL =
            envOrDefault("DB_TEST_URL", "jdbc:postgresql://localhost:5433/hackathon_db_test");
    private static final String DB_USER = envOrDefault("DB_TEST_USER", "hackathon_app");
    private static final String DB_PASSWORD = envOrDefault("DB_TEST_PASSWORD", "dev_app_local");

    /** Every email this class invents ends here, so cleanup can find them and nothing else. */
    private static final String EMAIL_DOMAIN = "importer-test.example";

    /** Every team name this class invents starts here, for the same reason. */
    private static final String TEAM_PREFIX = "ITEST ";

    private static final List<String> FIELDS =
            List.of("Name", "Email", "Phone", "Resume", "LinkedIn", "GitHub");

    /** Six empty cells: a member block that is present in the form but not filled in. */
    private static final String NO_MEMBER = ",,,,,";

    @TempDir private Path tempDir;

    private record Run(int exitCode, String output) {}

    @BeforeEach
    void clearBefore() throws SQLException {
        deleteTestRows();
    }

    @AfterEach
    void clearAfter() throws SQLException {
        deleteTestRows();
    }

    // ------------------------------------------------------------------ the member 2-4 guard

    @Test
    void memberBlockMissingOneColumnAbortsAndNamesIt() throws IOException, SQLException {
        // Member 3's block declares five of its six columns - the shape a mis-titled form
        // question produces. Before the guard existed this imported happily, storing a null
        // GitHub URL for a member whose GitHub URL the form had actually collected.
        Path file = csv("missing-column.csv",
                "Timestamp,Team Name,"
                        + "Member 1 Name,Member 1 Email,Member 1 Phone,Member 1 Resume,"
                        + "Member 1 LinkedIn,Member 1 GitHub,"
                        + "Member 3 Name,Member 3 Email,Member 3 Phone,Member 3 Resume,"
                        + "Member 3 LinkedIn",
                "2026/08/01 9:00:00 AM GMT+8," + team("Partial Block") + ","
                        + member("Leader One") + ","
                        + "Third Person," + email("Third Person") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/third/view,"
                        + "https://www.linkedin.com/in/third");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: member 3's block is incomplete - no column for GitHub.")
                .contains("A member block is all six columns or none at all: "
                        + "Name, Email, Phone, Resume, LinkedIn, GitHub.")
                .contains("'Member 3 GitHub'")
                .doesNotContain("RESULT ");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void everyIncompleteBlockIsReportedInOneRun() throws IOException {
        // Two mis-titled blocks are both named, so one trip to the spreadsheet fixes both.
        Path file = csv("two-partial.csv",
                "Timestamp,Team Name,"
                        + "Member 1 Name,Member 1 Email,Member 1 Phone,Member 1 Resume,"
                        + "Member 1 LinkedIn,Member 1 GitHub,"
                        + "Member 2 Name,Member 2 Email,"
                        + "Member 4 Name,Member 4 Phone",
                "2026/08/01 9:00:00 AM GMT+8," + team("Two Partial") + ","
                        + member("Leader One") + ","
                        + "Second," + email("Second") + ","
                        + "Fourth,+60 12-000 0000");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: member 2's block is incomplete - no column for "
                        + "Phone, Resume, LinkedIn, GitHub.")
                .contains("STOPPING: member 4's block is incomplete - no column for "
                        + "Email, Resume, LinkedIn, GitHub.");
    }

    @Test
    void leaderBlockMissingOneColumnStillAborts() throws IOException {
        Path file = csv("no-leader-resume.csv",
                "Timestamp,Team Name,Member 1 Name,Member 1 Email,Member 1 Phone,"
                        + "Member 1 LinkedIn,Member 1 GitHub",
                "2026/08/01 9:00:00 AM GMT+8," + team("No Resume") + ",Leader One,"
                        + email("Leader One") + ",+60 12-000 0000,"
                        + "https://www.linkedin.com/in/leader-one,https://github.com/leader-one");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: the leader's block (member 1) is incomplete - "
                        + "no column for Resume.")
                // The old message claimed five columns; V4 made it six.
                .doesNotContain("all five of member 1's columns");
    }

    @Test
    void memberBlockAbsentEntirelyIsAcceptedAsASmallerForm() throws IOException, SQLException {
        // The guard must not over-correct. A form that only ever collects two members has no
        // member 3 or 4 columns at all, and that is a legitimate sheet, not a mis-titled one.
        Path file = csv("two-blocks.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Pair Only") + ","
                        + member("Alpha One") + "," + member("Beta Two"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output())
                .containsPattern("member 3\\s+\\(no columns - not collected\\)")
                .containsPattern("member 4\\s+\\(no columns - not collected\\)")
                .contains("IMPORTED")
                .contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0");
        assertThat(countUsers()).isEqualTo(2);
    }

    // ------------------------------------------------------------------ duplicate headers

    @Test
    void exactDuplicateColumnTitleAborts() throws IOException, SQLException {
        // Google Forms permits two questions with the same title. The row reader keys values
        // by normalised header, so the second column silently won before this was refused.
        Path file = csv("duplicate-header.csv",
                header(1) + ",Member 1 Name",
                "2026/08/01 9:00:00 AM GMT+8," + team("Duplicate Header") + ","
                        + member("First Spelling") + ",Second Spelling");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("two columns have the same name: 'Member 1 Name'")
                .doesNotContain("RESULT ");
        assertThat(countUsers()).isZero();
    }

    @Test
    void columnTitlesDifferingOnlyInPunctuationStillAbort() throws IOException {
        Path file = csv("near-duplicate-header.csv",
                header(1) + ",member_1_name",
                "2026/08/01 9:00:00 AM GMT+8," + team("Near Duplicate") + ","
                        + member("First Spelling") + ",Second Spelling");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output()).contains("two columns mean the same thing once punctuation "
                + "and case are ignored");
    }

    // ------------------------------------------------------------------ exit codes

    @Test
    void exitCodeIsZeroWhenEveryRowImports() throws IOException, SQLException {
        Path file = csv("three-members.csv",
                header(4),
                "2026/08/01 9:00:00 AM GMT+8," + team("Trio") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + member("Gamma Three") + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output())
                .contains("IMPORTED")
                .contains("3 members")
                .contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0");

        assertThat(countUsers()).isEqualTo(3);
        assertThat(countTeams()).isEqualTo(1);

        // The whole point of the guard: every collected field actually landed.
        assertThat(queryOne(
                """
                select count(*) from users
                where email like ? and phone is not null and resume_url is not null
                  and linkedin_url is not null and github_url is not null
                  and google_sub is null and role = 'participant'
                """,
                "%@" + EMAIL_DOMAIN))
                .isEqualTo(3);

        // created_by is the first member listed.
        assertThat(queryOne(
                """
                select count(*) from teams t join users u on u.id = t.created_by
                where t.name like ? and u.email = ?
                """,
                TEAM_PREFIX + "%", email("Alpha One")))
                .isEqualTo(1);
    }

    @Test
    void exitCodeIsOneWhenSomethingIsRejected() throws IOException, SQLException {
        Path file = csv("one-bad-row.csv",
                header(4),
                "2026/08/01 9:00:00 AM GMT+8," + team("Good Team") + ","
                        + member("Alpha One") + "," + NO_MEMBER + "," + NO_MEMBER + "," + NO_MEMBER,
                "2026/08/01 9:05:00 AM GMT+8," + team("Bad Team") + ","
                        + "Broken Person,not-an-email,+60 12-000 0000,"
                        + "https://drive.google.com/file/d/broken/view,"
                        + "https://www.linkedin.com/in/broken,https://github.com/broken,"
                        + NO_MEMBER + "," + NO_MEMBER + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("RESULT mode=live rows=2 imported=1 skipped=0 rejected=1")
                // Singular, and the verb agrees with it.
                .contains("1 row needs a human")
                .doesNotContain("1 row need a human");

        // A rejection does not cost the good row its import.
        assertThat(countUsers()).isEqualTo(1);
        assertThat(countTeams()).isEqualTo(1);
    }

    @Test
    void pluralRejectionMessageAgrees() throws IOException {
        Path file = csv("two-bad-rows.csv",
                header(1),
                "2026/08/01 9:00:00 AM GMT+8," + team("Bad One") + ",Broken,not-an-email,"
                        + "+60 12-000 0000,https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com/in/b,https://github.com/b",
                "2026/08/01 9:05:00 AM GMT+8,,Nameless Team,other@" + EMAIL_DOMAIN
                        + ",+60 12-000 0000,https://drive.google.com/file/d/c/view,"
                        + "https://www.linkedin.com/in/c,https://github.com/c");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output()).contains("2 rows need a human");
    }

    @Test
    void dryRunWithRejectionsAlsoExitsOne() throws IOException {
        Path file = csv("dry-bad.csv",
                header(1),
                "2026/08/01 9:00:00 AM GMT+8," + team("Bad One") + ",Broken,not-an-email,"
                        + "+60 12-000 0000,https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com/in/b,https://github.com/b");

        Run run = runImporter("--file=" + file, "--dry-run");

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output()).contains("RESULT mode=dry-run rows=1 imported=0 "
                + "skipped=0 rejected=1");
    }

    @Test
    void exitCodeIsTwoWhenTheCsvIsMalformed() throws IOException {
        Path file = csv("malformed.csv",
                header(1),
                "2026/08/01 9:00:00 AM GMT+8,\"" + team("Unterminated") + ",Alice,"
                        + email("Alice") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/a/view,"
                        + "https://www.linkedin.com/in/a,https://github.com/a");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("the file ends inside a quoted field - a closing double quote is missing")
                .doesNotContain("RESULT ");
        // The console this lands on is frequently cp1252; a non-ASCII dash arrives as U+FFFD.
        assertThat(run.output()).doesNotContain("—").doesNotContain("�");
    }

    @Test
    void exitCodeIsTwoWhenTheFileHasNoDataRows() throws IOException {
        Path file = csv("header-only.csv", header(4));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("The file has a header row but no data rows.")
                .doesNotContain("RESULT ");
    }

    @Test
    void exitCodeIsTwoWhenTheSourceArgumentsAreMissing() {
        Run run = runImporter();

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output()).contains("error: either --file or --sheet-id is required");
    }

    @Test
    void exitCodeIsTwoWhenBothFileAndSheetIdAreGiven() {
        Run run = runImporter("--file=some.csv", "--sheet-id=some-id");

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output()).contains("error: cannot specify both --file and --sheet-id");
    }

    @Test
    void githubHeaderContainingRepositoryAbortsWithRenameMessage() throws IOException {
        Path file = csv("repo-header.csv",
                "Timestamp,Team Name,"
                        + "Member 1 Name,Member 1 Email,Member 1 Phone,Member 1 Resume,"
                        + "Member 1 LinkedIn,Member 1: GitHub Profile / Repository Link",
                "2026/08/01 9:00:00 AM GMT+8," + team("Repo Header") + ","
                        + "Leader One," + email("Leader One") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/leader/view,"
                        + "https://www.linkedin.com/in/leader,https://github.com/leader");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: GitHub question is titled 'Member 1: GitHub Profile / Repository Link'. "
                        + "A project repository must not be imported into users.github_url. "
                        + "Rename the form question to 'Member 1: GitHub Profile URL'.");
    }

    @Test
    void sheetModeAbortsWhenCredentialsAreMissing() {
        Path nonExistent = tempDir.resolve("missing.json");
        Run run = runImporter("--sheet-id=fake-sheet-id", "--credentials=" + nonExistent);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output()).contains("STOPPING: Credentials missing");
    }

    @Test
    void sheetModeAbortsWhenCredentialsAreInvalid() throws IOException {
        Path invalid = tempDir.resolve("invalid.json");
        Files.writeString(invalid, "{ \"not_a_key\": true }");
        Run run = runImporter("--sheet-id=fake-sheet-id", "--credentials=" + invalid);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output()).contains("STOPPING: Credentials invalid");
    }

    @Test
    void unknownColumnsAreSilentlyIgnoredInImporter() throws IOException, SQLException {
        Path file = csv("unknown-columns.csv",
                "Timestamp,Your Full Name,Your Email Address,Phone,Gender,Institute,Team Name,"
                        + "Member 1: Full Name (First & Family Name),Member 1: Email Address,"
                        + "Member 1: Phone / WhatsApp Number,Member 1: Resume / CV (PDF),"
                        + "Member 1: LinkedIn Profile URL,Member 1: GitHub Profile URL,"
                        + "Do you want to add another team member?,Member 1: University,Member 1: Major,"
                        + "Member 1: Year of Study,Member 1: Semester,Member 1: Dietary Restrictions,"
                        + "Do you want to add another team member?",
                "2026/08/01 9:00:00 AM GMT+8,Primary Guy,primary@" + EMAIL_DOMAIN + ",+60 11-111 1111,Male,Monash,"
                        + team("Unknown Cols") + ",Real Leader," + email("Real Leader") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/real/view,https://www.linkedin.com/in/real,"
                        + "https://github.com/real,No,Monash,CS,Y2,S1,None,No");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output()).contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0");
        assertThat(countUsers()).isEqualTo(1);

        // Ensure leader's phone was stored, not primary contact's phone
        assertThat(queryString("select phone from users where email = ?", email("Real Leader")))
                .isEqualTo("+60 12-000 0000");
    }

    @Test
    void exitCodeIsTwoWhenTheDatabaseIsUnreachable() throws IOException {
        Path file = csv("unreachable.csv",
                header(1),
                "2026/08/01 9:00:00 AM GMT+8," + team("Anyone") + "," + member("Alpha One"));

        // Port 1 is reserved and nothing listens on it, so this refuses immediately.
        PrintStream originalOut = System.out;
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        int code;
        try {
            System.setOut(new PrintStream(captured, true, StandardCharsets.UTF_8));
            code = FormRegistrationImporter.run(new String[] {
                "--file=" + file,
                "--url=jdbc:postgresql://localhost:1/hackathon_db",
                "--user=" + DB_USER,
                "--password=" + DB_PASSWORD,
            });
        } finally {
            System.setOut(originalOut);
        }

        assertThat(code).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(captured.toString(StandardCharsets.UTF_8))
                .contains("Could not connect to")
                .doesNotContain("RESULT ");
    }

    @Test
    void helpExitsZero() {
        Run run = runImporter("--help");

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output())
                .contains("Exit codes:")
                .contains("0   the import ran to the end and nothing was rejected")
                .contains("1   the import ran to the end, but rejected= is non-zero")
                .contains("2   nothing was imported.");
    }

    @Test
    void unrecognisedArgumentAborts() {
        Run run = runImporter("--file=whatever.csv", "--wat");

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output()).contains("unrecognised argument '--wat'");
    }

    // ------------------------------------------------------------------ idempotency still holds

    @Test
    void reRunningTheSameFileSkipsAndStillExitsZero() throws IOException, SQLException {
        Path file = csv("rerun.csv",
                header(4),
                "2026/08/01 9:00:00 AM GMT+8," + team("Rerun") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER);

        Run first = runImporter("--file=" + file);
        assertThat(first.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(countUsers()).isEqualTo(2);

        Run second = runImporter("--file=" + file);

        assertThat(second.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(second.output())
                .contains("SKIPPED")
                .contains("RESULT mode=live rows=1 imported=0 skipped=1 rejected=0");
        assertThat(countUsers()).isEqualTo(2);
        assertThat(countTeams()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ helpers

    private Run runImporter(String... extraArgs) {
        List<String> args = new ArrayList<>(List.of(
                "--url=" + DB_URL, "--user=" + DB_USER, "--password=" + DB_PASSWORD));
        args.addAll(List.of(extraArgs));

        PrintStream originalOut = System.out;
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        int code;
        try {
            System.setOut(new PrintStream(captured, true, StandardCharsets.UTF_8));
            code = FormRegistrationImporter.run(args.toArray(new String[0]));
        } finally {
            System.setOut(originalOut);
        }
        return new Run(code, captured.toString(StandardCharsets.UTF_8));
    }

    private Path csv(String name, String... lines) throws IOException {
        Path file = tempDir.resolve(name);
        Files.writeString(file, String.join("\n", lines) + "\n", StandardCharsets.UTF_8);
        return file;
    }

    /** "Timestamp,Team Name" plus a full six-column block for each of the first n members. */
    private static String header(int members) {
        StringBuilder header = new StringBuilder("Timestamp,Team Name");
        for (int block = 1; block <= members; block++) {
            for (String field : FIELDS) {
                header.append(",Member ").append(block).append(' ').append(field);
            }
        }
        return header.toString();
    }

    /** The six cell values for one member, all valid. */
    private static String member(String name) {
        String slug = slug(name);
        return String.join(",",
                name,
                email(name),
                "+60 12-000 0000",
                "https://drive.google.com/file/d/" + slug + "/view",
                "https://www.linkedin.com/in/" + slug,
                "https://github.com/" + slug);
    }

    private static String email(String name) {
        return slug(name) + "@" + EMAIL_DOMAIN;
    }

    private static String team(String name) {
        return TEAM_PREFIX + name;
    }

    private static String slug(String name) {
        return name.toLowerCase(Locale.ROOT).replace(' ', '-');
    }

    private int countUsers() throws SQLException {
        return queryOne("select count(*) from users where email like ?", "%@" + EMAIL_DOMAIN);
    }

    private int countTeams() throws SQLException {
        return queryOne("select count(*) from teams where name like ?", TEAM_PREFIX + "%");
    }

    private int queryOne(String sql, String... parameters) throws SQLException {
        try (Connection connection = testConnection();
                var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < parameters.length; i++) {
                statement.setString(i + 1, parameters[i]);
            }
            try (ResultSet results = statement.executeQuery()) {
                results.next();
                return results.getInt(1);
            }
        }
    }

    private String queryString(String sql, String... parameters) throws SQLException {
        try (Connection connection = testConnection();
                var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < parameters.length; i++) {
                statement.setString(i + 1, parameters[i]);
            }
            try (ResultSet results = statement.executeQuery()) {
                results.next();
                return results.getString(1);
            }
        }
    }

    /**
     * Removes only what this class created. team_members first, then teams, then users:
     * team_members.team_id cascades from teams but teams.created_by only nulls out, so the
     * order avoids leaving a team behind pointing at a deleted creator.
     */
    private void deleteTestRows() throws SQLException {
        try (Connection connection = testConnection();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate(
                    "delete from team_members where user_id in "
                            + "(select id from users where email like '%@" + EMAIL_DOMAIN + "')");
            statement.executeUpdate(
                    "delete from teams where name like '" + TEAM_PREFIX + "%'");
            statement.executeUpdate(
                    "delete from users where email like '%@" + EMAIL_DOMAIN + "'");
        }
    }

    private static Connection testConnection() throws SQLException {
        return DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
    }

    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
