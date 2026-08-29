package my.monash.hackathon.hackathon_website_backend.admin.dto;

public record UpdateSubmissionRequest(
        String projectTitle,
        String description,
        String githubUrl,
        String deployedUrl,
        String slideDeckUrl,
        String videoDemoUrl,
        String representativeName,
        String representativePhone,
        String representativeEmail,
        String status
) {}
