package my.monash.hackathon.hackathon_website_backend.judging;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScoreRepository extends JpaRepository<Score, Long> {

    /** Every mark a judge recorded for one assignment, one per rubric line. */
    List<Score> findByAssignmentId(Long assignmentId);
}
