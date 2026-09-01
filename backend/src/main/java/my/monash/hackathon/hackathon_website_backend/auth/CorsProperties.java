package my.monash.hackathon.hackathon_website_backend.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

/**
 * Binds {@code app.cors.*} from the active configuration.
 *
 * <p>{@code allowed-origins} defines the explicit list of allowed origins.
 * If empty or null, defaults to {@code http://localhost:4200} for local development.
 */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(List<String> allowedOrigins) {
    public List<String> effectiveOrigins() {
        if (allowedOrigins == null || allowedOrigins.isEmpty()) {
            return List.of("http://localhost:4200");
        }
        return allowedOrigins.stream()
                .filter(o -> o != null && !o.isBlank())
                .toList();
    }
}
