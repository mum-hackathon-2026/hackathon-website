package my.monash.hackathon.hackathon_website_backend.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

/**
 * One bearer token invalidated by explicit logout, mapped to the {@code revoked_tokens}
 * table created by V12.
 *
 * <p>Keyed by the token's {@code jti} claim rather than the token text itself, so a
 * database dump never hands out a live bearer token. {@link #expiresAt} is copied from
 * the token's own {@code exp} claim so a sweep can drop the row once the token would
 * have stopped working anyway; see {@link TokenRevocationService}.
 */
@Entity
@Table(name = "revoked_tokens")
public class RevokedToken {

    @Id
    @Column(nullable = false)
    private String jti;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Required by JPA. */
    protected RevokedToken() {}

    public RevokedToken(String jti, Long userId, OffsetDateTime expiresAt) {
        this.jti = jti;
        this.userId = userId;
        this.expiresAt = expiresAt;
    }

    public String getJti() {
        return jti;
    }

    public Long getUserId() {
        return userId;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }
}
