package my.monash.hackathon.hackathon_website_backend.admin;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RegistrationReviewRepository extends JpaRepository<RegistrationReview, Long> {

    Optional<RegistrationReview> findByTeamName(String teamName);

    List<RegistrationReview> findByStatusInOrderByCreatedAtDesc(List<String> statuses);
}
