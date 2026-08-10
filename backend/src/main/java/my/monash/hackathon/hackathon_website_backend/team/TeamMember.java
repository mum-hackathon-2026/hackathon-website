package my.monash.hackathon.hackathon_website_backend.team;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * Membership of a team, mapped to the {@code team_members} table created by V1.
 *
 * <p>There is no surrogate key on purpose. In V1 {@code user_id} is both the primary key
 * and the foreign key to {@code users}, which is what enforces one team per person; adding
 * a generated id would quietly discard that rule. {@code @MapsId} reproduces the shared
 * key: the identifier is taken from the associated {@link User} rather than allocated.
 */
@Entity
@Table(name = "team_members")
public class TeamMember {

    /** Populated by {@code @MapsId} from {@link #user}, never assigned directly. */
    @Id
    @Column(name = "user_id")
    private Long userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Generated(event = EventType.INSERT)
    @Column(name = "joined_at", insertable = false, updatable = false)
    private OffsetDateTime joinedAt;

    /** Required by JPA. */
    protected TeamMember() {}

    public TeamMember(User user, Team team) {
        this.user = user;
        this.team = team;
    }

    public Long getUserId() {
        return userId;
    }

    public User getUser() {
        return user;
    }

    public Team getTeam() {
        return team;
    }

    public void setTeam(Team team) {
        this.team = team;
    }

    public OffsetDateTime getJoinedAt() {
        return joinedAt;
    }
}
