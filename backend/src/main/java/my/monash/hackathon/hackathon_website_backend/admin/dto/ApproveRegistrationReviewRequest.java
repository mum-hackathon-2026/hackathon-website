package my.monash.hackathon.hackathon_website_backend.admin.dto;

import java.util.List;

/**
 * What an admin submits to approve one registration review. Pre-filled by the frontend from
 * {@link RegistrationReviewDto#members()}, but editable — this is what lets an admin correct
 * a malformed link or a name collision before the team is actually imported.
 */
public record ApproveRegistrationReviewRequest(
        String teamName,
        List<RegistrationReviewMemberDto> members
) {}
