package my.monash.hackathon.hackathon_website_backend.admin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.hibernate.annotations.Generated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.generator.EventType;
import org.hibernate.type.SqlTypes;

/**
 * A team registration the importer could not accept unattended, mapped to the
 * {@code registration_reviews} table created by V11.
 *
 * <p>Replaces the importer's old REJECTED/PENDING outcomes, both of which discarded the
 * row entirely and kept no record beyond console output. Every row here instead waits on
 * an explicit admin decision: {@link #status} moves from {@code awaiting_review} to
 * {@code approved}, {@code needs_fix} or {@code rejected} and never moves on its own once
 * it leaves {@code awaiting_review} / {@code needs_fix} — see
 * {@code FormRegistrationImporter}'s upsert, which is conditioned on exactly those two
 * starting states.
 *
 * <p>{@link #rawPayload} and {@link #issues} are {@code jsonb}, carried as plain
 * {@link String}s exactly like {@code AuditLog.details} — nothing here validates their
 * structure; Postgres does, at flush time, and the contract is the same one that class
 * documents: build the string with a serialiser, not concatenation.
 */
@Entity
@Table(name = "registration_reviews")
public class RegistrationReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "team_name", nullable = false)
    private String teamName;

    /** Team name plus every member's raw submitted field, verbatim and unvalidated. */
    @Column(name = "raw_payload", nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    private String rawPayload;

    /** Every reason this row needs a human, as the same human-readable strings the CLI report uses. */
    @Column(nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    private String issues;

    @Column(nullable = false)
    private String status = "awaiting_review";

    @Column(name = "source_line")
    private Integer sourceLine;

    @Column(name = "admin_note")
    private String adminNote;

    /** Nulled, not cleared, if the reviewing admin's account is later deleted. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    /** Required by JPA. */
    protected RegistrationReview() {}

    public RegistrationReview(String teamName, String rawPayload, String issues, Integer sourceLine) {
        this.teamName = teamName;
        this.rawPayload = rawPayload;
        this.issues = issues;
        this.sourceLine = sourceLine;
    }

    /** Hibernate's own INSERT/UPDATE hook, not the importer's raw-JDBC upsert path. */
    @PreUpdate
    void touch() {
        this.updatedAt = OffsetDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getTeamName() {
        return teamName;
    }

    public void setTeamName(String teamName) {
        this.teamName = teamName;
    }

    public String getRawPayload() {
        return rawPayload;
    }

    public void setRawPayload(String rawPayload) {
        this.rawPayload = rawPayload;
    }

    public String getIssues() {
        return issues;
    }

    public void setIssues(String issues) {
        this.issues = issues;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getSourceLine() {
        return sourceLine;
    }

    public void setSourceLine(Integer sourceLine) {
        this.sourceLine = sourceLine;
    }

    public String getAdminNote() {
        return adminNote;
    }

    public void setAdminNote(String adminNote) {
        this.adminNote = adminNote;
    }

    public User getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(User reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(OffsetDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
