package my.monash.hackathon.hackathon_website_backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Verifies the User mapping against the real hackathon_db_test schema.
 *
 * <p>Replace.NONE keeps the configured Postgres datasource instead of swapping in an
 * embedded database: V1 is Postgres-specific, and a mapping proven against a substitute
 * engine proves nothing about the schema the application actually runs on.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private UserRepository userRepository;

    @Test
    void databaseGeneratesTheIdAndPopulatesCreatedAt() {
        User user = new User("google-sub-ada", "ada@example.com", "Ada Lovelace");
        assertThat(user.getId()).as("id must not be assigned by Java").isNull();
        assertThat(user.getCreatedAt()).as("created_at is the database's to set").isNull();

        User saved = userRepository.save(user);
        entityManager.flush();
        entityManager.clear();

        User found = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getId()).isNotNull();
        assertThat(found.getCreatedAt())
                .as("created_at is populated by the database DEFAULT now(), read back after insert")
                .isNotNull();
        assertThat(found.getEmail()).isEqualTo("ada@example.com");
        assertThat(found.getRole()).isEqualTo("participant");
        assertThat(found.isEmailVerified()).isFalse();
    }

    @Test
    void findsByEmailAndGoogleSub() {
        userRepository.saveAndFlush(new User("google-sub-grace", "grace@example.com", "Grace"));
        entityManager.clear();

        assertThat(userRepository.findByEmail("grace@example.com")).isPresent();
        assertThat(userRepository.findByGoogleSub("google-sub-grace")).isPresent();
        assertThat(userRepository.findByEmail("nobody@example.com")).isEmpty();
    }

    /**
     * V1 stores email lowercase and enforces it with a CHECK, so the unique constraint is
     * genuinely case-insensitive. This proves the constraint still fires when the insert
     * comes from Hibernate rather than hand-written SQL.
     */
    @Test
    void rejectsAnUppercaseEmail() {
        User user = new User("google-sub-shout", "SHOUTING@example.com", "Shouty Person");

        assertThatThrownBy(() -> userRepository.saveAndFlush(user))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("users_email_lowercase_check");
    }
}
