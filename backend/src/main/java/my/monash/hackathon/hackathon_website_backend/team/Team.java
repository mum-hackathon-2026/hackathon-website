package my.monash.hackathon.hackathon_website_backend.team;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * A team, mapped to the {@code teams} table created by V1.
 *
 * <p>{@code status} stays a String for the same reason as on {@code User}: the CHECK
 * vocabulary is an unratified proposal.
 */
@Entity
@Table(name = "teams")
public class Team {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "join_code", nullable = false)
    private String joinCode;

    // Both initialisers below duplicate the DEFAULTs in V1 (status 'forming',
    // shortlisted false). The columns are NOT NULL and Hibernate always names them in
    // the INSERT, so the database DEFAULT never applies and a null field would fail the
    // insert rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes either DEFAULT must change it here
    // too. Nothing enforces the correspondence — both sides stay individually valid, so
    // no test will catch a mismatch.

    @Column(nullable = false)
    private String status = "forming";

    @Column(nullable = false)
    private boolean shortlisted = false;

    /**
     * LAZY because {@code open-in-view} is false: an eager fetch here would issue a join on
     * every team load, and any attempt to traverse it outside a transaction fails loudly
     * rather than silently opening a connection during response rendering.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /** Backs the {@code version} column, giving optimistic locking on concurrent edits. */
    @Version
    @Column(nullable = false)
    private int version;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Required by JPA. */
    protected Team() {}

    public Team(String name, String joinCode, User createdBy) {
        this.name = name;
        this.joinCode = joinCode;
        this.createdBy = createdBy;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getJoinCode() {
        return joinCode;
    }

    public void setJoinCode(String joinCode) {
        this.joinCode = joinCode;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public boolean isShortlisted() {
        return shortlisted;
    }

    public void setShortlisted(boolean shortlisted) {
        this.shortlisted = shortlisted;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public int getVersion() {
        return version;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
