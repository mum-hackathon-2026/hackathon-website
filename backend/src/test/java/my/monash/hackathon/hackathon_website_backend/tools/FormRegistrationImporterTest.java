package my.monash.hackathon.hackathon_website_backend.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
            List.of("Name", "Email", "Phone", "Major", "Resume", "LinkedIn", "GitHub");

    /** Seven empty cells: a member block that is present in the form but not filled in. */
    private static final String NO_MEMBER = ",,,,,,";

    /**
     * The major every fixture member is on unless the test is about screening. It matches
     * the "computer science" keyword, so a team built from {@link #member(String)} passes
     * the IT course check and the test can be about whatever it is actually about.
     */
    private static final String IT_MAJOR = "Computer Science";

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

    // -------------------------------------------------------------- the member block guard

    @Test
    void memberBlockMissingOneColumnAbortsAndNamesIt() throws IOException, SQLException {
        // Member 3's block declares six of its seven columns - the shape a mis-titled form
        // question produces. Before the guard existed this imported happily, storing a null
        // GitHub URL for a member whose GitHub URL the form had actually collected.
        Path file = csv("missing-column.csv",
                "Timestamp,Team Name,"
                        + "Member 1 Name,Member 1 Email,Member 1 Phone,Member 1 Major,"
                        + "Member 1 Resume,Member 1 LinkedIn,Member 1 GitHub,"
                        + "Member 3 Name,Member 3 Email,Member 3 Phone,Member 3 Major,"
                        + "Member 3 Resume,Member 3 LinkedIn",
                "2026/08/01 9:00:00 AM GMT+8," + team("Partial Block") + ","
                        + member("Leader One") + ","
                        + "Third Person," + email("Third Person") + ",+60 12-000 0000,"
                        + IT_MAJOR + ",https://drive.google.com/file/d/third/view,"
                        + "https://www.linkedin.com/in/third");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: member 3's block is incomplete - no column for GitHub.")
                .contains("A member block is all 7 columns or none at all: "
                        + "Name, Email, Phone, Major, Resume, LinkedIn, GitHub.")
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
                        + "Member 1 Name,Member 1 Email,Member 1 Phone,Member 1 Major,"
                        + "Member 1 Resume,Member 1 LinkedIn,Member 1 GitHub,"
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
                        + "Phone, Major, Resume, LinkedIn, GitHub.")
                .contains("STOPPING: member 4's block is incomplete - no column for "
                        + "Email, Major, Resume, LinkedIn, GitHub.");
    }

    @Test
    void leaderBlockMissingOneColumnStillAborts() throws IOException {
        Path file = csv("no-leader-resume.csv",
                "Timestamp,Team Name,Member 1 Name,Member 1 Email,Member 1 Phone,"
                        + "Member 1 Major,Member 1 LinkedIn,Member 1 GitHub",
                "2026/08/01 9:00:00 AM GMT+8," + team("No Resume") + ",Leader One,"
                        + email("Leader One") + ",+60 12-000 0000," + IT_MAJOR + ","
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
                // max_team_size is 5, so the report reaches block 5 as well.
                .containsPattern("member 5\\s+\\(no columns - not collected\\)")
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
    void exitCodeIsOneWhenSomethingNeedsReview() throws IOException, SQLException {
        Path file = csv("one-bad-row.csv",
                header(4),
                // Two members, not one: the minimum is 2, and a solo team would need review
                // on size before its email was ever looked at.
                "2026/08/01 9:00:00 AM GMT+8," + team("Good Team") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER,
                "2026/08/01 9:05:00 AM GMT+8," + team("Bad Team") + ","
                        + "Broken Person,not-an-email,+60 12-000 0000," + IT_MAJOR + ","
                        + "https://drive.google.com/file/d/broken/view,"
                        + "https://www.linkedin.com/in/broken,https://github.com/broken,"
                        + member("Second Person") + "," + NO_MEMBER + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("RESULT mode=live rows=2 imported=1 skipped=0 rejected=0 pending=0 review=1")
                // Singular, and the verb agrees with it.
                .contains("1 row needs a human")
                .doesNotContain("1 row need a human");

        // A row sent to review does not cost the good row its import.
        assertThat(countUsers()).isEqualTo(2);
        assertThat(countTeams()).isEqualTo(1);
    }

    @Test
    void pluralReviewMessageAgrees() throws IOException {
        Path file = csv("two-bad-rows.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Bad One") + ",Broken,not-an-email,"
                        + "+60 12-000 0000," + IT_MAJOR
                        + ",https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com/in/b,https://github.com/b,"
                        + member("Beta Two"),
                "2026/08/01 9:05:00 AM GMT+8,,Nameless Team,other@" + EMAIL_DOMAIN
                        + ",+60 12-000 0000," + IT_MAJOR
                        + ",https://drive.google.com/file/d/c/view,"
                        + "https://www.linkedin.com/in/c,https://github.com/c,"
                        + member("Gamma Three"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output()).contains("2 rows need a human");
    }

    @Test
    void dryRunWithReviewRowsAlsoExitsOne() throws IOException, SQLException {
        Path file = csv("dry-bad.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Bad One") + ",Broken,not-an-email,"
                        + "+60 12-000 0000," + IT_MAJOR
                        + ",https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com/in/b,https://github.com/b,"
                        + member("Beta Two"));

        Run run = runImporter("--file=" + file, "--dry-run");

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output()).contains("RESULT mode=dry-run rows=1 imported=0 "
                + "skipped=0 rejected=0 pending=0 review=1");
        // A dry run must not write to the review queue either.
        assertThat(queryOne("select count(*) from registration_reviews where team_name = ?",
                team("Bad One"))).isZero();
    }

    @Test
    void exitCodeIsTwoWhenTheCsvIsMalformed() throws IOException {
        Path file = csv("malformed.csv",
                header(1),
                "2026/08/01 9:00:00 AM GMT+8,\"" + team("Unterminated") + ",Alice,"
                        + email("Alice") + ",+60 12-000 0000," + IT_MAJOR + ","
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
                        + "Do you want to add another team member?,"
                        + "Member 2: Full Name (First & Family Name),Member 2: Email Address,"
                        + "Member 2: Phone / WhatsApp Number,Member 2: Major,"
                        + "Member 2: Resume / CV (PDF),"
                        + "Member 2: LinkedIn Profile URL,Member 2: GitHub Profile URL",
                "2026/08/01 9:00:00 AM GMT+8,Primary Guy,primary@" + EMAIL_DOMAIN + ",+60 11-111 1111,Male,Monash,"
                        + team("Unknown Cols") + ",Real Leader," + email("Real Leader") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/real/view,https://www.linkedin.com/in/real,"
                        + "https://github.com/real,No,Monash,Computer Science,Y2,S1,None,No,"
                        + member("Real Second"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output()).contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0");
        assertThat(countUsers()).isEqualTo(2);

        // Ensure leader's phone was stored, not primary contact's phone
        assertThat(queryString("select phone from users where email = ?", email("Real Leader")))
                .isEqualTo("+60 12-000 0000");
    }

    @Test
    void exitCodeIsTwoWhenTheDatabaseIsUnreachable() throws IOException {
        Path file = csv("unreachable.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Anyone") + "," + member("Alpha One") + "," + member("Beta Two"));

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
                .contains("0   the import ran to the end and nothing needs a human")
                .contains("1   the import ran to the end, but review= or error= is non-zero")
                .contains("2   nothing was imported.")
                // The outcomes and the limits of the URL check are documented where an
                // operator will actually meet them, not only in docs/.
                .contains("REVIEW    sent to the admin dashboard's Registration Reviews section")
                .contains("Links are checked for SHAPE and DOMAIN ONLY.");
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

    // ------------------------------------------------------------------ team size 2-5

    @Test
    void twoMemberTeamImports() throws IOException, SQLException {
        Path file = csv("pair.csv",
                header(5),
                "2026/08/01 9:00:00 AM GMT+8," + team("Pair") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output())
                .contains("team size   : 2-5 (from event_settings)")
                .contains("IMPORTED")
                .contains("2 members")
                .contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0");
        assertThat(countUsers()).isEqualTo(2);
        assertThat(countTeams()).isEqualTo(1);
    }

    @Test
    void fiveMemberTeamImports() throws IOException, SQLException {
        // The fifth block is new. Nothing about it is special-cased: the field aliases are
        // generated per block number, so this maps by the same rule as member 1.
        Path file = csv("five.csv",
                header(5),
                "2026/08/01 9:00:00 AM GMT+8," + team("Full House") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + member("Gamma Three") + "," + member("Delta Four") + ","
                        + member("Epsilon Five"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output())
                .contains("IMPORTED")
                .contains("5 members")
                .contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0");
        assertThat(countUsers()).isEqualTo(5);
        assertThat(countTeams()).isEqualTo(1);

        // Every one of member 5's six collected values landed, not just their name.
        assertThat(queryOne(
                """
                select count(*) from users
                where email = ? and phone is not null and resume_url is not null
                  and linkedin_url is not null and github_url is not null
                """,
                email("Epsilon Five")))
                .isEqualTo(1);
    }

    @Test
    void soloTeamIsSentToReviewAndNamesTheMinimum() throws IOException, SQLException {
        // Solo entries ended with V6; the message has to say so in terms the organiser
        // chasing the registrant can repeat back to them. It is no longer an automatic
        // refusal - an admin decides from the review queue, which is where this lands.
        Path file = csv("solo.csv",
                header(5),
                "2026/08/01 9:00:00 AM GMT+8," + team("Solo Mission") + ","
                        + member("Alpha One") + "," + NO_MEMBER + "," + NO_MEMBER + ","
                        + NO_MEMBER + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("NEEDS REVIEW")
                .contains("team has 1 member; the minimum is 2")
                .contains("RESULT mode=live rows=1 imported=0 skipped=0 rejected=0 pending=0 review=1");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
        assertThat(countReviews()).isEqualTo(1);
    }

    @Test
    void sixMemberTeamIsSentToReview() throws IOException, SQLException {
        // The scan looks past the maximum on purpose, so an oversized team is named as
        // oversized rather than having its sixth member quietly dropped.
        Path file = csv("six.csv",
                header(6),
                "2026/08/01 9:00:00 AM GMT+8," + team("Too Many") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + member("Gamma Three") + "," + member("Delta Four") + ","
                        + member("Epsilon Five") + "," + member("Zeta Six"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("NEEDS REVIEW")
                .contains("team size is 6; teams must have between 2 and 5 members")
                .contains("RESULT mode=live rows=1 imported=0 skipped=0 rejected=0 pending=0 review=1");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void partiallyPresentMemberFiveBlockAborts() throws IOException, SQLException {
        // The all-or-none guard now reaches block 5, because block 5 is inside the limit.
        // Six of its seven columns is a mis-titled question, not a smaller team.
        Path file = csv("partial-five.csv",
                header(4)
                        + ",Member 5 Name,Member 5 Email,Member 5 Phone,Member 5 Major,"
                        + "Member 5 Resume,Member 5 LinkedIn",
                "2026/08/01 9:00:00 AM GMT+8," + team("Partial Five") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER + ","
                        + "Fifth Person," + email("Fifth Person") + ",+60 12-000 0000,"
                        + IT_MAJOR + ",https://drive.google.com/file/d/fifth/view,"
                        + "https://www.linkedin.com/in/fifth");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: member 5's block is incomplete - no column for GitHub.")
                .contains("'Member 5 GitHub'")
                .doesNotContain("RESULT ");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void githubRepositoryHeaderStillAbortsForMemberFive() throws IOException {
        // The repo/project guard is not weakened by the new block: users.github_url is the
        // person, and a project repo must not land in it for member 5 either.
        Path file = csv("repo-header-five.csv",
                header(4)
                        + ",Member 5 Name,Member 5 Email,Member 5 Phone,Member 5 Major,"
                        + "Member 5 Resume,Member 5 LinkedIn,Member 5: GitHub Project Repository",
                "2026/08/01 9:00:00 AM GMT+8," + team("Repo Five") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER + "," + member("Epsilon Five"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("A project repository must not be imported into users.github_url")
                .contains("'Member 5: GitHub Profile URL'");
    }

    // ---------------------------------------------------- the limits come from the database

    @Test
    void limitsAreReadFromEventSettingsAndReported() throws IOException, SQLException {
        // The importer holds no copy of the limits. This is the read, and the run header is
        // where the operator sees which ones were actually enforced.
        Path file = csv("reported.csv",
                header(5),
                "2026/08/01 9:00:00 AM GMT+8," + team("Reported") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        int min = queryOne("select min_team_size from event_settings where id = 1");
        int max = queryOne("select max_team_size from event_settings where id = 1");
        assertThat(run.output())
                .contains("team size   : " + min + "-" + max + " (from event_settings)");
    }

    @Test
    void readingLimitsFailsWhenTheSingletonRowIsMissing() throws SQLException {
        // Exercised on a connection of our own inside a transaction that is rolled back, so
        // the shared test database never actually loses its event_settings row.
        try (Connection connection = testConnection()) {
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate("delete from event_settings where id = 1");
            }

            assertThatThrownBy(() -> FormRegistrationImporter.readTeamSizeLimits(connection))
                    .isInstanceOf(FormRegistrationImporter.MissingLimitsException.class)
                    .hasMessageContaining("event_settings has no row with id = 1");

            connection.rollback();
        }
    }

    @Test
    void missingEventSettingsAbortsWithExitTwo() throws IOException, SQLException {
        // End to end: no limits, no import, exit 2, and no RESULT line - a caller branching
        // on the exit code must be able to tell "nothing happened" from "some rows failed".
        Path file = csv("no-settings.csv",
                header(5),
                "2026/08/01 9:00:00 AM GMT+8," + team("Would Import") + ","
                        + member("Alpha One") + "," + member("Beta Two") + ","
                        + NO_MEMBER + "," + NO_MEMBER + "," + NO_MEMBER);

        EventSettingsRow saved = readEventSettings();
        Run run;
        try {
            deleteEventSettings();
            run = runImporter("--file=" + file);
        } finally {
            restoreEventSettings(saved);
        }

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING:")
                .contains("event_settings has no row with id = 1")
                .doesNotContain("RESULT ");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();

        // The row is back, so the rest of the suite is unaffected.
        assertThat(queryOne("select count(*) from event_settings where id = 1")).isEqualTo(1);
    }

    // ------------------------------------------------------------ screening: IT course

    @Test
    void oneItMemberIsEnoughForTheWholeTeam() throws IOException, SQLException {
        // Mixed teams are the point of the event. One member on an IT course carries the
        // team; the business student beside them is not a problem to be reported.
        Path file = csv("one-it-member.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Mixed") + ","
                        + member("Alpha One", "Bachelor of Business Administration") + ","
                        + member("Beta Two", "Bachelor of Software Engineering"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output())
                .contains("IMPORTED")
                .contains("RESULT mode=live rows=1 imported=1 skipped=0 rejected=0 pending=0 review=0")
                .doesNotContain("NEEDS REVIEW");
        assertThat(countTeams()).isEqualTo(1);
    }

    @Test
    void majorMatchesOnSubstringNotOnEquality() throws IOException, SQLException {
        // The real sheet's answers are sentences, not vocabulary terms. "Computer Science in
        // Data Science" has to match "computer science" or the check is useless in practice.
        Path file = csv("substring-major.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Substring") + ","
                        + member("Alpha One", "Computer Science in Data Science") + ","
                        + member("Beta Two", "Actuarial Science"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_OK);
        assertThat(run.output()).contains("IMPORTED").doesNotContain("NEEDS REVIEW");
        assertThat(countTeams()).isEqualTo(1);
    }

    @Test
    void teamWithNoItMemberIsSentToReviewAndIsNotInTheDatabase()
            throws IOException, SQLException {
        // The distinction this whole change exists for. Nobody on the team is obviously on
        // an IT course - which is a question for a person, not grounds for an automatic
        // refusal - so the row is sent to admin review, every major is quoted back verbatim,
        // and nothing is written to users/teams/team_members.
        Path file = csv("no-it-member.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("No IT") + ","
                        + member("Alpha One", "Business Analytics") + ","
                        + member("Beta Two", "Actuarial Science"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("NEEDS REVIEW")
                .contains("'" + team("No IT") + "' - sent to admin review")
                .contains("no clear IT-related course")
                .contains("(majors: \"Business Analytics\", \"Actuarial Science\")")
                .contains("RESULT mode=live rows=1 imported=0 skipped=0 rejected=0 pending=0 review=1");

        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();

        // It is not just skipped over - a row now sits in the admin review queue for it.
        assertThat(queryString(
                "select status from registration_reviews where team_name = ?", team("No IT")))
                .isEqualTo("awaiting_review");
        assertThat(queryString(
                "select issues::text from registration_reviews where team_name = ?", team("No IT")))
                .contains("no clear IT-related course");
    }

    @Test
    void reviewRowsReflectTheLatestSheetOnASecondRun() throws IOException, SQLException {
        // Nothing was written to users/teams the first time, but the review row itself is
        // now real state - re-running while it is still awaiting_review refreshes it rather
        // than duplicating it, which is what lets correcting the spreadsheet resurface it.
        Path file = csv("review-twice.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Reviewed Twice") + ","
                        + member("Alpha One", "Business Analytics") + ","
                        + member("Beta Two", "Actuarial Science"));

        Run first = runImporter("--file=" + file);
        Run second = runImporter("--file=" + file);

        assertThat(first.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(second.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(second.output())
                .contains("NEEDS REVIEW")
                .contains("'" + team("Reviewed Twice") + "' - sent to admin review")
                .contains("RESULT mode=live rows=1 imported=0 skipped=0 rejected=0 pending=0 review=1")
                // Not reported as already present: a reviewed team holds no users/teams rows.
                .doesNotContain("SKIPPED");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
        // Exactly one row, refreshed rather than duplicated.
        assertThat(countReviews()).isEqualTo(1);
    }

    @Test
    void anAdminRejectionIsNotReopenedByASubsequentSync() throws IOException, SQLException {
        // The whole point of the upsert's WHERE clause: once an admin has decided, a later
        // sync of the same sheet must not silently put the row back in front of them.
        Path file = csv("stays-rejected.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Admin Rejected") + ","
                        + member("Alpha One", "Business Analytics") + ","
                        + member("Beta Two", "Actuarial Science"));

        Run first = runImporter("--file=" + file);
        assertThat(first.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);

        try (Connection connection = testConnection();
                var statement = connection.prepareStatement(
                        "update registration_reviews set status = 'rejected' where team_name = ?")) {
            statement.setString(1, team("Admin Rejected"));
            statement.executeUpdate();
        }

        Run second = runImporter("--file=" + file);

        assertThat(second.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(second.output())
                .contains("already decided by an admin (status: rejected); left untouched");
        assertThat(queryString(
                "select status from registration_reviews where team_name = ?",
                team("Admin Rejected")))
                .isEqualTo("rejected");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void aMissingMajorColumnAbortsWithExitTwo() throws IOException, SQLException {
        // The worst available outcome is importing a season of registrations unscreened
        // because a form question was renamed, so this is fatal rather than reported.
        StringBuilder header = new StringBuilder("Timestamp,Team Name");
        for (int block = 1; block <= 2; block++) {
            for (String field : List.of("Name", "Email", "Phone", "Resume", "LinkedIn", "GitHub")) {
                header.append(",Member ").append(block).append(' ').append(field);
            }
        }
        Path file = csv("no-major-column.csv",
                header.toString(),
                "2026/08/01 9:00:00 AM GMT+8," + team("Unscreenable") + ","
                        + "Alpha One," + email("Alpha One") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/a/view,"
                        + "https://www.linkedin.com/in/a,https://github.com/a,"
                        + "Beta Two," + email("Beta Two") + ",+60 12-000 0000,"
                        + "https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com/in/b,https://github.com/b");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_ABORTED);
        assertThat(run.output())
                .contains("STOPPING: the sheet has no Major column for any member, so no team "
                        + "can be screened for an IT-related course.")
                .contains("Member N: Major / Field of Study")
                .doesNotContain("RESULT ");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void theKeywordListIsPrintedInFull() throws IOException {
        // A team held for "no clear IT-related course" was judged against these exact terms.
        // Whoever reads the report should not have to open the source to find out which.
        Path file = csv("keywords.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Keywords") + ","
                        + member("Alpha One") + "," + member("Beta Two"));

        Run run = runImporter("--file=" + file, "--dry-run");

        assertThat(run.output()).contains("computer science, information technology, "
                + "information system, information security, computer engineering, "
                + "computer system, computer application, computing, informatics, software, "
                + "data science, data engineering, data analytics, artificial intelligence, "
                + "machine learning, cyber security, digital forensics, network engineering, "
                + "web development, game development");
    }

    // ------------------------------------------------------- screening: links and phone

    @Test
    void aGithubUrlInTheLinkedInFieldIsSentToReview() throws IOException, SQLException {
        // This is in the real registration data. It is a paste error, not a bad-faith
        // registration, and refusing the team over it would be absurd - but importing a
        // GitHub URL as somebody's LinkedIn profile is silently wrong forever.
        Path file = csv("swapped-link.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Swapped") + ","
                        + member("Alpha One") + ","
                        + "Beta Two," + email("Beta Two") + ",+60 12-000 0000," + IT_MAJOR + ","
                        + "https://drive.google.com/file/d/b/view,"
                        + "https://github.com/beta-two,https://github.com/beta-two");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("NEEDS REVIEW")
                .contains("member 2 (Beta Two) gave a github.com link for LinkedIn")
                .contains("RESULT mode=live rows=1 imported=0 skipped=0 rejected=0 pending=0 review=1");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void aMissingResumeIsSentToReview() throws IOException, SQLException {
        // This used to import with a note attached, which meant it imported and nobody read
        // the note. A participant with no resume is a participant an organiser has to chase.
        Path file = csv("no-resume.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("No Resume Given") + ","
                        + member("Alpha One") + ","
                        + "Beta Two," + email("Beta Two") + ",+60 12-000 0000," + IT_MAJOR + ","
                        + ",https://www.linkedin.com/in/beta-two,https://github.com/beta-two");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("NEEDS REVIEW")
                .contains("member 2 (Beta Two) gave no resume link")
                .contains("RESULT mode=live rows=1 imported=0 skipped=0 rejected=0 pending=0 review=1");
        assertThat(countUsers()).isZero();
        assertThat(countTeams()).isZero();
    }

    @Test
    void aResumeOnTheWrongHostIsSentToReviewAndAGoogleDocIsNot() throws IOException, SQLException {
        // docs.google.com is as good as drive.google.com; dropbox.com is a question for a
        // person, because the form asked for a Drive link and did not get one.
        Path file = csv("resume-hosts.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Docs Link") + ","
                        + member("Alpha One") + ","
                        + "Beta Two," + email("Beta Two") + ",+60 12-000 0000," + IT_MAJOR + ","
                        + "https://docs.google.com/document/d/b/edit,"
                        + "https://www.linkedin.com/in/beta-two,https://github.com/beta-two",
                "2026/08/01 9:05:00 AM GMT+8," + team("Dropbox Link") + ","
                        + member("Gamma Three") + ","
                        + "Delta Four," + email("Delta Four") + ",+60 12-000 0000," + IT_MAJOR
                        + ",https://www.dropbox.com/s/d/resume.pdf,"
                        + "https://www.linkedin.com/in/delta-four,https://github.com/delta-four");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("member 2 (Delta Four) gave a dropbox.com link for the resume")
                .contains("RESULT mode=live rows=2 imported=1 skipped=0 rejected=0 pending=0 review=1");

        // Only the Google Docs team is in the database.
        assertThat(countTeams()).isEqualTo(1);
        assertThat(queryOne("select count(*) from teams where name = ?", team("Docs Link")))
                .isEqualTo(1);
    }

    @Test
    void anUnreadablePhoneNumberIsSentToReviewButABlankOneIsOnlyANote()
            throws IOException, SQLException {
        Path file = csv("phones.csv",
                header(2),
                // Blank: a note, and the team still imports.
                "2026/08/01 9:00:00 AM GMT+8," + team("No Phone") + ","
                        + member("Alpha One") + ","
                        + "Beta Two," + email("Beta Two") + ",," + IT_MAJOR + ","
                        + "https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com/in/beta-two,https://github.com/beta-two",
                // Present but not a number: somebody typed something else into the box.
                "2026/08/01 9:05:00 AM GMT+8," + team("Odd Phone") + ","
                        + member("Gamma Three") + ","
                        + "Delta Four," + email("Delta Four") + ",call me,"
                        + IT_MAJOR + ",https://drive.google.com/file/d/d/view,"
                        + "https://www.linkedin.com/in/delta-four,https://github.com/delta-four");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("note: member 2 (Beta Two) gave no phone number")
                .contains("member 2 (Delta Four) gave a phone number that is not 8 to 15 "
                        + "digits: 'call me'")
                .contains("RESULT mode=live rows=2 imported=1 skipped=0 rejected=0 pending=0 review=1");
        assertThat(queryOne("select count(*) from teams where name = ?", team("No Phone")))
                .isEqualTo(1);
    }

    @Test
    void aLinkedInUrlWithTheDomainInTheUserinfoIsSentToReview() throws IOException, SQLException {
        // Parsed as a URL, not searched for a substring: the host here is example.com and a
        // "does it contain linkedin.com" check would have waved it through.
        Path file = csv("userinfo-host.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Userinfo") + ","
                        + member("Alpha One") + ","
                        + "Beta Two," + email("Beta Two") + ",+60 12-000 0000," + IT_MAJOR + ","
                        + "https://drive.google.com/file/d/b/view,"
                        + "https://www.linkedin.com@example.com/in/beta,"
                        + "https://github.com/beta-two");

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("member 2 (Beta Two) gave a example.com link for LinkedIn");
        assertThat(countTeams()).isZero();
    }

    // ------------------------------------------------- both kinds of issue in one report

    @Test
    void screeningAndStructuralIssuesShareOneReviewQueue() throws IOException, SQLException {
        // One judgement call (no IT member) and one structural problem (team too small), in
        // one run. Both now land in the same admin review queue rather than on two separate
        // lists - the distinction between "pending" and "rejected" no longer changes the
        // outcome, only the wording of the reason.
        Path file = csv("one-of-each.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("Clean") + ","
                        + member("Alpha One") + "," + member("Beta Two"),
                "2026/08/01 9:05:00 AM GMT+8," + team("Held") + ","
                        + member("Gamma Three", "Business Analytics") + ","
                        + member("Delta Four", "Actuarial Science"),
                "2026/08/01 9:10:00 AM GMT+8," + team("Refused") + ","
                        + member("Epsilon Five") + "," + NO_MEMBER);

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("RESULT mode=live rows=3 imported=1 skipped=0 rejected=0 pending=0 review=2")
                .contains("SENT TO ADMIN REVIEW - 2 teams NOT imported, waiting on a decision "
                        + "in the admin dashboard:")
                .contains("'" + team("Held") + "' - sent to admin review")
                .contains("no clear IT-related course")
                .contains("'" + team("Refused") + "' - sent to admin review")
                .contains("team has 1 member; the minimum is 2")
                .contains("2 rows need a human");

        // Exactly one team reached the database, and it is the clean one.
        assertThat(countTeams()).isEqualTo(1);
        assertThat(countUsers()).isEqualTo(2);
        assertThat(queryOne("select count(*) from teams where name = ?", team("Clean")))
                .isEqualTo(1);
        // The other two are sitting in the review queue, not gone.
        assertThat(countReviews()).isEqualTo(2);
    }

    @Test
    void structuralConflictsStillGoThroughReviewNotStraightImport() throws IOException, SQLException {
        // Screening does not soften these: a person on two teams or a duplicate email within
        // one team is still flagged. The difference from before is only that an admin now
        // makes the call instead of the row being discarded outright.
        Path file = csv("still-flagged.csv",
                header(2),
                "2026/08/01 9:00:00 AM GMT+8," + team("First Claim") + ","
                        + member("Alpha One") + "," + member("Beta Two"),
                // Same person, second team.
                "2026/08/01 9:05:00 AM GMT+8," + team("Second Claim") + ","
                        + member("Beta Two") + "," + member("Gamma Three"),
                // Two people, same email inside one team.
                "2026/08/01 9:10:00 AM GMT+8," + team("Same Email") + ","
                        + member("Delta Four") + "," + member("Delta Four"));

        Run run = runImporter("--file=" + file);

        assertThat(run.exitCode()).isEqualTo(FormRegistrationImporter.EXIT_REJECTIONS);
        assertThat(run.output())
                .contains("RESULT mode=live rows=3 imported=1 skipped=0 rejected=0 pending=0 review=2")
                .contains("A person may only be on one team.")
                .contains("duplicate email within this team");
        assertThat(countTeams()).isEqualTo(1);
        // "Same Email" could not even be parsed into a TeamRow, so it is filed under its own
        // team name rather than one of the successfully-parsed ones.
        assertThat(queryString(
                "select status from registration_reviews where team_name = ?", team("Same Email")))
                .isEqualTo("awaiting_review");
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

    /** The seven cell values for one member, all valid and all passing screening. */
    private static String member(String name) {
        return member(name, IT_MAJOR);
    }

    /** The same, with the major named — for the tests that are about the course check. */
    private static String member(String name, String major) {
        String slug = slug(name);
        return String.join(",",
                name,
                email(name),
                "+60 12-000 0000",
                major,
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
            statement.executeUpdate(
                    "delete from registration_reviews where team_name like '" + TEAM_PREFIX + "%'");
        }
    }

    private int countReviews() throws SQLException {
        return queryOne("select count(*) from registration_reviews where team_name like ?",
                TEAM_PREFIX + "%");
    }

    /**
     * The event_settings singleton, so a test can take it away and put it back.
     *
     * <p>Only the NOT NULL columns are carried: the nullable instants are null in the V1
     * seed and nothing in this class depends on them.
     */
    private record EventSettingsRow(String eventName, boolean judgingOpen, int minTeamSize,
                                    int maxTeamSize, boolean screeningEnabled) {}

    private EventSettingsRow readEventSettings() throws SQLException {
        try (Connection connection = testConnection();
                Statement statement = connection.createStatement();
                ResultSet results = statement.executeQuery(
                        "select event_name, judging_open, min_team_size, max_team_size, "
                                + "screening_enabled from event_settings where id = 1")) {
            assertThat(results.next())
                    .as("event_settings singleton must exist before this test removes it")
                    .isTrue();
            return new EventSettingsRow(
                    results.getString("event_name"),
                    results.getBoolean("judging_open"),
                    results.getInt("min_team_size"),
                    results.getInt("max_team_size"),
                    results.getBoolean("screening_enabled"));
        }
    }

    private void deleteEventSettings() throws SQLException {
        try (Connection connection = testConnection();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("delete from event_settings where id = 1");
        }
    }

    private void restoreEventSettings(EventSettingsRow row) throws SQLException {
        try (Connection connection = testConnection();
                var statement = connection.prepareStatement(
                        "insert into event_settings (id, event_name, judging_open, min_team_size, "
                                + "max_team_size, screening_enabled) values (1, ?, ?, ?, ?, ?) "
                                + "on conflict (id) do nothing")) {
            statement.setString(1, row.eventName());
            statement.setBoolean(2, row.judgingOpen());
            statement.setInt(3, row.minTeamSize());
            statement.setInt(4, row.maxTeamSize());
            statement.setBoolean(5, row.screeningEnabled());
            statement.executeUpdate();
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
