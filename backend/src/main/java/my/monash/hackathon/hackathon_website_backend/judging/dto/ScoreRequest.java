package my.monash.hackathon.hackathon_website_backend.judging.dto;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record ScoreRequest(
        @NotNull(message = "Criteria ID is required")
        Long criteriaId,
        BigDecimal score,
        String comment
) {}
