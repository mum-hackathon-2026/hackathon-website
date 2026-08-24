package my.monash.hackathon.hackathon_website_backend.result.dto;

import java.math.BigDecimal;

public record PublicTeamResultDto(
        Long teamId,
        String teamName,
        String projectTitle,
        String trackLabel,
        BigDecimal finalScore,
        Integer rank,
        String outcome,
        int judgeCount,
        boolean tied
) {}
