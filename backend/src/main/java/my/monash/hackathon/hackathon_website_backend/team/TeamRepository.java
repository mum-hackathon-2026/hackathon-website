package my.monash.hackathon.hackathon_website_backend.team;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamRepository extends JpaRepository<Team, Long> {

    Optional<Team> findByName(String name);

    Optional<Team> findByJoinCode(String joinCode);
}
