package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;

public record UpdateEventSettingsRequest(
        String eventName,
        OffsetDateTime registrationOpensAt,
        OffsetDateTime registrationClosesAt,
        OffsetDateTime submissionDeadlineAt,
        OffsetDateTime resultsPublishedAt,
        Boolean judgingOpen,
        Integer minTeamSize,
        Integer maxTeamSize,
        Boolean screeningEnabled,
        Integer judgesPerTeam
) {}
