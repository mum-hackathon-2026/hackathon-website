package my.monash.hackathon.hackathon_website_backend.judging.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record JudgeAssignmentResponse(
        Long id,
        Long teamId,
        String teamName,
        String projectTitle,
        String trackLabel,
        String summary,
        String githubUrl,
        String deployedUrl,
        String slideDeckUrl,
        String videoDemoUrl,
        int memberCount,
        String status,
        OffsetDateTime assignedAt,
        OffsetDateTime completedAt,
        String overallFeedback,
        List<CriterionScoreResponse> scores
) {}
