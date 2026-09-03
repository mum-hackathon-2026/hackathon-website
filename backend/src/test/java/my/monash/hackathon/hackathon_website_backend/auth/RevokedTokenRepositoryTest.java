package my.monash.hackathon.hackathon_website_backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class RevokedTokenRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private RevokedTokenRepository revokedTokenRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void jtiIsTheKeyAndTheRowRoundTrips() {
        User user = userRepository.save(new User("google-sub-rt-a", "rt.a@example.com", "Revoked Owner"));
        entityManager.flush();

        // Truncated to millis: timestamptz stores microseconds and the driver rounds
        // rather than truncates on the way in, so a value with a sub-millisecond
        // remainder can round-trip one microsecond off. Millisecond-aligned has none.
        OffsetDateTime expiresAt = OffsetDateTime.now().plusHours(1).truncatedTo(ChronoUnit.MILLIS);
        RevokedToken saved = revokedTokenRepository.save(new RevokedToken("jti-a", user.getId(), expiresAt));
        entityManager.flush();
        entityManager.clear();

        RevokedToken found = revokedTokenRepository.findById("jti-a").orElseThrow();
        assertThat(found.getJti()).isEqualTo("jti-a");
        assertThat(found.getUserId()).isEqualTo(user.getId());
        // Postgres round-trips timestamptz in UTC, so compare the instant rather than
        // the OffsetDateTime's offset — the two represent the same moment either way.
        assertThat(found.getExpiresAt().toInstant()).isEqualTo(expiresAt.toInstant());
        assertThat(saved.getJti()).isEqualTo("jti-a");
    }

    /**
     * A revocation for a token that has already expired protects nothing — the token
     * stopped working on its own. TokenRevocationService.sweepExpired() relies on this
     * derived delete to reclaim those rows.
     */
    @Test
    void deleteByExpiresAtBeforeSweepsOnlyExpiredRows() {
        OffsetDateTime now = OffsetDateTime.now();
        revokedTokenRepository.saveAndFlush(new RevokedToken("jti-expired", null, now.minusMinutes(1)));
        revokedTokenRepository.saveAndFlush(new RevokedToken("jti-live", null, now.plusHours(1)));

        long removed = revokedTokenRepository.deleteByExpiresAtBefore(now);
        entityManager.flush();

        assertThat(removed).isEqualTo(1);
        assertThat(revokedTokenRepository.existsById("jti-expired")).isFalse();
        assertThat(revokedTokenRepository.existsById("jti-live")).isTrue();
    }
}
