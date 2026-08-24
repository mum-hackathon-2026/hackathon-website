package my.monash.hackathon.hackathon_website_backend.result.dto;

import java.math.BigDecimal;

public record CriterionResultDto(
        String title,
        BigDecimal weight,
        BigDecimal maxScore,
        BigDecimal score
) {}
