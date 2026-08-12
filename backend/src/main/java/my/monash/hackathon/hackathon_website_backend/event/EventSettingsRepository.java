package my.monash.hackathon.hackathon_website_backend.event;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code event_settings} holds a single row seeded by V1, so there is no "find all" or
 * "create" worth exposing — {@link #findSingleton()} is the only sensible read, and callers
 * update the row it returns rather than inserting another.
 *
 * <p>{@code JpaRepository} still inherits {@code save} and {@code findAll}; nothing at this
 * layer can hide them. The database is what actually enforces the rule:
 * {@code event_settings_singleton_check CHECK (id = 1)} rejects any second row.
 */
public interface EventSettingsRepository extends JpaRepository<EventSettings, Long> {

    /** The one row. Empty only if the V1 seed was deleted by hand. */
    default Optional<EventSettings> findSingleton() {
        return findById(EventSettings.SINGLETON_ID);
    }
}
