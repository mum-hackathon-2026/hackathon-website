package my.monash.hackathon.hackathon_website_backend.webhook;

import my.monash.hackathon.hackathon_website_backend.tools.FormRegistrationImporter;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RegistrationWebhookControllerTest {

    @Test
    void rejectsRequestsWithInvalidOrMissingSecret() throws Exception {
        RegistrationImportService service = mock(RegistrationImportService.class);
        WebhookSecretValidator validator = new WebhookSecretValidator(new WebhookProperties("expected_secret_123"));
        RegistrationWebhookController controller = new RegistrationWebhookController(service, validator);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/webhooks/forms/registration")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value("unauthorized"));

        mockMvc.perform(post("/api/webhooks/forms/registration")
                        .header("X-Webhook-Secret", "wrong_secret")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void acceptsValidHeaderSecretAndRunsImportWithoutLeakingLogMessages() throws Exception {
        RegistrationImportService service = mock(RegistrationImportService.class);
        WebhookSecretValidator validator = new WebhookSecretValidator(new WebhookProperties("expected_secret_123"));

        FormRegistrationImporter.ImportSummary summary = new FormRegistrationImporter.ImportSummary(
                true, 2, 1, 1, 0, 0, List.of("line 2 IMPORTED: participant@example.com JOINCODE1", "line 3 SKIPPED")
        );
        when(service.syncFromSheets(anyBoolean())).thenReturn(summary);

        RegistrationWebhookController controller = new RegistrationWebhookController(service, validator);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/webhooks/forms/registration")
                        .header("X-Webhook-Secret", "expected_secret_123")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.totalRows").value(2))
                .andExpect(jsonPath("$.imported").value(1))
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.rejected").value(0))
                .andExpect(jsonPath("$.pending").value(0))
                .andExpect(jsonPath("$.logMessages").doesNotExist());
    }

    @Test
    void acceptsBearerAuthSecret() throws Exception {
        RegistrationImportService service = mock(RegistrationImportService.class);
        WebhookSecretValidator validator = new WebhookSecretValidator(new WebhookProperties("expected_secret_123"));

        FormRegistrationImporter.ImportSummary summary = new FormRegistrationImporter.ImportSummary(
                true, 1, 1, 0, 0, 0, List.of("line 2 IMPORTED")
        );
        when(service.syncFromSheets(anyBoolean())).thenReturn(summary);

        RegistrationWebhookController controller = new RegistrationWebhookController(service, validator);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/webhooks/forms/registration")
                        .header("Authorization", "Bearer expected_secret_123")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.imported").value(1))
                .andExpect(jsonPath("$.logMessages").doesNotExist());
    }
}
