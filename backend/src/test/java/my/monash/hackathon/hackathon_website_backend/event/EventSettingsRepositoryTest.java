package my.monash.hackathon.hackathon_website_backend.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EventSettingsRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private EventSettingsRepository eventSettingsRepository;

    /**
     * V1 seeds this row, so the application never has to handle it being absent. Every
     * seeded value is deliberately inert — an unconfigured site cannot expose itself.
     *
     * <p>The team size is the exception: V1 seeds 1 / 4 and V6 updates it to 2 / 5, so what
     * is asserted here is the migrated end state rather than V1's literal. V6 leaves V1's
     * seed alone on purpose — V1 is immutable, and correcting the row afterwards is what
     * lets a fresh database and an existing one finish in the same place.
     */
    @Test
    void readsTheRowSeededByV1() {
        EventSettings settings = eventSettingsRepository.findSingleton().orElseThrow();

        assertThat(settings.getId()).isEqualTo(EventSettings.SINGLETON_ID);
        assertThat(settings.getEventName()).isEqualTo("Monash University Malaysia Hackathon");
        assertThat(settings.isJudgingOpen()).isFalse();
        assertThat(settings.isScreeningEnabled()).isFalse();
        assertThat(settings.getResultsPublishedAt()).isNull();
        assertThat(settings.getMinTeamSize()).isEqualTo(2);
        assertThat(settings.getMaxTeamSize()).isEqualTo(5);
        assertThat(settings.getUpdatedBy()).isNull();
        assertThat(eventSettingsRepository.count())
                .as("event_settings is a singleton")
                .isEqualTo(1);
    }

    /**
     * The singleton rule is a CHECK, not a convention. An id other than 1 is what actually
     * exercises it: reusing id 1 would collide with the primary key instead, and would in
     * any case be a merge into the existing row rather than an insert of a second one.
     */
    @Test
    void aSecondRowIsRejected() {
        EventSettings second = new EventSettings(2L, "Rival Hackathon");

        assertThatThrownBy(() -> eventSettingsRepository.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("event_settings_singleton_check");
    }

    /** The seeded row is meant to be edited in place; this is the supported write path. */
    @Test
    void theSingletonIsUpdatedInPlace() {
        EventSettings settings = eventSettingsRepository.findSingleton().orElseThrow();
        settings.setJudgingOpen(true);
        settings.setMaxTeamSize(5);
        eventSettingsRepository.saveAndFlush(settings);
        entityManager.clear();

        EventSettings reloaded = eventSettingsRepository.findSingleton().orElseThrow();
        assertThat(reloaded.isJudgingOpen()).isTrue();
        assertThat(reloaded.getMaxTeamSize()).isEqualTo(5);
        assertThat(eventSettingsRepository.count()).isEqualTo(1);
    }
}
