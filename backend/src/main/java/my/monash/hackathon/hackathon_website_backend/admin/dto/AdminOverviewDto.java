package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.util.List;

public record AdminOverviewDto(
        AdminStatsDto stats,
        List<AuditLogDto> recentAudit
) {}
