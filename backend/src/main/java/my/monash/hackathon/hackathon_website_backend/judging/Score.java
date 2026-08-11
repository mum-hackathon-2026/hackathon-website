package my.monash.hackathon.hackathon_website_backend.judging;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * One judge's mark against one rubric line, mapped to the {@code scores} table created by V1.
 *
 * <h2>The snapshot columns are frozen copies. Do not "fix" them.</h2>
 *
 * <p>{@link #criteriaMaxScoreSnapshot} and {@link #criteriaWeightSnapshot} are plain columns
 * holding the values {@link JudgingCriteria#getMaxScore()} and
 * {@link JudgingCriteria#getWeight()} had <em>at the moment this score was recorded</em>.
 * They are copied once, on write, and never again.
 *
 * <p>They look redundant — the row already links to the criterion, so why store its numbers?
 * Because the criterion is editable. If an admin raises a criterion's max score from 10 to
 * 20 halfway through judging, every score recorded under the old rubric would silently
 * change meaning, and published totals would shift underneath results that had already been
 * announced. Freezing the numbers is what makes a published result reproducible.
 *
 * <p>So, explicitly:
 *
 * <ul>
 *   <li>These fields are <strong>not</strong> derived from {@link #criteria}, and nothing
 *       keeps them in step with it. That is the entire point.
 *   <li>Do not replace them with a lookup through the association, a {@code @Formula}, a
 *       computed getter, or a listener that refreshes them.
 *   <li>Recomputing a total? Use the snapshots on this row, never the criterion's current
 *       values.
 * </ul>
 *
 * <p>The database backs this up: {@code scores_score_range_check} validates
 * {@code score <= criteria_max_score_snapshot} — against the snapshot, not against the
 * criterion — so a score stays valid under the rubric it was given under.
 * {@code (assignment_id, criteria_id)} is UNIQUE, so a judge marks each criterion once per
 * assignment.
 */
@Entity
@Table(name = "scores")
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assignment_id", nullable = false)
    private Assignment assignment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "criteria_id", nullable = false)
    private JudgingCriteria criteria;

    /** Constrained to {@code 0 <= score <= criteria_max_score_snapshot} by V1. */
    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal score;

    private String comment;

    /** Frozen at write time. See the class comment before touching this. */
    @Column(name = "criteria_max_score_snapshot", nullable = false, precision = 5, scale = 2)
    private BigDecimal criteriaMaxScoreSnapshot;

    /** Frozen at write time. See the class comment before touching this. */
    @Column(name = "criteria_weight_snapshot", nullable = false, precision = 5, scale = 2)
    private BigDecimal criteriaWeightSnapshot;

    /** Required by JPA. */
    protected Score() {}

    /**
     * Takes the snapshot from the criterion once, here, at construction. This is the only
     * place the two are connected; after this the score carries its own copy and the
     * criterion can change freely without disturbing it.
     */
    public Score(Assignment assignment, JudgingCriteria criteria, BigDecimal score) {
        this.assignment = assignment;
        this.criteria = criteria;
        this.score = score;
        this.criteriaMaxScoreSnapshot = criteria.getMaxScore();
        this.criteriaWeightSnapshot = criteria.getWeight();
    }

    public Long getId() {
        return id;
    }

    public Assignment getAssignment() {
        return assignment;
    }

    public JudgingCriteria getCriteria() {
        return criteria;
    }

    public BigDecimal getScore() {
        return score;
    }

    public void setScore(BigDecimal score) {
        this.score = score;
    }

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
        this.comment = comment;
    }

    public BigDecimal getCriteriaMaxScoreSnapshot() {
        return criteriaMaxScoreSnapshot;
    }

    public BigDecimal getCriteriaWeightSnapshot() {
        return criteriaWeightSnapshot;
    }
}
