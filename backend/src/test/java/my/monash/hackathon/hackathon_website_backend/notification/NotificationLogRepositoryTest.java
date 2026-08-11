package my.monash.hackathon.hackathon_website_backend.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamRepository;
import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class NotificationLogRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private NotificationLogRepository notificationLogRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void databaseGeneratesTheIdAndBothLinksResolve() {
        User user = userRepository.save(new User("google-sub-nl-a", "nl.a@example.com", "Recipient"));
        Team team = teamRepository.save(new Team("Team Notified", "JOINN001", user));
        entityManager.flush();

        NotificationLog log = new NotificationLog("team_joined", "nl.a@example.com");
        log.setUser(user);
        log.setTeam(team);
        NotificationLog saved = notificationLogRepository.save(log);
        entityManager.flush();
        entityManager.clear();

        NotificationLog found = notificationLogRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getId()).isNotNull();
        assertThat(found.getType()).isEqualTo("team_joined");
        assertThat(found.getRecipientEmail()).isEqualTo("nl.a@example.com");
        assertThat(found.getStatus()).as("V1 DEFAULT 'pending'").isEqualTo("pending");
        assertThat(found.getAttemptCount()).as("V1 DEFAULT 0").isZero();
        assertThat(found.getSentAt()).isNull();
        assertThat(found.getUser().getEmail()).isEqualTo("nl.a@example.com");
        assertThat(found.getTeam().getName()).isEqualTo("Team Notified");
    }

    /**
     * Both links are nullable, because the log outlives what it refers to — the delivery
     * record stands on its own once a user or team is deleted.
     */
    @Test
    void bothLinksMayBeAbsent() {
        NotificationLog log = new NotificationLog("deadline_reminder", "orphan@example.com");
        log.setStatus("sent");
        log.setSentAt(OffsetDateTime.now());

        NotificationLog saved = notificationLogRepository.saveAndFlush(log);
        entityManager.clear();

        NotificationLog found = notificationLogRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getTeam()).isNull();
        assertThat(found.getUser()).isNull();
        assertThat(found.getRecipientEmail()).isEqualTo("orphan@example.com");
        assertThat(found.getSentAt()).isNotNull();
    }

    /** V1 enforces {@code status <> 'sent' OR sent_at IS NOT NULL}. */
    @Test
    void markingSentWithoutATimestampIsRejected() {
        NotificationLog log = new NotificationLog("results_published", "nl.b@example.com");
        log.setStatus("sent");

        assertThatThrownBy(() -> notificationLogRepository.saveAndFlush(log))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("notifications_log_sent_at_check");
    }

    /** Recipient emails are stored lowercase, enforced by a CHECK just like users.email. */
    @Test
    void rejectsAnUppercaseRecipientEmail() {
        NotificationLog log = new NotificationLog("team_invite", "SHOUTING@example.com");

        assertThatThrownBy(() -> notificationLogRepository.saveAndFlush(log))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("notifications_log_recipient_email_check");
    }
}
