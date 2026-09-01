package my.monash.hackathon.hackathon_website_backend.auth;

import my.monash.hackathon.hackathon_website_backend.user.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String VALID_SECRET = "test-secret-key-that-is-at-least-thirty-two-characters-long";

    @Test
    void failsFastAtStartupOnBlankOrShortSecret() {
        assertThatThrownBy(() -> new JwtService(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.jwt.secret");

        assertThatThrownBy(() -> new JwtService(new JwtProperties(null, 3600000)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.jwt.secret");

        assertThatThrownBy(() -> new JwtService(new JwtProperties("   ", 3600000)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.jwt.secret");

        assertThatThrownBy(() -> new JwtService(new JwtProperties("short-secret-less-than-32-b", 3600000)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.jwt.secret");
    }

    @Test
    void generatesAndValidatesToken() {
        JwtService service = new JwtService(new JwtProperties(VALID_SECRET, 3600000));
        User user = new User("sub-123", "alice@example.com", "Alice Smith");

        String token = service.generateToken(user);
        assertThat(token).isNotBlank();

        var claims = service.validateToken(token);
        assertThat(claims.get("email")).isEqualTo("alice@example.com");
        assertThat(claims.get("role")).isEqualTo("participant");
        assertThat(claims.get("name")).isEqualTo("Alice Smith");
    }
}
