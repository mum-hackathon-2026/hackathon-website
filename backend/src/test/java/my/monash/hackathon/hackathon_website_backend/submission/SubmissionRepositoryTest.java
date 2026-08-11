package my.monash.hackathon.hackathon_website_backend.submission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
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
class SubmissionRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private SubmissionRepository submissionRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    @Test
    void savesAndReadsBackWithTheTeamIdAsPrimaryKey() {
        Team team = persistTeam("sub-a", "Team Submitting", "JOINS001");

        Submission submission = new Submission(team, "Rain Radar");
        submission.setGithubUrl("https://github.com/example/rain-radar");
        submissionRepository.save(submission);
        entityManager.flush();
        entityManager.clear();

        Submission found = submissionRepository.findByTeamId(team.getId()).orElseThrow();

        assertThat(found.getTeamId())
                .as("the primary key IS the team id, not a surrogate")
                .isEqualTo(team.getId());
        assertThat(found.getTeam().getName()).isEqualTo("Team Submitting");
        assertThat(found.getProjectTitle()).isEqualTo("Rain Radar");
        assertThat(found.getStatus()).as("V1 DEFAULT 'draft'").isEqualTo("draft");
        assertThat(found.getSubmittedAt()).isNull();
        assertThat(found.getVersion()).isZero();
    }

    /**
     * submissions.team_id is the primary key, so a team gets at most one submission. This
     * proves the rule survives the {@code @MapsId} mapping rather than only holding for
     * hand-written SQL.
     */
    @Test
    void aTeamCannotHaveASecondSubmission() {
        Team team = persistTeam("sub-b", "Team Twice", "JOINS002");

        submissionRepository.save(new Submission(team, "First Entry"));
        entityManager.flush();
        entityManager.clear();

        Team reloaded = teamRepository.findById(team.getId()).orElseThrow();

        // saveAndFlush, not TestEntityManager.flush: the flush has to happen inside the
        // repository proxy for Spring to translate the driver error into its own
        // DataIntegrityViolationException.
        assertThatThrownBy(
                        () ->
                                submissionRepository.saveAndFlush(
                                        new Submission(reloaded, "Second Entry")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /** V1 enforces {@code status <> 'submitted' OR submitted_at IS NOT NULL}. */
    @Test
    void submittingWithoutATimestampIsRejected() {
        Team team = persistTeam("sub-c", "Team Undated", "JOINS003");

        Submission submission = new Submission(team, "Undated Entry");
        submission.setStatus("submitted");

        assertThatThrownBy(() -> submissionRepository.saveAndFlush(submission))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("submissions_submitted_at_check");
    }

    /** The same row passes once the timestamp the CHECK asks for is present. */
    @Test
    void submittingWithATimestampIsAccepted() {
        Team team = persistTeam("sub-d", "Team Dated", "JOINS004");

        Submission submission = new Submission(team, "Dated Entry");
        submission.setStatus("submitted");
        submission.setSubmittedAt(OffsetDateTime.now());
        submissionRepository.saveAndFlush(submission);
        entityManager.clear();

        Submission found = submissionRepository.findByTeamId(team.getId()).orElseThrow();
        assertThat(found.getStatus()).isEqualTo("submitted");
        assertThat(found.getSubmittedAt()).isNotNull();
    }

    private Team persistTeam(String suffix, String name, String joinCode) {
        User owner =
                userRepository.save(
                        new User("google-sub-" + suffix, suffix + "@example.com", "Test " + suffix));
        Team team = teamRepository.save(new Team(name, joinCode, owner));
        entityManager.flush();
        return team;
    }
}
