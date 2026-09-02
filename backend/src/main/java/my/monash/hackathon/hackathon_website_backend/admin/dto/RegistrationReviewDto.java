package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record RegistrationReviewDto(
        Long id,
        String teamName,
        List<RegistrationReviewMemberDto> members,
        List<String> issues,
        String status,
        String adminNote,
        String reviewedByName,
        OffsetDateTime reviewedAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {}
