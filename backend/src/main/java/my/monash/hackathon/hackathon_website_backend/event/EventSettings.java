package my.monash.hackathon.hackathon_website_backend.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.user.User;

/**
 * Event-wide configuration, mapped to the {@code event_settings} table created by V1.
 *
 * <p><strong>This table holds exactly one row, and always will.</strong> {@code id} is a
 * plain BIGINT primary key constrained by {@code event_settings_singleton_check
 * CHECK (id = 1)} — it is <em>not</em> an identity column, so there is deliberately no
 * {@code @GeneratedValue} here. An id is never allocated; it is always 1. Any attempt to
 * insert a second row fails on the CHECK, whatever id it carries: 1 collides with the
 * primary key, anything else violates the CHECK.
 *
 * <p>V1 seeds the row, so the application never has to cope with it being absent — read it
 * with {@link EventSettingsRepository#findSingleton()} and update it in place. Every seeded
 * value is deliberately inert (registration neither open nor closed, judging shut, nothing
 * published) so an unconfigured site cannot accidentally expose itself.
 */
@Entity
@Table(name = "event_settings")
public class EventSettings {

    /** The only primary key this table can ever hold, per {@code event_settings_singleton_check}. */
    public static final long SINGLETON_ID = 1L;

    /**
     * Assigned, never generated. The column has no DEFAULT and no identity sequence — the
     * value is fixed at {@link #SINGLETON_ID} by the CHECK constraint.
     */
    @Id private Long id;

    @Column(name = "event_name", nullable = false)
    private String eventName;

    @Column(name = "registration_opens_at")
    private OffsetDateTime registrationOpensAt;

    @Column(name = "registration_closes_at")
    private OffsetDateTime registrationClosesAt;

    @Column(name = "submission_deadline_at")
    private OffsetDateTime submissionDeadlineAt;

    // The four initialisers below duplicate the DEFAULTs in V1 and V8 (judging_open false,
    // min_team_size 2, max_team_size 5, screening_enabled false). The columns are NOT NULL
    // and Hibernate always names them in the INSERT, so the database DEFAULT never applies
    // and a null field would fail the insert rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes any of these DEFAULTs must change it
    // here too. Nothing enforces the correspondence — both sides stay individually valid,
    // so no test will catch a mismatch.

    @Column(name = "judging_open", nullable = false)
    private boolean judgingOpen = false;

    @Column(name = "results_published_at")
    private OffsetDateTime resultsPublishedAt;

    @Column(name = "min_team_size", nullable = false)
    private int minTeamSize = 2;

    @Column(name = "max_team_size", nullable = false)
    private int maxTeamSize = 5;

    @Column(name = "screening_enabled", nullable = false)
    private boolean screeningEnabled = false;

    @Column(name = "judges_per_team", nullable = false)
    private int judgesPerTeam = 3;

    /** The admin who last changed these settings. Nulled out if that user is deleted. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    /** Required by JPA. */
    protected EventSettings() {}

    /**
     * Builds the singleton row. The id is fixed rather than accepted as an argument: there
     * is only one legal value, and taking it as a parameter would suggest otherwise.
     *
     * <p>Application code should not need this — V1 seeds the row. It exists so tests can
     * construct the entity, including to prove a second row cannot be inserted.
     */
    public EventSettings(String eventName) {
        this(SINGLETON_ID, eventName);
    }

    /**
     * Package-private, and only so tests can build a row with an illegal id to prove the
     * database rejects it. Application code cannot reach this, which is the point: an
     * {@code EventSettings} with any id but {@link #SINGLETON_ID} should be unconstructible
     * outside the test that asserts it cannot be saved.
     */
    EventSettings(long id, String eventName) {
        this.id = id;
        this.eventName = eventName;
    }

    public Long getId() {
        return id;
    }

    public String getEventName() {
        return eventName;
    }

    public void setEventName(String eventName) {
        this.eventName = eventName;
    }

    public OffsetDateTime getRegistrationOpensAt() {
        return registrationOpensAt;
    }

    public void setRegistrationOpensAt(OffsetDateTime registrationOpensAt) {
        this.registrationOpensAt = registrationOpensAt;
    }

    public OffsetDateTime getRegistrationClosesAt() {
        return registrationClosesAt;
    }

    public void setRegistrationClosesAt(OffsetDateTime registrationClosesAt) {
        this.registrationClosesAt = registrationClosesAt;
    }

    public OffsetDateTime getSubmissionDeadlineAt() {
        return submissionDeadlineAt;
    }

    public void setSubmissionDeadlineAt(OffsetDateTime submissionDeadlineAt) {
        this.submissionDeadlineAt = submissionDeadlineAt;
    }

    public boolean isJudgingOpen() {
        return judgingOpen;
    }

    public void setJudgingOpen(boolean judgingOpen) {
        this.judgingOpen = judgingOpen;
    }

    public OffsetDateTime getResultsPublishedAt() {
        return resultsPublishedAt;
    }

    public void setResultsPublishedAt(OffsetDateTime resultsPublishedAt) {
        this.resultsPublishedAt = resultsPublishedAt;
    }

    public int getMinTeamSize() {
        return minTeamSize;
    }

    public void setMinTeamSize(int minTeamSize) {
        this.minTeamSize = minTeamSize;
    }

    public int getMaxTeamSize() {
        return maxTeamSize;
    }

    public void setMaxTeamSize(int maxTeamSize) {
        this.maxTeamSize = maxTeamSize;
    }

    public boolean isScreeningEnabled() {
        return screeningEnabled;
    }

    public void setScreeningEnabled(boolean screeningEnabled) {
        this.screeningEnabled = screeningEnabled;
    }

    public int getJudgesPerTeam() {
        return judgesPerTeam;
    }

    public void setJudgesPerTeam(int judgesPerTeam) {
        this.judgesPerTeam = judgesPerTeam;
    }

    public User getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(User updatedBy) {
        this.updatedBy = updatedBy;
    }
}
