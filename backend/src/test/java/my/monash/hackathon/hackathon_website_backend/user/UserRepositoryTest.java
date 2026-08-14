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
     * V3 made google_sub nullable so a Google Form registration can create the row that
     * later permits sign-in. This is the state every form-imported participant is in until
     * they authenticate for the first time.
     */
    @Test
    void storesAFormRegisteredUserWithNoGoogleSub() {
        User user = new User(null, "form.registrant@example.com", "Form Registrant");
        user.setPhone("+60 12-345 6789");
        user.setResumeUrl("https://drive.google.com/file/d/1Resume/view");
        user.setLinkedinUrl("https://www.linkedin.com/in/form-registrant");

        User saved = userRepository.saveAndFlush(user);
        entityManager.clear();

        User found = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getGoogleSub())
                .as("null google_sub means registered but never signed in")
                .isNull();
        assertThat(found.getPhone()).isEqualTo("+60 12-345 6789");
        assertThat(found.getResumeUrl()).isEqualTo("https://drive.google.com/file/d/1Resume/view");
        assertThat(found.getLinkedinUrl())
                .isEqualTo("https://www.linkedin.com/in/form-registrant");
    }

    /**
     * The UNIQUE constraint on google_sub survives V3 dropping NOT NULL. Postgres treats
     * NULLs in a unique index as distinct, so any number of pending registrations coexist —
     * which is the whole reason the constraint could be left in place.
     */
    @Test
    void allowsManyUsersWithANullGoogleSub() {
        userRepository.saveAndFlush(new User(null, "pending.one@example.com", "Pending One"));
        userRepository.saveAndFlush(new User(null, "pending.two@example.com", "Pending Two"));
        entityManager.clear();

        assertThat(userRepository.findByEmail("pending.one@example.com")).isPresent();
        assertThat(userRepository.findByEmail("pending.two@example.com")).isPresent();
    }

    /**
     * The transition V3 exists to permit: a form-registered row starts with a null
     * google_sub and gains one on first sign-in, matched on email. This is exactly what
     * AuthController does — findByEmail, then setGoogleSub when the stored value is null —
     * and it is proven here against the live schema because the PR rests on it working.
     */
    @Test
    void firstSignInFillsInTheGoogleSubByMatchingOnEmail() {
        userRepository.saveAndFlush(
                new User(null, "newcomer@example.com", "Newcomer"));
        entityManager.clear();

        // What AuthController does when a Google ID token comes back for this address.
        User found = userRepository.findByEmail("newcomer@example.com").orElseThrow();
        assertThat(found.getGoogleSub()).isNull();
        found.setGoogleSub("google-sub-newcomer");
        found.setEmailVerified(true);
        userRepository.saveAndFlush(found);
        entityManager.clear();

        User signedIn = userRepository.findByGoogleSub("google-sub-newcomer").orElseThrow();
        assertThat(signedIn.getEmail()).isEqualTo("newcomer@example.com");
        assertThat(signedIn.isEmailVerified()).isTrue();
    }

    /**
     * The three form columns are nullable on purpose: judges and admins are rows in this
     * table too and never have a resume or a LinkedIn profile. See V3 before changing it.
     */
    @Test
    void allowsAUserWithNoPhoneResumeOrLinkedIn() {
        User judge = new User("google-sub-judge", "judge@example.com", "A Judge");
        judge.setRole("judge");

        User saved = userRepository.saveAndFlush(judge);
        entityManager.clear();

        User found = userRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getPhone()).isNull();
        assertThat(found.getResumeUrl()).isNull();
        assertThat(found.getLinkedinUrl()).isNull();
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
