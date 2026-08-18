package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;

public record AuditLogDto(
        long id,
        String kind,
        String action,
        String target,
        String actor,
        OffsetDateTime at
) {}
