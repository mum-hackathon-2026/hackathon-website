package my.monash.hackathon.hackathon_website_backend.team;

import static org.assertj.core.api.Assertions.assertThat;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class TeamRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void newTeamStartsAtVersionZero() {
        User creator = userRepository.save(newUser("grace", "grace@example.com"));

        Team saved = teamRepository.save(new Team("Team Mainframe", "JOIN0001", creator));
        entityManager.flush();

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getVersion()).as("V1 defaults teams.version to 0").isZero();
        assertThat(saved.getStatus()).isEqualTo("forming");
        assertThat(saved.isShortlisted()).isFalse();
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    void updatingATeamIncrementsTheVersion() {
        User creator = userRepository.save(newUser("alan", "alan@example.com"));
        Team saved = teamRepository.save(new Team("Team Bombe", "JOIN0002", creator));
        entityManager.flush();
        assertThat(saved.getVersion()).isZero();

        saved.setStatus("complete");
        entityManager.flush();

        assertThat(saved.getVersion())
                .as("@Version must make Hibernate bump teams.version on update")
                .isEqualTo(1);
    }

    @Test
    void createdByAssociationResolvesAfterReload() {
        User creator = userRepository.save(newUser("katherine", "katherine@example.com"));
        teamRepository.save(new Team("Team Apollo", "JOIN0003", creator));
        entityManager.flush();
        entityManager.clear();

        Team found = teamRepository.findByJoinCode("JOIN0003").orElseThrow();

        assertThat(found.getCreatedBy().getId()).isEqualTo(creator.getId());
        assertThat(found.getCreatedBy().getEmail()).isEqualTo("katherine@example.com");
        assertThat(teamRepository.findByName("Team Apollo")).isPresent();
    }

    private static User newUser(String sub, String email) {
        return new User("google-sub-" + sub, email, "Test " + sub);
    }
}
