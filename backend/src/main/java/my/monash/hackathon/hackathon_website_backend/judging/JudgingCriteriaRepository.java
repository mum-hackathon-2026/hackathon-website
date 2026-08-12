package my.monash.hackathon.hackathon_website_backend.judging;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JudgingCriteriaRepository extends JpaRepository<JudgingCriteria, Long> {

    /** The live rubric, in the order judges should see it. Retired criteria are excluded. */
    List<JudgingCriteria> findByIsActiveTrueOrderByDisplayOrder();
}
