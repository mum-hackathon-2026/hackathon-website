package my.monash.hackathon.hackathon_website_backend.notification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.user.User;

/**
 * A record of one outbound email, mapped to the {@code notifications_log} table created by
 * V1. The entity is singular where the table is plural, matching how a row reads.
 *
 * <p>Both associations are nullable and ON DELETE SET NULL: the log outlives whatever it
 * refers to. Deleting a user or a team leaves the delivery record standing with a null
 * link, so the history of what was sent is not rewritten by a later deletion.
 * {@link #recipientEmail} is stored on the row for the same reason — it is who the mail
 * actually went to, and it survives the user record disappearing.
 *
 * <p>V1 enforces {@code recipient_email = lower(recipient_email)}, so callers must store it
 * lowercased, and {@code status <> 'sent' OR sent_at IS NOT NULL}.
 */
@Entity
@Table(name = "notifications_log")
public class NotificationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Nulled out rather than deleted if the team goes. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id")
    private Team team;

    /** Nulled out rather than deleted if the user goes. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private String type;

    /** Must be lowercase — V1 enforces it with a CHECK. */
    @Column(name = "recipient_email", nullable = false)
    private String recipientEmail;

    // The two initialisers below duplicate the DEFAULTs in V1 (status 'pending',
    // attempt_count 0). The columns are NOT NULL and Hibernate always names them in the
    // INSERT, so the database DEFAULT never applies and a null field would fail the insert
    // rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes either DEFAULT must change it here too.
    // Nothing enforces the correspondence — both sides stay individually valid, so no test
    // will catch a mismatch.

    @Column(nullable = false)
    private String status = "pending";

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount = 0;

    /** Set when delivery succeeds; required by CHECK once {@link #status} is {@code sent}. */
    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    /** Required by JPA. */
    protected NotificationLog() {}

    public NotificationLog(String type, String recipientEmail) {
        this.type = type;
        this.recipientEmail = recipientEmail;
    }

    public Long getId() {
        return id;
    }

    public Team getTeam() {
        return team;
    }

    public void setTeam(Team team) {
        this.team = team;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getRecipientEmail() {
        return recipientEmail;
    }

    public void setRecipientEmail(String recipientEmail) {
        this.recipientEmail = recipientEmail;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(int attemptCount) {
        this.attemptCount = attemptCount;
    }

    public OffsetDateTime getSentAt() {
        return sentAt;
    }

    public void setSentAt(OffsetDateTime sentAt) {
        this.sentAt = sentAt;
    }
}
