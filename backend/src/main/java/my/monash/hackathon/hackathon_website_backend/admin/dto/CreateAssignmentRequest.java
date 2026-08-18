package my.monash.hackathon.hackathon_website_backend.admin.dto;

import jakarta.validation.constraints.NotNull;

public record CreateAssignmentRequest(
        @NotNull Long teamId,
        @NotNull Long judgeId
) {}
