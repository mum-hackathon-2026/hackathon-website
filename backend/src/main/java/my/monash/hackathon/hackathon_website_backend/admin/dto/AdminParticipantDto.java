package my.monash.hackathon.hackathon_website_backend.admin.dto;

public record AdminParticipantDto(
        long userId,
        String fullName,
        String email,
        Long teamId,
        String teamName,
        boolean emailVerified,
        String eligibility,
        String role,
        String phone,
        String githubUrl,
        String linkedinUrl,
        String resumeUrl
) {}
