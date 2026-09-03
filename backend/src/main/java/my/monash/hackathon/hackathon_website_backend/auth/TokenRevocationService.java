package my.monash.hackathon.hackathon_website_backend.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Server-side half of logout for otherwise-stateless JWTs.
 *
 * <p>{@link JwtAuthenticationFilter} calls {@link #isRevoked(String)} for every bearer
 * token it sees; {@code POST /api/auth/logout} in {@link AuthController} calls
 * {@link #revoke(String, Long, Instant)} for the token it was presented. Between the
 * two, a token stops working the moment its owner signs out instead of drifting on
 * until {@code exp}.
 */
@Service
public class TokenRevocationService {

    private static final Logger log = LoggerFactory.getLogger(TokenRevocationService.class);

    private final RevokedTokenRepository repository;

    public TokenRevocationService(RevokedTokenRepository repository) {
        this.repository = repository;
    }

    public void revoke(String jti, Long userId, Instant expiresAt) {
        if (jti == null || jti.isBlank()) {
            return;
        }
        repository.save(new RevokedToken(jti, userId, expiresAt.atOffset(ZoneOffset.UTC)));
    }

    public boolean isRevoked(String jti) {
        return jti != null && !jti.isBlank() && repository.existsById(jti);
    }

    /**
     * Drops rows for tokens that would have expired naturally anyway — keeping a
     * revocation on file past that point protects nothing, since the token stops
     * working on its own. Runs hourly; the exact cadence is not load-bearing.
     */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 3_600_000)
    public void sweepExpired() {
        long removed = repository.deleteByExpiresAtBefore(OffsetDateTime.now(ZoneOffset.UTC));
        if (removed > 0) {
            log.debug("Swept {} expired revoked-token record(s)", removed);
        }
    }
}
