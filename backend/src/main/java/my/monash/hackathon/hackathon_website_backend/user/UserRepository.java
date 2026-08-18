package my.monash.hackathon.hackathon_website_backend.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    /** Emails are stored lowercase (enforced by a CHECK in V1), so lookups must be too. */
    Optional<User> findByEmail(String email);

    Optional<User> findByGoogleSub(String googleSub);

    java.util.List<User> findByRole(String role);
}
