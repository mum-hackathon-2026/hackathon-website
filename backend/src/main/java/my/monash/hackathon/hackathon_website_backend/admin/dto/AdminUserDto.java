package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.time.OffsetDateTime;

public record AdminUserDto(
        Long id,
        String fullName,
        String email,
        String role,
        OffsetDateTime createdAt,
        OffsetDateTime lastLoginAt
) {}
