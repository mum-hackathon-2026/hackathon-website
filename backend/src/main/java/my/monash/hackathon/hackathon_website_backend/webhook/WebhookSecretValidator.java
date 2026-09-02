package my.monash.hackathon.hackathon_website_backend.webhook;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Validates incoming webhook requests against the configured shared secret.
 *
 * <p>Enforces fail-closed security:
 * <ul>
 *   <li>Fails fast at application startup if {@code app.webhook.secret} is blank or null.</li>
 *   <li>Rejects every request if the secret is somehow blank or missing at runtime.</li>
 *   <li>Uses {@link MessageDigest#isEqual(byte[], byte[])} for constant-time comparison to prevent timing attacks.</li>
 * </ul>
 */
@Component
public class WebhookSecretValidator {

    private static final Logger log = LoggerFactory.getLogger(WebhookSecretValidator.class);

    private final WebhookProperties properties;

    public WebhookSecretValidator(WebhookProperties properties) {
        this.properties = properties;
        if (properties == null || properties.secret() == null || properties.secret().isBlank()) {
            throw new IllegalStateException("app.webhook.secret must not be blank");
        }
    }

    /**
     * Checks if any of the supplied candidate secrets (header, Bearer token, or query param)
     * matches the configured webhook secret in constant time.
     *
     * @param headerSecret the value from the {@code X-Webhook-Secret} header, or null
     * @param authHeader   the value from the {@code Authorization} header, or null
     * @param paramSecret  the value from the {@code secret} query parameter, or null
     * @return true if a candidate matches the configured secret; false otherwise
     */
    public boolean isValid(String headerSecret, String authHeader, String paramSecret) {
        String configuredSecret = properties != null ? properties.secret() : null;
        if (configuredSecret == null || configuredSecret.isBlank()) {
            log.warn("Webhook validation failed: app.webhook.secret is not configured or blank (fail-closed)");
            return false;
        }

        byte[] configuredBytes = configuredSecret.getBytes(StandardCharsets.UTF_8);

        // 1. Check X-Webhook-Secret header
        if (headerSecret != null && !headerSecret.isBlank()) {
            byte[] providedBytes = headerSecret.getBytes(StandardCharsets.UTF_8);
            if (MessageDigest.isEqual(configuredBytes, providedBytes)) {
                return true;
            }
        }

        // 2. Check Authorization: Bearer <secret>
        if (authHeader != null && authHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            String token = authHeader.substring(7).trim();
            if (!token.isBlank()) {
                byte[] providedBytes = token.getBytes(StandardCharsets.UTF_8);
                if (MessageDigest.isEqual(configuredBytes, providedBytes)) {
                    return true;
                }
            }
        }

        // 3. Check query parameter secret
        if (paramSecret != null && !paramSecret.isBlank()) {
            byte[] providedBytes = paramSecret.getBytes(StandardCharsets.UTF_8);
            if (MessageDigest.isEqual(configuredBytes, providedBytes)) {
                return true;
            }
        }

        log.warn("Rejected webhook request due to invalid or missing secret");
        return false;
    }
}
