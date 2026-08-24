package my.monash.hackathon.hackathon_website_backend.judging;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AssignmentRepository extends JpaRepository<Assignment, Long> {

    /** A judge's own queue. Resolves through the {@code judge} association, not {@code assignedBy}. */
    List<Assignment> findByJudgeId(Long judgeId);

    /** Every judge assigned to one team. */
    List<Assignment> findByTeamId(Long teamId);

    /** Check whether a judge is already assigned to a team. */
    java.util.Optional<Assignment> findByJudgeIdAndTeamId(Long judgeId, Long teamId);
}
