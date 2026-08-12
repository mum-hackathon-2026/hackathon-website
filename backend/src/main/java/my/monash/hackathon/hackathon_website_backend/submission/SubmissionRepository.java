package my.monash.hackathon.hackathon_website_backend.submission;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The identifier type is the team id, because {@code submissions.team_id} is the primary
 * key — so {@link #findByTeamId(Long)} and {@code findById} reach the same row. The named
 * method exists because it reads correctly at the call site and proves the {@code @MapsId}
 * mapping resolves through a derived query.
 */
public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    Optional<Submission> findByTeamId(Long teamId);
}
