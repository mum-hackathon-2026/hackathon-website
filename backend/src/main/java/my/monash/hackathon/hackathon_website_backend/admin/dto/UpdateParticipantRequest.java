package my.monash.hackathon.hackathon_website_backend.admin.dto;

public record UpdateParticipantRequest(
        String fullName,
        String email,
        String phone,
        String githubUrl,
        String linkedinUrl,
        String resumeUrl,
        String role
) {}
