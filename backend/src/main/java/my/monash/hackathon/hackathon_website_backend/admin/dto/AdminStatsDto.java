package my.monash.hackathon.hackathon_website_backend.admin.dto;

public record AdminStatsDto(
        long teams,
        long participants,
        long submitted,
        long drafts,
        long noSubmission,
        long reviewsCompleted,
        long reviewsExpected,
        int percentJudged,
        long needingAttention,
        long activeTeams,
        long judges,
        long unassignedTeams
) {}
