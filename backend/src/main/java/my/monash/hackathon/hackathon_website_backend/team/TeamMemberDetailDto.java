package my.monash.hackathon.hackathon_website_backend.team;

import java.time.OffsetDateTime;

public record TeamMemberDetailDto(
        Long userId,
        String name,
        String email,
        String initials,
        String phone,
        String resumeUrl,
        String linkedinUrl,
        String githubUrl,
        boolean isLeader,
        boolean isYou,
        OffsetDateTime joinedAt
) {}
