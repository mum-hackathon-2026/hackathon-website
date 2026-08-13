package my.monash.hackathon.hackathon_website_backend.auth;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Binds {@code app.google.*} from the active profile.
 *
 * <p>{@code client-id} is the Google Cloud OAuth2 client ID used to verify
 * ID tokens sent by the Angular frontend.
 */
@Validated
@ConfigurationProperties(prefix = "app.google")
public record GoogleAuthProperties(
        @NotBlank String clientId
) {}
