package my.monash.hackathon.hackathon_website_backend.admin.dto;

public record UpdateTeamRequest(
        String teamName,
        String status,
        Boolean shortlisted
) {}
