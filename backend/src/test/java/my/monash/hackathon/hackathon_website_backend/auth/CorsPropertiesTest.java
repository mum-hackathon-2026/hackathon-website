package my.monash.hackathon.hackathon_website_backend.auth;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CorsPropertiesTest {

    @Test
    void defaultsToLocalhost4200WhenNullOrEmpty() {
        CorsProperties empty = new CorsProperties(null);
        assertThat(empty.effectiveOrigins()).containsExactly("http://localhost:4200");

        CorsProperties emptyList = new CorsProperties(List.of());
        assertThat(emptyList.effectiveOrigins()).containsExactly("http://localhost:4200");
    }

    @Test
    void usesConfiguredAllowedOrigins() {
        CorsProperties props = new CorsProperties(List.of("https://monash-hackathon-2026.web.app", "http://localhost:4200"));
        assertThat(props.effectiveOrigins())
                .containsExactly("https://monash-hackathon-2026.web.app", "http://localhost:4200");
    }
}
