package my.monash.hackathon.hackathon_website_backend.webhook;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.sheets")
public record SheetsProperties(
        String sheetId,
        String tab,
        String credentialsPath
) {}
