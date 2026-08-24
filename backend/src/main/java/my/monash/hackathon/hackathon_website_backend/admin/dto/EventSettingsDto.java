package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;

public record EventSettingsDto(
        Long id,
        String eventName,
        OffsetDateTime registrationOpensAt,
        OffsetDateTime registrationClosesAt,
        OffsetDateTime submissionDeadlineAt,
        OffsetDateTime resultsPublishedAt,
        boolean judgingOpen,
        int minTeamSize,
        int maxTeamSize,
        boolean screeningEnabled,
        int judgesPerTeam,
        String updatedBy
) {}
