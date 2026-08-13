package my.monash.hackathon.hackathon_website_backend.auth;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/auth/google}.
 *
 * <p>The {@code idToken} is the JWT obtained from Google Identity Services on the frontend.
 */
public record GoogleLoginRequest(
        @NotBlank String idToken
) {}
