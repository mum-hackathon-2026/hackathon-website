package my.monash.hackathon.hackathon_website_backend.admin.dto;

/**
 * One member's fields, either as submitted (in a {@link RegistrationReviewDto}, read from
 * {@code registration_reviews.raw_payload} verbatim) or as an admin has edited them (in an
 * {@link ApproveRegistrationReviewRequest}). {@code major} is carried for context only — it
 * is never persisted, matching {@code users} having no {@code major} column.
 */
public record RegistrationReviewMemberDto(
        String block,
        String fullName,
        String email,
        String phone,
        String major,
        String resumeUrl,
        String linkedinUrl,
        String githubUrl
) {}
