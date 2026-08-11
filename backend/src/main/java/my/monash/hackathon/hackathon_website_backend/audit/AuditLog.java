package my.monash.hackathon.hackathon_website_backend.audit;

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
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.hibernate.annotations.Generated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.generator.EventType;
import org.hibernate.type.SqlTypes;

/**
 * An entry in the audit trail, mapped to the {@code audit_log} table created by V1.
 *
 * <h2>{@code details} is jsonb, carried as a String</h2>
 *
 * <p>{@link #details} maps a {@code jsonb} column via {@code @JdbcTypeCode(SqlTypes.JSON)}.
 * The Java side is a plain {@link String}: <strong>nothing here checks the structure, or
 * even that the string is JSON at all.</strong> Java hands Postgres a string and Postgres
 * parses it — malformed JSON comes back as a database error at flush time, not a compile
 * error and not a validation failure in the entity.
 *
 * <p>So the contract is: build the string with a serialiser rather than by concatenation,
 * and expect failures at the persistence boundary. Nothing constrains which keys an entry
 * carries; {@code details} is deliberately schemaless, because the useful payload differs
 * per {@link #action}.
 *
 * <p>Storing it as {@code jsonb} rather than {@code text} is what buys the ability to query
 * into the payload later without a migration. That requires no extra dependency: Hibernate
 * maps a String field to the dialect's native JSON type directly, with no JSON format
 * mapper involved.
 *
 * <p>{@code actor_user_id} is ON DELETE SET NULL, so hard-deleting a user
 * <strong>anonymises</strong> their audit trail rather than erasing it — the entries stay,
 * with a null actor.
 */
@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Nulled out, not deleted, when the acting user is deleted. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actorUser;

    @Column(nullable = false)
    private String action;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    /**
     * The id of the row the action touched. Deliberately a loose {@code bigint} with no
     * foreign key — it points into whichever table {@link #entityType} names, which no
     * single FK could express, and the trail must survive that row being deleted.
     */
    @Column(name = "entity_id")
    private Long entityId;

    /** Free-form jsonb payload. Validated by Postgres on write, by nothing on the Java side. */
    @JdbcTypeCode(SqlTypes.JSON)
    private String details;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Required by JPA. */
    protected AuditLog() {}

    public AuditLog(String action, String entityType) {
        this.action = action;
        this.entityType = entityType;
    }

    public Long getId() {
        return id;
    }

    public User getActorUser() {
        return actorUser;
    }

    public void setActorUser(User actorUser) {
        this.actorUser = actorUser;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getEntityType() {
        return entityType;
    }

    public void setEntityType(String entityType) {
        this.entityType = entityType;
    }

    public Long getEntityId() {
        return entityId;
    }

    public void setEntityId(Long entityId) {
        this.entityId = entityId;
    }

    public String getDetails() {
        return details;
    }

    public void setDetails(String details) {
        this.details = details;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
