package my.monash.hackathon.hackathon_website_backend.result.dto;

import java.util.List;

public record MyDetailedResultDto(
        PublicTeamResultDto result,
        List<CriterionResultDto> criteria,
        List<JudgeReviewDto> reviews
) {}
