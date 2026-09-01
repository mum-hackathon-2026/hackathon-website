package my.monash.hackathon.hackathon_website_backend.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Issues and validates JWT session tokens.
 *
 * <p>Tokens are HMAC-SHA256-signed and carry the user's id, email, role, and
 * display name as claims. The signing key and expiration come from
 * {@link JwtProperties}.
 */
@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long expirationMs;

    public JwtService(JwtProperties properties) {
        if (properties == null || properties.secret() == null || properties.secret().isBlank()) {
            throw new IllegalStateException("app.jwt.secret must not be blank");
        }
        byte[] secretBytes = properties.secret().getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must be at least 32 bytes (256 bits) for HMAC-SHA256");
        }
        this.signingKey = Keys.hmacShaKeyFor(secretBytes);
        this.expirationMs = properties.expirationMs();
    }

    /**
     * Generates a JWT for the given user.
     *
     * @return a signed JWT string
     */
    public String generateToken(User user) {
        var now = new Date();
        var expiry = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("email", user.getEmail())
                .claim("role", user.getRole())
                .claim("name", user.getFullName())
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    /**
     * Parses and validates a JWT, returning its claims.
     *
     * @throws JwtException if the token is invalid, expired, or tampered with
     */
    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /** Extracts the user ID (stored as {@code sub}) from a validated token. */
    public Long getUserIdFromToken(String token) {
        return Long.parseLong(validateToken(token).getSubject());
    }
}
