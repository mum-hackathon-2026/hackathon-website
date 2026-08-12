package my.monash.hackathon.hackathon_website_backend.judging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
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
class ScoreRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private ScoreRepository scoreRepository;

    @Autowired private AssignmentRepository assignmentRepository;

    @Autowired private JudgingCriteriaRepository judgingCriteriaRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    private int unique;

    @Test
    void savesAndReadsBackWithSnapshotsTakenFromTheCriterion() {
        Assignment assignment = persistAssignment("JOINC001");
        JudgingCriteria criteria = persistCriteria("Snapshot Basics", "10.00", "2.50");

        Score saved = scoreRepository.save(new Score(assignment, criteria, new BigDecimal("8.50")));
        entityManager.flush();
        entityManager.clear();

        Score found = scoreRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getId()).isNotNull();
        assertThat(found.getScore()).isEqualByComparingTo("8.50");
        assertThat(found.getCriteriaMaxScoreSnapshot()).isEqualByComparingTo("10.00");
        assertThat(found.getCriteriaWeightSnapshot()).isEqualByComparingTo("2.50");
        assertThat(found.getAssignment().getId()).isEqualTo(assignment.getId());
        assertThat(found.getCriteria().getId()).isEqualTo(criteria.getId());
    }

    /**
     * <strong>This is the test that protects results integrity.</strong>
     *
     * <p>The snapshots are frozen copies of the rubric as it stood when the score was
     * recorded. Editing the criterion afterwards must not reach back and change them —
     * otherwise a published total would silently shift under a result that had already been
     * announced. If someone "fixes" the snapshot columns by deriving them from the linked
     * criterion, this test is what fails.
     */
    @Test
    void editingTheCriterionDoesNotChangeAnExistingScoreSnapshot() {
        Assignment assignment = persistAssignment("JOINC002");
        JudgingCriteria criteria = persistCriteria("Rubric Under Edit", "10.00", "1.00");

        Score saved = scoreRepository.save(new Score(assignment, criteria, new BigDecimal("9.00")));
        entityManager.flush();

        // The rubric is rewritten after judging has begun.
        JudgingCriteria toEdit = judgingCriteriaRepository.findById(criteria.getId()).orElseThrow();
        toEdit.setMaxScore(new BigDecimal("20.00"));
        toEdit.setWeight(new BigDecimal("3.00"));
        judgingCriteriaRepository.saveAndFlush(toEdit);
        entityManager.clear();

        Score reloaded = scoreRepository.findById(saved.getId()).orElseThrow();

        assertThat(reloaded.getCriteriaMaxScoreSnapshot())
                .as("the score keeps the max it was given under, not the criterion's new one")
                .isEqualByComparingTo("10.00");
        assertThat(reloaded.getCriteriaWeightSnapshot())
                .as("likewise the weight")
                .isEqualByComparingTo("1.00");
        assertThat(reloaded.getScore()).isEqualByComparingTo("9.00");

        assertThat(reloaded.getCriteria().getMaxScore())
                .as("the criterion itself really did change — the snapshot simply did not follow")
                .isEqualByComparingTo("20.00");
        assertThat(reloaded.getCriteria().getWeight()).isEqualByComparingTo("3.00");
    }

    /**
     * scores_score_range_check compares against criteria_max_score_snapshot, not against the
     * criterion's current max — a score is validated under the rubric it was given under.
     */
    @Test
    void aScoreAboveTheSnapshotMaximumIsRejected() {
        Assignment assignment = persistAssignment("JOINC003");
        JudgingCriteria criteria = persistCriteria("Bounded", "10.00", "1.00");

        Score tooHigh = new Score(assignment, criteria, new BigDecimal("11.00"));

        assertThatThrownBy(() -> scoreRepository.saveAndFlush(tooHigh))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("scores_score_range_check");
    }

    @Test
    void aNegativeScoreIsRejected() {
        Assignment assignment = persistAssignment("JOINC004");
        JudgingCriteria criteria = persistCriteria("Non Negative", "10.00", "1.00");

        Score negative = new Score(assignment, criteria, new BigDecimal("-1.00"));

        assertThatThrownBy(() -> scoreRepository.saveAndFlush(negative))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("scores_score_range_check");
    }

    /** (assignment_id, criteria_id) is UNIQUE: one mark per criterion per assignment. */
    @Test
    void theSameCriterionCannotBeScoredTwiceOnOneAssignment() {
        Assignment assignment = persistAssignment("JOINC005");
        JudgingCriteria criteria = persistCriteria("Scored Once", "10.00", "1.00");

        scoreRepository.save(new Score(assignment, criteria, new BigDecimal("7.00")));
        entityManager.flush();

        assertThatThrownBy(
                        () ->
                                scoreRepository.saveAndFlush(
                                        new Score(assignment, criteria, new BigDecimal("9.00"))))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("scores_assignment_id_criteria_id_key");
    }

    @Test
    void findsEveryScoreForOneAssignment() {
        Assignment assignment = persistAssignment("JOINC006");
        JudgingCriteria first = persistCriteria("Criterion One", "10.00", "1.00");
        JudgingCriteria second = persistCriteria("Criterion Two", "10.00", "1.00");

        scoreRepository.save(new Score(assignment, first, new BigDecimal("6.00")));
        scoreRepository.save(new Score(assignment, second, new BigDecimal("7.00")));
        entityManager.flush();
        entityManager.clear();

        List<Score> scores = scoreRepository.findByAssignmentId(assignment.getId());

        assertThat(scores).hasSize(2);
        assertThat(scores)
                .extracting(Score::getScore)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactlyInAnyOrder(new BigDecimal("6.00"), new BigDecimal("7.00"));
    }

    private Assignment persistAssignment(String joinCode) {
        int n = ++unique;
        User judge =
                userRepository.save(
                        new User("google-sub-sc-j" + n, "score.judge" + n + "@example.com", "J" + n));
        User admin =
                userRepository.save(
                        new User("google-sub-sc-a" + n, "score.admin" + n + "@example.com", "A" + n));
        Team team = teamRepository.save(new Team("Team Scored " + n, joinCode, admin));
        Assignment assignment = assignmentRepository.save(new Assignment(team, judge, admin));
        entityManager.flush();
        return assignment;
    }

    private JudgingCriteria persistCriteria(String title, String maxScore, String weight) {
        JudgingCriteria criteria = new JudgingCriteria(title, new BigDecimal(maxScore));
        criteria.setWeight(new BigDecimal(weight));
        JudgingCriteria saved = judgingCriteriaRepository.save(criteria);
        entityManager.flush();
        return saved;
    }
}
