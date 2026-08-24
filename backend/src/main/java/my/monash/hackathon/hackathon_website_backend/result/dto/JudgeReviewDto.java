package my.monash.hackathon.hackathon_website_backend.result.dto;

import java.util.List;

public record JudgeReviewDto(
        Long assignmentId,
        String label,
        String overallFeedback,
        List<JudgeScoreDto> scores
) {}
