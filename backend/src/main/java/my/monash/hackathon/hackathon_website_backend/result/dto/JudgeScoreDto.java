package my.monash.hackathon.hackathon_website_backend.result.dto;

import java.math.BigDecimal;

public record JudgeScoreDto(
        String title,
        BigDecimal score
) {}
