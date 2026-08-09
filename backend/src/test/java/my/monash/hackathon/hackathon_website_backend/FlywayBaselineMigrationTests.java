package my.monash.hackathon.hackathon_website_backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Verifies that the baseline migration applies cleanly to a genuinely empty database.
 *
 * <p>Runs against a real PostgreSQL 16 instance — hackathon_db_test locally, or the CI
 * service container when DB_TEST_URL is set. There is no in-memory fallback on purpose:
 * V1 uses Postgres-specific DDL that a substitute engine could not execute.
 */
@SpringBootTest
class FlywayBaselineMigrationTests {

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
        // Start from nothing, so the migration is exercised end to end rather than
        // being reported as already-applied from a previous run.
        flyway.clean();
        assertThat(countTablesInPublicSchema())
                .as("database should be empty before the migration runs")
                .isZero();

        MigrateResult result = flyway.migrate();

        assertThat(result.migrationsExecuted).isEqualTo(1);
        assertThat(result.targetSchemaVersion).isEqualTo("1");

        Map<String, Object> historyRow = jdbcTemplate.queryForMap(
                "select version, description, success from flyway_schema_history where version = ?",
                "1");

        assertThat(historyRow.get("success"))
                .as("V1 must be recorded as successfully applied")
                .isEqualTo(Boolean.TRUE);
        assertThat(historyRow.get("description")).isEqualTo("baseline schema");

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
    }

    private Integer countTablesInPublicSchema() {
        return jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where table_schema = 'public'",
                Integer.class);
    }
}
