package my.monash.hackathon.hackathon_website_backend.result;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.team.Team;

/**
 * A team's final standing, mapped to the {@code team_results} table created by V1.
 *
 * <p>Keyed on {@code team_id}, which is both the primary key and the foreign key to
 * {@code teams} — one result row per team, enforced by the schema rather than by
 * convention. {@code @MapsId} reproduces the shared key, exactly as on {@code Submission}
 * and {@code TeamMember}; there is no surrogate id.
 *
 * <p>Every scored field is nullable, because a row can exist before results are worked out:
 * {@link #finalScore}, {@link #rank}, {@link #outcome} and {@link #publishedAt} are all
 * empty until judging closes. {@code published_at} being null is what distinguishes a
 * computed-but-unpublished result from a public one.
 *
 * <p>{@link #finalScore} is {@code numeric(6,2)} — wider than the {@code numeric(5,2)} on
 * {@code scores}, since it aggregates several weighted marks.
 */
@Entity
@Table(name = "team_results")
public class TeamResult {

    /** Populated by {@code @MapsId} from {@link #team}, never assigned directly. */
    @Id
    @Column(name = "team_id")
    private Long teamId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id")
    private Team team;

    @Column(name = "final_score", precision = 6, scale = 2)
    private BigDecimal finalScore;

    /** Null until ranking is worked out; V1 enforces {@code rank >= 1} when set. */
    @Column(name = "rank")
    private Integer rank;

    /** Stays a String like every other enum-like column; nullable until decided. */
    private String outcome;

    // The initialiser below duplicates the DEFAULT in V1 (judge_count 0). The column is NOT
    // NULL and Hibernate always names it in the INSERT, so the database DEFAULT never
    // applies and a null field would fail the insert rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes this DEFAULT must change it here too.
    // Nothing enforces the correspondence — both sides stay individually valid, so no test
    // will catch a mismatch.

    /** How many judges' scores went into {@link #finalScore}. */
    @Column(name = "judge_count", nullable = false)
    private int judgeCount = 0;

    /** Null while the result is computed but not yet public. */
    @Column(name = "published_at")
    private OffsetDateTime publishedAt;

    /** Required by JPA. */
    protected TeamResult() {}

    public TeamResult(Team team) {
        this.team = team;
    }

    public Long getTeamId() {
        return teamId;
    }

    public Team getTeam() {
        return team;
    }

    public BigDecimal getFinalScore() {
        return finalScore;
    }

    public void setFinalScore(BigDecimal finalScore) {
        this.finalScore = finalScore;
    }

    public Integer getRank() {
        return rank;
    }

    public void setRank(Integer rank) {
        this.rank = rank;
    }

    public String getOutcome() {
        return outcome;
    }

    public void setOutcome(String outcome) {
        this.outcome = outcome;
    }

    public int getJudgeCount() {
        return judgeCount;
    }

    public void setJudgeCount(int judgeCount) {
        this.judgeCount = judgeCount;
    }

    public OffsetDateTime getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(OffsetDateTime publishedAt) {
        this.publishedAt = publishedAt;
    }
}
