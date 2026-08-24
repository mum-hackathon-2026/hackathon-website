package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record AdminResultDto(
        Long teamId,
        String teamName,
        String projectTitle,
        String trackLabel,
        BigDecimal finalScore,
        Integer rank,
        String outcome,
        int judgeCount,
        boolean tied,
        boolean shortlisted,
        String teamStatus,
        String submissionStatus,
        OffsetDateTime publishedAt,
        List<String> issues
) {}
