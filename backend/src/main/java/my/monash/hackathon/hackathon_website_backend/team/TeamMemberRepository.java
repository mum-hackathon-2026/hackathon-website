package my.monash.hackathon.hackathon_website_backend.team;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The identifier type is the user id, because {@code team_members.user_id} is the primary
 * key. No derived queries yet — none are needed to prove the mapping.
 */
public interface TeamMemberRepository extends JpaRepository<TeamMember, Long> {}
