package my.monash.hackathon.hackathon_website_backend.team;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/teams")
public class TeamController {

    private final TeamRepository teamRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final UserRepository userRepository;

    public TeamController(TeamRepository teamRepository,
                          TeamMemberRepository teamMemberRepository,
                          UserRepository userRepository) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.userRepository = userRepository;
    }

    /**
     * Returns the currently authenticated participant's team and its members.
     */
    @GetMapping("/my")
    @Transactional(readOnly = true)
    public ResponseEntity<MyTeamResponse> getMyTeam(@AuthenticationPrincipal User currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<TeamMember> membership = teamMemberRepository.findById(currentUser.getId());
        if (membership.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        Team team = membership.get().getTeam();
        List<TeamMember> members = teamMemberRepository.findByTeamId(team.getId());

        Long leaderId = team.getCreatedBy() != null ? team.getCreatedBy().getId() : null;

        List<TeamMemberDetailDto> memberDtos = members.stream()
                .map(m -> {
                    User u = m.getUser();
                    boolean isLeader = leaderId != null && leaderId.equals(u.getId());
                    boolean isYou = u.getId().equals(currentUser.getId());
                    return new TeamMemberDetailDto(
                            u.getId(),
                            u.getFullName(),
                            u.getEmail(),
                            deriveInitials(u.getFullName()),
                            u.getPhone(),
                            u.getResumeUrl(),
                            u.getLinkedinUrl(),
                            u.getGithubUrl(),
                            isLeader,
                            isYou,
                            m.getJoinedAt()
                    );
                })
                .sorted(Comparator.comparing(TeamMemberDetailDto::isLeader).reversed()
                        .thenComparing(TeamMemberDetailDto::name))
                .toList();

        MyTeamResponse response = new MyTeamResponse(
                team.getId(),
                team.getName(),
                team.getJoinCode(),
                team.getStatus(),
                team.isShortlisted(),
                leaderId,
                team.getCreatedAt(),
                memberDtos
        );

        return ResponseEntity.ok(response);
    }

    private static String deriveInitials(String fullName) {
        if (fullName == null || fullName.isBlank()) return "??";
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        }
        return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
    }
}
