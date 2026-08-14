package my.monash.hackathon.hackathon_website_backend.submission;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.team.Team;

/**
 * A team's project entry, mapped to the {@code submissions} table created by V1.
 *
 * <p>There is no surrogate key on purpose, exactly as on {@code TeamMember}: {@code team_id}
 * is both the primary key and the foreign key to {@code teams}, which is what enforces at
 * most one submission per team. Adding a generated id would quietly discard that rule.
 * {@code @MapsId} reproduces the shared key — the identifier is taken from the associated
 * {@link Team} rather than allocated.
 *
 * <p>{@code status} stays a String, like every other enum-like column. Its vocabulary
 * ({@code draft}, {@code submitted}, {@code withdrawn}, {@code disqualified}) is the full
 * set: V2 removed {@code 'submitted'} from {@code teams.status}, but deliberately left it
 * here, because this is the column that records whether a team submitted. Don't read
 * submission state off the team.
 *
 * <p>The database also enforces {@code status <> 'submitted' OR submitted_at IS NOT NULL},
 * so moving a row to {@code submitted} without stamping {@link #submittedAt} is rejected.
 */
@Entity
@Table(name = "submissions")
public class Submission {

    /** Populated by {@code @MapsId} from {@link #team}, never assigned directly. */
    @Id
    @Column(name = "team_id")
    private Long teamId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id")
    private Team team;

    @Column(name = "project_title", nullable = false)
    private String projectTitle;

    private String description;

    /**
     * The repository for the project this team built. V1 enforces {@code ^https?://} on
     * both URL columns when they are non-null.
     *
     * <p><strong>Not the same thing as {@code User.githubUrl}</strong>, added by V4, which
     * is a participant's personal GitHub account collected at registration for screening.
     * This one is an artefact; that one is an identity. They share a column name in
     * different tables, so a join that selects both must say which it means.
     */
    @Column(name = "github_url")
    private String githubUrl;

    @Column(name = "deployed_url")
    private String deployedUrl;

    @Column(name = "track_label")
    private String trackLabel;

    // The initialiser below duplicates the DEFAULT in V1 (status 'draft'). The column is
    // NOT NULL and Hibernate always names it in the INSERT, so the database DEFAULT never
    // applies and a null field would fail the insert rather than fall back to it.
    //
    // KEEP IN SYNC: a later migration that changes this DEFAULT must change it here too.
    // Nothing enforces the correspondence — both sides stay individually valid, so no test
    // will catch a mismatch.

    @Column(nullable = false)
    private String status = "draft";

    @Column(name = "submitted_at")
    private OffsetDateTime submittedAt;

    /**
     * Backs the {@code version} column, giving optimistic locking so two teammates editing
     * the same submission cannot silently overwrite each other. Hibernate owns the value;
     * the initialiser matches V1's {@code DEFAULT 0}.
     */
    @Version
    @Column(nullable = false)
    private int version = 0;

    /** Required by JPA. */
    protected Submission() {}

    public Submission(Team team, String projectTitle) {
        this.team = team;
        this.projectTitle = projectTitle;
    }

    public Long getTeamId() {
        return teamId;
    }

    public Team getTeam() {
        return team;
    }

    public String getProjectTitle() {
        return projectTitle;
    }

    public void setProjectTitle(String projectTitle) {
        this.projectTitle = projectTitle;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getGithubUrl() {
        return githubUrl;
    }

    public void setGithubUrl(String githubUrl) {
        this.githubUrl = githubUrl;
    }

    public String getDeployedUrl() {
        return deployedUrl;
    }

    public void setDeployedUrl(String deployedUrl) {
        this.deployedUrl = deployedUrl;
    }

    public String getTrackLabel() {
        return trackLabel;
    }

    public void setTrackLabel(String trackLabel) {
        this.trackLabel = trackLabel;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public OffsetDateTime getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(OffsetDateTime submittedAt) {
        this.submittedAt = submittedAt;
    }

    public int getVersion() {
        return version;
    }
}
