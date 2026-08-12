package my.monash.hackathon.hackathon_website_backend.result;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The identifier type is the team id, because {@code team_results.team_id} is the primary
 * key.
 */
public interface TeamResultRepository extends JpaRepository<TeamResult, Long> {

    /**
     * The leaderboard. {@code rank} is nullable, and Postgres sorts NULLs last on an
     * ascending sort, so unranked teams fall to the bottom rather than the top.
     */
    List<TeamResult> findAllByOrderByRankAsc();
}
