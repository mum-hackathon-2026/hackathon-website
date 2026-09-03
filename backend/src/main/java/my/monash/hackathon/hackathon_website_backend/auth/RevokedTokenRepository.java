package my.monash.hackathon.hackathon_website_backend.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;

public interface RevokedTokenRepository extends JpaRepository<RevokedToken, String> {

    /** Sweeps rows whose token would have expired naturally anyway; see TokenRevocationService. */
    long deleteByExpiresAtBefore(OffsetDateTime instant);
}
