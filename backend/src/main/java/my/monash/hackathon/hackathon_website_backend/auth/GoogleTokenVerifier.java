package my.monash.hackathon.hackathon_website_backend.auth;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;

/**
 * Verifies Google ID tokens sent by the Angular frontend.
 *
 * <p>The token is verified against Google's public keys and checked for the
 * correct audience (our client ID). A valid token means Google authenticated
 * the user — it does NOT mean the user is allowed into our system (that check
 * is in {@link AuthController}).
 */
@Service
public class GoogleTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleTokenVerifier.class);

    private final GoogleIdTokenVerifier verifier;

    public GoogleTokenVerifier(GoogleAuthProperties properties) {
        this.verifier = new GoogleIdTokenVerifier.Builder(
                new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(List.of(properties.clientId()))
                .build();
    }

    /**
     * Verifies a Google ID token string.
     *
     * @param idTokenString the raw JWT from the frontend
     * @return the verified token payload, or {@code null} if verification fails
     */
    public GoogleIdToken.Payload verify(String idTokenString) {
        try {
            GoogleIdToken idToken = verifier.verify(idTokenString);
            if (idToken != null) {
                return idToken.getPayload();
            }
            log.warn("Google ID token verification returned null (invalid token)");
            return null;
        } catch (GeneralSecurityException | IOException e) {
            log.error("Failed to verify Google ID token", e);
            return null;
        }
    }
}
