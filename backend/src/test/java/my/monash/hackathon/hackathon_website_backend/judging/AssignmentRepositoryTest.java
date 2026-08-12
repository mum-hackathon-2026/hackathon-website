package my.monash.hackathon.hackathon_website_backend.judging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamRepository;
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
class AssignmentRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private AssignmentRepository assignmentRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void databaseGeneratesTheIdAndPopulatesAssignedAt() {
        User judge = persistUser("judge-a", "judge.a@example.com");
        User admin = persistUser("admin-a", "admin.a@example.com");
        Team team = persistTeam("Team Judged", "JOINA001", admin);

        Assignment assignment = new Assignment(team, judge, admin);
        assertThat(assignment.getId()).as("id must not be assigned by Java").isNull();
        assertThat(assignment.getAssignedAt()).as("assigned_at is the database's to set").isNull();

        Assignment saved = assignmentRepository.save(assignment);
        entityManager.flush();
        entityManager.clear();

        Assignment found = assignmentRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getId()).isNotNull();
        assertThat(found.getAssignedAt())
                .as("assigned_at is populated by DEFAULT now(), read back after insert")
                .isNotNull();
        assertThat(found.getStatus()).as("V1 DEFAULT 'pending'").isEqualTo("pending");
        assertThat(found.getCompletedAt()).isNull();
        assertThat(found.getTeam().getName()).isEqualTo("Team Judged");
    }

    /**
     * Both judge_id and assigned_by point at users. This is the test that would catch them
     * being wired to the same column, or swapped.
     */
    @Test
    void theJudgeAndTheAssigningAdminAreDistinctPeople() {
        User judge = persistUser("judge-b", "judge.b@example.com");
        User admin = persistUser("admin-b", "admin.b@example.com");
        Team team = persistTeam("Team Two Users", "JOINA002", admin);

        Assignment saved = assignmentRepository.save(new Assignment(team, judge, admin));
        entityManager.flush();
        entityManager.clear();

        Assignment found = assignmentRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getJudge().getEmail()).isEqualTo("judge.b@example.com");
        assertThat(found.getAssignedBy().getEmail()).isEqualTo("admin.b@example.com");
        assertThat(found.getJudge().getId()).isNotEqualTo(found.getAssignedBy().getId());
    }

    /** assigned_by is nullable and ON DELETE SET NULL, so an unattributed assignment is legal. */
    @Test
    void assignedByMayBeAbsent() {
        User judge = persistUser("judge-c", "judge.c@example.com");
        Team team = persistTeam("Team Unattributed", "JOINA003", judge);

        Assignment saved = assignmentRepository.saveAndFlush(new Assignment(team, judge, null));
        entityManager.clear();

        Assignment found = assignmentRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getAssignedBy()).isNull();
        assertThat(found.getJudge()).isNotNull();
    }

    @Test
    void findsByJudgeAndByTeam() {
        User judge = persistUser("judge-d", "judge.d@example.com");
        User other = persistUser("judge-e", "judge.e@example.com");
        User admin = persistUser("admin-d", "admin.d@example.com");
        Team first = persistTeam("Team Alpha", "JOINA004", admin);
        Team second = persistTeam("Team Beta", "JOINA005", admin);

        assignmentRepository.save(new Assignment(first, judge, admin));
        assignmentRepository.save(new Assignment(second, judge, admin));
        assignmentRepository.save(new Assignment(first, other, admin));
        entityManager.flush();
        entityManager.clear();

        List<Assignment> forJudge = assignmentRepository.findByJudgeId(judge.getId());
        List<Assignment> forTeam = assignmentRepository.findByTeamId(first.getId());

        assertThat(forJudge).hasSize(2);
        assertThat(forJudge)
                .as("findByJudgeId must resolve through judge_id, not assigned_by")
                .allSatisfy(a -> assertThat(a.getJudge().getId()).isEqualTo(judge.getId()));
        assertThat(forTeam).hasSize(2);
        assertThat(assignmentRepository.findByJudgeId(admin.getId()))
                .as("the admin assigned all three but judges none")
                .isEmpty();
    }

    /** (team_id, judge_id) is UNIQUE: a judge is assigned to a given team at most once. */
    @Test
    void aJudgeCannotBeAssignedToTheSameTeamTwice() {
        User judge = persistUser("judge-f", "judge.f@example.com");
        User admin = persistUser("admin-f", "admin.f@example.com");
        Team team = persistTeam("Team Duplicate", "JOINA006", admin);

        assignmentRepository.save(new Assignment(team, judge, admin));
        entityManager.flush();

        assertThatThrownBy(
                        () ->
                                assignmentRepository.saveAndFlush(
                                        new Assignment(team, judge, admin)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("assignments_team_id_judge_id_key");
    }

    /** V1 enforces {@code status <> 'completed' OR completed_at IS NOT NULL}. */
    @Test
    void completingWithoutATimestampIsRejected() {
        User judge = persistUser("judge-g", "judge.g@example.com");
        User admin = persistUser("admin-g", "admin.g@example.com");
        Team team = persistTeam("Team Incomplete", "JOINA007", admin);

        Assignment assignment = new Assignment(team, judge, admin);
        assignment.setStatus("completed");

        assertThatThrownBy(() -> assignmentRepository.saveAndFlush(assignment))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("assignments_completed_at_check");
    }

    private User persistUser(String suffix, String email) {
        User user = userRepository.save(new User("google-sub-" + suffix, email, "Test " + suffix));
        entityManager.flush();
        return user;
    }

    private Team persistTeam(String name, String joinCode, User owner) {
        Team team = teamRepository.save(new Team(name, joinCode, owner));
        entityManager.flush();
        return team;
    }
}
