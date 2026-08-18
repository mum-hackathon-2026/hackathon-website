package my.monash.hackathon.hackathon_website_backend.team;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The identifier type is the user id, because {@code team_members.user_id} is the primary
 * key.
 */
public interface TeamMemberRepository extends JpaRepository<TeamMember, Long> {

    List<TeamMember> findByTeamId(Long teamId);
}

