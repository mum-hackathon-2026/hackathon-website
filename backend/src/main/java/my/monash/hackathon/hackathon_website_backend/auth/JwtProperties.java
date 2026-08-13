package my.monash.hackathon.hackathon_website_backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Binds {@code app.jwt.*} from the active profile.
 *
 * <p>{@code secret} is the HMAC-SHA256 signing key and must be at least 32 characters.
 * {@code expiration-ms} controls how long an issued token is valid.
 */
@Validated
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        @NotBlank String secret,
        @Positive long expirationMs
) {}
