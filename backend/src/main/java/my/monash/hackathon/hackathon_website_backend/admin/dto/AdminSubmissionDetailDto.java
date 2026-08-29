package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;

public record AdminSubmissionDetailDto(
        Long teamId,
        String teamName,
        String projectTitle,
        String description,
        String githubUrl,
        String deployedUrl,
        String slideDeckUrl,
        String videoDemoUrl,
        String representativeName,
        String representativePhone,
        String representativeEmail,
        String status,
        OffsetDateTime submittedAt
) {}
