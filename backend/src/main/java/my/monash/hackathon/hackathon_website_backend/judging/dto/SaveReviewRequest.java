package my.monash.hackathon.hackathon_website_backend.judging.dto;

import java.util.List;

public record SaveReviewRequest(
        List<ScoreRequest> scores,
        String overallFeedback
) {}
