package my.monash.hackathon.hackathon_website_backend.team;

import java.time.OffsetDateTime;
import java.util.List;

public record MyTeamResponse(
        Long id,
        String name,
        String joinCode,
        String status,
        boolean shortlisted,
        Long createdBy,
        OffsetDateTime createdAt,
        List<TeamMemberDetailDto> members
) {}
