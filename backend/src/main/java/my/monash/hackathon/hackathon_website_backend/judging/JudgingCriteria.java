package my.monash.hackathon.hackathon_website_backend.judging;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * One line of the judging rubric, mapped to the {@code judging_criteria} table created by V1.
 *
 * <p>Scored values are {@code numeric(5,2)} in the database and {@link BigDecimal} here,
 * never {@code double} or {@code float} — binary floating point cannot represent the
 * decimal values a rubric is written in, and published results have to add up exactly.
 *
 * <p>Criteria are editable after scoring has begun, which is why {@link Score} keeps its own
 * frozen copies of {@code max_score} and {@code weight}. Changing a criterion here does not
 * and must not alter scores already recorded against it — see {@code Score}'s class comment.
 * Deactivating a criterion via {@code is_active} is the intended way to retire it;
 * {@code scores_criteria_id_fkey} is ON DELETE RESTRICT, so a criterion that has been scored
 * against cannot be deleted at all.
 */
@Entity
@Table(name = "judging_criteria")
public class JudgingCriteria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    private String description;

    /** V1 enforces {@code max_score > 0}. */
    @Column(name = "max_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal maxScore;

    // The three initialisers below duplicate the DEFAULTs in V1 (weight 1.00,
    // display_order 0, is_active true). The columns are NOT NULL and Hibernate always names
    // them in the INSERT, so the database DEFAULT never applies and a null field would fail
    // the insert rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes any of these DEFAULTs must change it
    // here too. Nothing enforces the correspondence — both sides stay individually valid,
    // so no test will catch a mismatch.

    /** V1 enforces {@code weight > 0}. */
    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal weight = new BigDecimal("1.00");

    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    /**
     * Named {@code isActive} rather than {@code active} so the JavaBeans property is
     * literally {@code isActive}, which is what
     * {@link JudgingCriteriaRepository#findByIsActiveTrueOrderByDisplayOrder()} resolves
     * against. The accessors follow the field, not the usual boolean {@code isX()} form,
     * for the same reason.
     */
    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Required by JPA. */
    protected JudgingCriteria() {}

    public JudgingCriteria(String title, BigDecimal maxScore) {
        this.title = title;
        this.maxScore = maxScore;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getMaxScore() {
        return maxScore;
    }

    public void setMaxScore(BigDecimal maxScore) {
        this.maxScore = maxScore;
    }

    public BigDecimal getWeight() {
        return weight;
    }

    public void setWeight(BigDecimal weight) {
        this.weight = weight;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(boolean isActive) {
        this.isActive = isActive;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
