package my.monash.hackathon.hackathon_website_backend.auth;

import jakarta.validation.Valid;
import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Handles Google Sign-In and session management.
 *
 * <p>{@code POST /api/auth/google} accepts a Google ID token from the frontend,
 * verifies it, and — if the user's email exists in the {@code users} table —
 * issues a JWT session token. Users whose email is not pre-registered are
 * denied with 403.
 *
 * <p>{@code GET /api/auth/me} returns the authenticated user's profile from the
 * JWT, so the frontend can restore its auth state on page refresh.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final GoogleTokenVerifier googleTokenVerifier;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final my.monash.hackathon.hackathon_website_backend.webhook.RegistrationImportService registrationImportService;

    public AuthController(GoogleTokenVerifier googleTokenVerifier,
                          JwtService jwtService,
                          UserRepository userRepository,
                          my.monash.hackathon.hackathon_website_backend.webhook.RegistrationImportService registrationImportService) {
        this.googleTokenVerifier = googleTokenVerifier;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.registrationImportService = registrationImportService;
    }

    /**
     * Authenticates a user via Google Sign-In.
     *
     * <p>Only users whose email is already in the {@code users} table are
     * allowed. This is the email-whitelist enforcement: if the Google account
     * is valid but the email is not registered, the response is 403.
     */
    @PostMapping("/google")
    public ResponseEntity<?> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {

        // 1. Verify the Google ID token
        var payload = googleTokenVerifier.verify(request.idToken());
        if (payload == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid Google ID token"));
        }

        String email = payload.getEmail().toLowerCase();
        boolean emailVerified = Boolean.TRUE.equals(payload.getEmailVerified());

        if (!emailVerified) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Google email is not verified"));
        }

        // 2. Check if the email exists in the users table (whitelist check)
        var userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty() && registrationImportService != null) {
            // Attempt on-demand sync from Google Sheets in case the form was just submitted
            try {
                log.info("Email {} not yet in local DB. Checking Google Sheets on-demand...", email);
                registrationImportService.syncFromSheets(false);
                userOpt = userRepository.findByEmail(email);
            } catch (Exception e) {
                log.warn("On-demand sheet sync check failed during login for {}: {}", email, e.getMessage());
            }
        }

        if (userOpt.isEmpty()) {
            log.info("Login denied: email not registered — {}", email);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: email not registered"));
        }

        var user = userOpt.get();

        // 3. Update user fields on login
        String googleSub = payload.getSubject();
        if (user.getGoogleSub() == null || user.getGoogleSub().isBlank()
                || !user.getGoogleSub().equals(googleSub)) {
            user.setGoogleSub(googleSub);
        }
        user.setEmailVerified(true);
        user.setLastLoginAt(OffsetDateTime.now());

        // Update full name from Google if the user's name was a placeholder
        String googleName = (String) payload.get("name");
        if (googleName != null && !googleName.isBlank()) {
            user.setFullName(googleName);
        }

        userRepository.save(user);

        // 4. Issue our own JWT
        String token = jwtService.generateToken(user);

        var response = new AuthResponse(
                token,
                new AuthResponse.UserInfo(
                        user.getId(),
                        user.getEmail(),
                        user.getFullName(),
                        user.getRole()
                )
        );

        log.info("Login successful: {} (role={})", email, user.getRole());
        return ResponseEntity.ok(response);
    }

    /**
     * Returns the authenticated user's profile.
     *
     * <p>The user object is set in the security context by
     * {@link JwtAuthenticationFilter}, which loads it from the database
     * on every request.
     */
    @GetMapping("/me")
    public ResponseEntity<AuthResponse.UserInfo> me(@AuthenticationPrincipal User user) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(new AuthResponse.UserInfo(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole()
        ));
    }
}
