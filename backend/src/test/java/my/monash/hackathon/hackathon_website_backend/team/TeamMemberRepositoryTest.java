package my.monash.hackathon.hackathon_website_backend.team;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class TeamMemberRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private TeamMemberRepository teamMemberRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void bothAssociationsResolveAfterReload() {
        User user = userRepository.save(newUser("ada", "ada@example.com"));
        Team team = teamRepository.save(new Team("Team Analytical", "JOINM001", user));
        entityManager.flush();

        teamMemberRepository.save(new TeamMember(user, team));
        entityManager.flush();
        entityManager.clear();

        TeamMember found = teamMemberRepository.findById(user.getId()).orElseThrow();

        assertThat(found.getUserId())
                .as("the primary key IS the user id, not a surrogate")
                .isEqualTo(user.getId());
        assertThat(found.getUser().getEmail()).isEqualTo("ada@example.com");
        assertThat(found.getTeam().getName()).isEqualTo("Team Analytical");
        assertThat(found.getJoinedAt()).isNotNull();
    }

    /**
     * team_members.user_id is the primary key, so one person can belong to at most one
     * team. This proves the rule survives the JPA mapping rather than only holding for
     * hand-written SQL.
     */
    @Test
    void aUserCannotJoinASecondTeam() {
        User user = userRepository.save(newUser("alan", "alan2@example.com"));
        Team first = teamRepository.save(new Team("Team First", "JOINM002", user));
        Team second = teamRepository.save(new Team("Team Second", "JOINM003", user));
        entityManager.flush();

        teamMemberRepository.save(new TeamMember(user, first));
        entityManager.flush();
        entityManager.clear();

        User reloaded = userRepository.findById(user.getId()).orElseThrow();
        Team otherTeam = teamRepository.findById(second.getId()).orElseThrow();

        // saveAndFlush, not TestEntityManager.flush: the flush has to happen inside the
        // repository proxy for Spring to translate the driver error into its own
        // DataIntegrityViolationException, which is what application code will catch.
        assertThatThrownBy(
                        () -> teamMemberRepository.saveAndFlush(new TeamMember(reloaded, otherTeam)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("team_members_pkey");
    }

    private static User newUser(String sub, String email) {
        return new User("google-sub-tm-" + sub, email, "Test " + sub);
    }
}
