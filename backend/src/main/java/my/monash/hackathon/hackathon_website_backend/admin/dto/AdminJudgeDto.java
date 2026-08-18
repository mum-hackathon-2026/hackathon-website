package my.monash.hackathon.hackathon_website_backend.admin.dto;

public record AdminJudgeDto(
        long userId,
        String name,
        String email,
        int assigned,
        int completed,
        String competingTeam
) {}
