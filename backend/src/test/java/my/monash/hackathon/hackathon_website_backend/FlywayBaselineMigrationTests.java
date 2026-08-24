package my.monash.hackathon.hackathon_website_backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Verifies that the migrations apply cleanly, in order, to a genuinely empty database.
 *
 * <p>Runs against a real PostgreSQL 16 instance — hackathon_db_test locally, or the CI
 * service container when DB_TEST_URL is set. There is no in-memory fallback on purpose:
 * V1 uses Postgres-specific DDL that a substitute engine could not execute.
 *
 * <p>This proves the migrations work from empty. It does not prove a new migration applies
 * on top of an existing database at the previous version, which is how every teammate will
 * actually encounter it — that path is exercised by starting the app against the long-lived
 * local database.
 */
@SpringBootTest
class FlywayBaselineMigrationTests {

    /** The only database this test is permitted to clean. */
    private static final String EXPECTED_TEST_DATABASE = "hackathon_db_test";

    private static final List<String> EXPECTED_TABLES = List.of(
            "assignments",
            "audit_log",
            "event_settings",
            "judging_criteria",
            "notifications_log",
            "scores",
            "submissions",
            "team_members",
            "team_results",
            "teams",
            "users");

    @Autowired private Flyway flyway;

    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void baselineMigrationAppliesToAnEmptyDatabase() {
        // flyway.clean() below drops every object in the schema. DB_TEST_URL is an
        // overridable environment variable, so nothing structurally stops this test
        // from being aimed at a database that matters. Refuse to run unless the
        // target is unmistakably the disposable test database.
        requireDisposableTestDatabase();

        // Start from nothing, so the migration is exercised end to end rather than
        // being reported as already-applied from a previous run.
        flyway.clean();
        assertThat(countTablesInPublicSchema())
                .as("database should be empty before the migration runs")
                .isZero();

        MigrateResult result = flyway.migrate();

        assertThat(result.migrationsExecuted).isEqualTo(8);
        assertThat(result.targetSchemaVersion).isEqualTo("8");

        Map<String, Object> baselineRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "1");

        assertThat(baselineRow.get("success"))
                .as("V1 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(baselineRow.get("description")).isEqualTo("baseline schema");

        Map<String, Object> hardDeleteRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "2");

        assertThat(hardDeleteRow.get("success"))
                .as("V2 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(hardDeleteRow.get("description")).isEqualTo("hard delete and status cleanup");

        Map<String, Object> formRegistrationRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "3");

        assertThat(formRegistrationRow.get("success"))
                .as("V3 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(formRegistrationRow.get("description")).isEqualTo("form registration");

        Map<String, Object> githubUrlRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "4");

        assertThat(githubUrlRow.get("success"))
                .as("V4 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(githubUrlRow.get("description")).isEqualTo("add user github url");

        Map<String, Object> submissionFieldsRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "5");

        assertThat(submissionFieldsRow.get("success"))
                .as("V5 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(submissionFieldsRow.get("description")).isEqualTo("submission additional fields");

        Map<String, Object> teamSizeRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "6");

        assertThat(teamSizeRow.get("success"))
                .as("V6 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(teamSizeRow.get("description")).isEqualTo("team size two to five");

        Map<String, Object> seedCriteriaRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "7");

        assertThat(seedCriteriaRow.get("success"))
                .as("V7 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(seedCriteriaRow.get("description")).isEqualTo("seed judging criteria");

        Map<String, Object> judgesPerTeamRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "8");

        assertThat(judgesPerTeamRow.get("success"))
                .as("V8 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(judgesPerTeamRow.get("description")).isEqualTo("judges per team setting");

        List<String> actualTables = jdbcTemplate.queryForList(
                """
                select table_name
                from information_schema.tables
                where table_schema = 'public'
                  and table_type = 'BASE TABLE'
                  and table_name <> 'flyway_schema_history'
                order by table_name
                """,
                String.class);

        assertThat(actualTables).containsExactlyElementsOf(EXPECTED_TABLES);

        // The event_settings singleton is seeded by V1, so the application never has to
        // handle the row being absent.
        Map<String, Object> settings =
                jdbcTemplate.queryForMap("select * from event_settings where id = 1");
        assertThat(settings.get("judging_open")).isEqualTo(Boolean.FALSE);
        assertThat(settings.get("results_published_at")).isNull();
        assertThat(settings.get("min_team_size")).isEqualTo(2);
        assertThat(settings.get("max_team_size")).isEqualTo(5);
        assertThat(settings.get("judges_per_team")).isEqualTo(3);
    }

    /**
     * Fails the test rather than destroying data if the configured target is anything other
     * than the disposable test database. The URL is read from a live connection's metadata
     * rather than from a property, so it reflects where Flyway will genuinely connect.
     */
    private void requireDisposableTestDatabase() {
        String url;
        try (Connection connection = flyway.getConfiguration().getDataSource().getConnection()) {
            url = connection.getMetaData().getURL();
        } catch (SQLException e) {
            throw new IllegalStateException(
                    "Could not determine the JDBC URL, so it is not safe to clean the schema", e);
        }

        // Strip any query string so ?ssl=true and friends cannot mask the database name.
        String withoutParameters = url.split("\\?", 2)[0];

        assertThat(withoutParameters)
                .as(
                        """
                        REFUSING TO RUN: this test calls flyway.clean(), which drops every table \
                        in the target schema. It may only ever run against the disposable test \
                        database, whose name must be 'hackathon_db_test'. \
                        Configured target was: %s \
                        Check DB_TEST_URL — it is overridable and appears to point elsewhere.""",
                        url)
                .endsWith("/" + EXPECTED_TEST_DATABASE);
    }

    private Integer countTablesInPublicSchema() {
        return jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where table_schema = 'public'",
                Integer.class);
    }
}
