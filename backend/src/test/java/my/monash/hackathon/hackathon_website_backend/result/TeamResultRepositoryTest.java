package my.monash.hackathon.hackathon_website_backend.result;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
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
class TeamResultRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private TeamResultRepository teamResultRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private UserRepository userRepository;

    private int unique;

    @Test
    void savesAndReadsBackWithTheTeamIdAsPrimaryKey() {
        Team team = persistTeam("Team Ranked", "JOINR001");

        TeamResult result = new TeamResult(team);
        result.setFinalScore(new BigDecimal("87.25"));
        result.setRank(1);
        result.setOutcome("winner");
        result.setJudgeCount(3);
        result.setPublishedAt(OffsetDateTime.now());
        teamResultRepository.save(result);
        entityManager.flush();
        entityManager.clear();

        TeamResult found = teamResultRepository.findById(team.getId()).orElseThrow();

        assertThat(found.getTeamId())
                .as("the primary key IS the team id, not a surrogate")
                .isEqualTo(team.getId());
        assertThat(found.getTeam().getName()).isEqualTo("Team Ranked");
        assertThat(found.getFinalScore()).isEqualByComparingTo("87.25");
        assertThat(found.getRank()).isEqualTo(1);
        assertThat(found.getOutcome()).isEqualTo("winner");
        assertThat(found.getJudgeCount()).isEqualTo(3);
        assertThat(found.getPublishedAt()).isNotNull();
    }

    /** A result row can exist before anything has been worked out or published. */
    @Test
    void everyScoredFieldStartsEmpty() {
        Team team = persistTeam("Team Unscored", "JOINR002");

        teamResultRepository.saveAndFlush(new TeamResult(team));
        entityManager.clear();

        TeamResult found = teamResultRepository.findById(team.getId()).orElseThrow();
        assertThat(found.getFinalScore()).isNull();
        assertThat(found.getRank()).isNull();
        assertThat(found.getOutcome()).isNull();
        assertThat(found.getPublishedAt()).as("null published_at means not yet public").isNull();
        assertThat(found.getJudgeCount()).as("V1 DEFAULT 0").isZero();
    }

    /**
     * {@code rank} is nullable and Postgres sorts NULLs last on an ascending sort, so
     * unranked teams fall to the bottom of the leaderboard rather than the top.
     */
    @Test
    void ordersByRankWithUnrankedTeamsLast() {
        teamResultRepository.save(rankedResult("JOINR003", 2));
        teamResultRepository.save(rankedResult("JOINR004", 1));
        teamResultRepository.save(rankedResult("JOINR005", null));
        entityManager.flush();
        entityManager.clear();

        List<TeamResult> leaderboard = teamResultRepository.findAllByOrderByRankAsc();

        assertThat(leaderboard).extracting(TeamResult::getRank).containsExactly(1, 2, null);
    }

    /** V1 enforces {@code rank IS NULL OR rank >= 1}. */
    @Test
    void aRankBelowOneIsRejected() {
        Team team = persistTeam("Team Zeroth", "JOINR006");
        TeamResult result = new TeamResult(team);
        result.setRank(0);

        assertThatThrownBy(() -> teamResultRepository.saveAndFlush(result))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("team_results_rank_check");
    }

    private TeamResult rankedResult(String joinCode, Integer rank) {
        TeamResult result = new TeamResult(persistTeam("Team Rank " + joinCode, joinCode));
        result.setRank(rank);
        return result;
    }

    private Team persistTeam(String name, String joinCode) {
        int n = ++unique;
        User owner =
                userRepository.save(
                        new User("google-sub-tr" + n, "result" + n + "@example.com", "Test " + n));
        Team team = teamRepository.save(new Team(name, joinCode, owner));
        entityManager.flush();
        return team;
    }
}
