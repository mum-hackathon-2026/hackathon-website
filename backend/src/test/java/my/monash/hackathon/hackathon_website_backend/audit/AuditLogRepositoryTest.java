package my.monash.hackathon.hackathon_website_backend.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataAccessException;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AuditLogRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private AuditLogRepository auditLogRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void databaseGeneratesTheIdAndPopulatesCreatedAt() {
        User actor = userRepository.save(new User("google-sub-al-a", "al.a@example.com", "Admin"));
        entityManager.flush();

        AuditLog log = new AuditLog("team.disqualified", "team");
        log.setActorUser(actor);
        log.setEntityId(42L);
        assertThat(log.getId()).as("id must not be assigned by Java").isNull();
        assertThat(log.getCreatedAt()).as("created_at is the database's to set").isNull();

        AuditLog saved = auditLogRepository.save(log);
        entityManager.flush();
        entityManager.clear();

        AuditLog found = auditLogRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getId()).isNotNull();
        assertThat(found.getCreatedAt())
                .as("created_at is populated by DEFAULT now(), read back after insert")
                .isNotNull();
        assertThat(found.getAction()).isEqualTo("team.disqualified");
        assertThat(found.getEntityType()).isEqualTo("team");
        assertThat(found.getEntityId()).isEqualTo(42L);
        assertThat(found.getActorUser().getEmail()).isEqualTo("al.a@example.com");
        assertThat(found.getDetails()).as("details is optional").isNull();
    }

    /**
     * The payload survives the round trip, and Postgres has genuinely parsed it: the native
     * query below reaches into it with jsonb operators, which would fail outright on a text
     * column. That is the part worth proving — the Java side is only ever a String.
     *
     * <p>jsonb is not a byte-for-byte store: it normalises whitespace and key order, so this
     * asserts on the content rather than on the exact literal that went in.
     */
    @Test
    void writesAndReadsBackAJsonbPayload() {
        AuditLog log = new AuditLog("submission.updated", "submission");
        log.setDetails(
                """
                {"field":"project_title","from":"Old Name","to":"New Name","nested":{"deep":true}}\
                """);

        AuditLog saved = auditLogRepository.saveAndFlush(log);
        entityManager.clear();

        AuditLog found = auditLogRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getDetails())
                .contains("\"field\"")
                .contains("project_title")
                .contains("Old Name")
                .contains("New Name");

        Object field = extract(saved.getId(), "details->>'field'");
        Object to = extract(saved.getId(), "details->>'to'");
        Object deep = extract(saved.getId(), "details->'nested'->>'deep'");

        assertThat(field)
                .as("jsonb operators only work if Postgres stored parsed JSON, not a string")
                .isEqualTo("project_title");
        assertThat(to).isEqualTo("New Name");
        assertThat(deep).isEqualTo("true");
    }

    /** An empty object is a legal payload and must not be confused with null. */
    @Test
    void anEmptyJsonObjectIsDistinctFromNoPayload() {
        AuditLog withEmpty = new AuditLog("user.viewed", "user");
        withEmpty.setDetails("{}");
        AuditLog savedEmpty = auditLogRepository.saveAndFlush(withEmpty);

        AuditLog withNone = auditLogRepository.saveAndFlush(new AuditLog("user.viewed", "user"));
        entityManager.clear();

        assertThat(auditLogRepository.findById(savedEmpty.getId()).orElseThrow().getDetails())
                .isEqualTo("{}");
        assertThat(auditLogRepository.findById(withNone.getId()).orElseThrow().getDetails())
                .isNull();
    }

    /**
     * Nothing on the Java side validates the string — {@code details} is typed
     * {@link String}, so malformed JSON compiles fine and only fails when Postgres parses it
     * at flush time. This pins that behaviour down so the failure mode is not a surprise.
     */
    @Test
    void malformedJsonFailsAtTheDatabaseNotInJava() {
        AuditLog log = new AuditLog("broken.payload", "user");
        log.setDetails("{not valid json");

        assertThatThrownBy(() -> auditLogRepository.saveAndFlush(log))
                .isInstanceOf(DataAccessException.class);
    }

    private Object extract(Long id, String jsonPath) {
        return entityManager
                .getEntityManager()
                .createNativeQuery("select " + jsonPath + " from audit_log where id = :id")
                .setParameter("id", id)
                .getSingleResult();
    }
}
