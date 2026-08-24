package my.monash.hackathon.hackathon_website_backend.judging.dto;

import java.math.BigDecimal;

public record CriterionScoreResponse(
        Long criteriaId,
        String title,
        String description,
        BigDecimal maxScore,
        BigDecimal weight,
        BigDecimal score,
        String comment,
        BigDecimal criteriaMaxScoreSnapshot,
        BigDecimal criteriaWeightSnapshot
) {}
