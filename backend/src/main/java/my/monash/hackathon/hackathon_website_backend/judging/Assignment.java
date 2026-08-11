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
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * A judge's remit to score one team, mapped to the {@code assignments} table created by V1.
 *
 * <p><strong>Two of the three foreign keys point at {@code users} and mean different
 * things.</strong> {@link #judge} is the person who does the scoring; {@link #assignedBy} is
 * the admin who handed out the work. They are never interchangeable, and the fields are
 * named to make confusing them uncomfortable. Their delete rules differ accordingly:
 * {@code judge_id} is ON DELETE CASCADE as of V2 — deleting a judge removes their
 * assignments, and {@code scores} cascade from there — while {@code assigned_by} is ON
 * DELETE SET NULL, because deleting the admin who made an assignment must not delete the
 * judging work itself.
 *
 * <p>{@code (team_id, judge_id)} is UNIQUE, so a judge can be assigned to a given team at
 * most once. The database also enforces {@code status <> 'completed' OR completed_at IS NOT
 * NULL}.
 */
@Entity
@Table(name = "assignments")
public class Assignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    /** The judge who scores this team — <em>not</em> the admin who created the assignment. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "judge_id", nullable = false)
    private User judge;

    // The initialiser below duplicates the DEFAULT in V1 (status 'pending'). The column is
    // NOT NULL and Hibernate always names it in the INSERT, so the database DEFAULT never
    // applies and a null field would fail the insert rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes this DEFAULT must change it here too.
    // Nothing enforces the correspondence — both sides stay individually valid, so no test
    // will catch a mismatch.

    @Column(nullable = false)
    private String status = "pending";

    @Column(name = "overall_feedback")
    private String overallFeedback;

    /** The admin who made the assignment — <em>not</em> the judge who scores it. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_by")
    private User assignedBy;

    /**
     * Database-owned, filled from {@code DEFAULT now()}, following the same pattern as
     * {@code created_at} elsewhere: left out of INSERT and UPDATE, and read back afterwards
     * so the in-memory entity is not left holding a stale null.
     */
    @Generated(event = EventType.INSERT)
    @Column(name = "assigned_at", insertable = false, updatable = false)
    private OffsetDateTime assignedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    /** Required by JPA. */
    protected Assignment() {}

    public Assignment(Team team, User judge, User assignedBy) {
        this.team = team;
        this.judge = judge;
        this.assignedBy = assignedBy;
    }

    public Long getId() {
        return id;
    }

    public Team getTeam() {
        return team;
    }

    public void setTeam(Team team) {
        this.team = team;
    }

    public User getJudge() {
        return judge;
    }

    public void setJudge(User judge) {
        this.judge = judge;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getOverallFeedback() {
        return overallFeedback;
    }

    public void setOverallFeedback(String overallFeedback) {
        this.overallFeedback = overallFeedback;
    }

    public User getAssignedBy() {
        return assignedBy;
    }

    public void setAssignedBy(User assignedBy) {
        this.assignedBy = assignedBy;
    }

    public OffsetDateTime getAssignedAt() {
        return assignedAt;
    }

    public OffsetDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(OffsetDateTime completedAt) {
        this.completedAt = completedAt;
    }
}
