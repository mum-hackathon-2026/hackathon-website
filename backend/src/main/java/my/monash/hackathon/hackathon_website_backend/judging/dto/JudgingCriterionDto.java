package my.monash.hackathon.hackathon_website_backend.judging.dto;

import java.math.BigDecimal;

public record JudgingCriterionDto(
        Long id,
        String title,
        String description,
        BigDecimal maxScore,
        BigDecimal weight,
        int displayOrder,
        boolean isActive
) {}
