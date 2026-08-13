package my.monash.hackathon.hackathon_website_backend.auth;

/**
 * Response body for a successful login.
 *
 * <p>Contains the JWT session token and basic user information so the frontend
 * can populate its auth state without a second request.
 */
public record AuthResponse(
        String token,
        UserInfo user
) {
    public record UserInfo(
            Long id,
            String email,
            String fullName,
            String role
    ) {}
}
