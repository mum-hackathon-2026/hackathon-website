package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record AdminTeamDto(
        long teamId,
        String teamName,
        String status,
        boolean shortlisted,
        int memberCount,
        String submissionStatus,
        String projectTitle,
        String trackLabel,
        int reviewsCompleted,
        int reviewsExpected,
        List<String> attention,
        String githubUrl,
        String deployedUrl,
        OffsetDateTime submittedAt
) {}
