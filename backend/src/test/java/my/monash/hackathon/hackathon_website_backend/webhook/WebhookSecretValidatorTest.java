package my.monash.hackathon.hackathon_website_backend.webhook;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebhookSecretValidatorTest {

    @Test
    void failsFastAtStartupOnBlankOrNullSecret() {
        assertThatThrownBy(() -> new WebhookSecretValidator(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.webhook.secret");

        assertThatThrownBy(() -> new WebhookSecretValidator(new WebhookProperties(null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.webhook.secret");

        assertThatThrownBy(() -> new WebhookSecretValidator(new WebhookProperties("   ")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.webhook.secret");
    }

    @Test
    void matchesViaHeaderSecret() {
        WebhookSecretValidator validator = new WebhookSecretValidator(new WebhookProperties("secret_123"));

        assertThat(validator.isValid("secret_123", null, null)).isTrue();
        assertThat(validator.isValid("wrong_secret", null, null)).isFalse();
        assertThat(validator.isValid(null, null, null)).isFalse();
    }

    @Test
    void matchesViaBearerAuthHeader() {
        WebhookSecretValidator validator = new WebhookSecretValidator(new WebhookProperties("secret_123"));

        assertThat(validator.isValid(null, "Bearer secret_123", null)).isTrue();
        assertThat(validator.isValid(null, "bearer secret_123", null)).isTrue();
        assertThat(validator.isValid(null, "Bearer wrong_secret", null)).isFalse();
        assertThat(validator.isValid(null, "Basic secret_123", null)).isFalse();
    }

    @Test
    void matchesViaQueryParamSecret() {
        WebhookSecretValidator validator = new WebhookSecretValidator(new WebhookProperties("secret_123"));

        assertThat(validator.isValid(null, null, "secret_123")).isTrue();
        assertThat(validator.isValid(null, null, "wrong_secret")).isFalse();
    }
}
