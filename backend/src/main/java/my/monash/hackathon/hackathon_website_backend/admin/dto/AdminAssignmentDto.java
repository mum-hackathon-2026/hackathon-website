package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record AdminAssignmentDto(
        long teamId,
        String teamName,
        String trackLabel,
        String teamStatus,
        boolean hasSubmission,
        List<JudgeAssignmentInfo> judges,
        boolean underAssigned
) {
    public record JudgeAssignmentInfo(
            long id,
            long teamId,
            long judgeId,
            String judgeName,
            String status,
            OffsetDateTime assignedAt,
            OffsetDateTime completedAt
    ) {}
}
