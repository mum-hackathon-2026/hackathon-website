package my.monash.hackathon.hackathon_website_backend.result;

import my.monash.hackathon.hackathon_website_backend.event.EventSettings;
import my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Assignment;
import my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository;
import my.monash.hackathon.hackathon_website_backend.judging.JudgingCriteria;
import my.monash.hackathon.hackathon_website_backend.judging.JudgingCriteriaRepository;
import my.monash.hackathon.hackathon_website_backend.judging.Score;
import my.monash.hackathon.hackathon_website_backend.judging.ScoreRepository;
import my.monash.hackathon.hackathon_website_backend.result.dto.MyDetailedResultDto;
import my.monash.hackathon.hackathon_website_backend.result.dto.PublicTeamResultDto;
import my.monash.hackathon.hackathon_website_backend.submission.Submission;
import my.monash.hackathon.hackathon_website_backend.submission.SubmissionRepository;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamMember;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResultControllerTest {

    @Mock
    private TeamResultRepository teamResultRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private EventSettingsRepository eventSettingsRepository;
    @Mock
    private TeamMemberRepository teamMemberRepository;
    @Mock
    private AssignmentRepository assignmentRepository;
    @Mock
    private ScoreRepository scoreRepository;
    @Mock
    private JudgingCriteriaRepository judgingCriteriaRepository;

    private ResultController controller;

    @BeforeEach
    void setUp() {
        controller = new ResultController(
                teamResultRepository,
                submissionRepository,
                eventSettingsRepository,
                teamMemberRepository,
                assignmentRepository,
                scoreRepository,
                judgingCriteriaRepository
        );
    }

    @Test
    void getPublicResults_returnsEmpty_whenNotPublished() {
        when(eventSettingsRepository.findSingleton()).thenReturn(Optional.empty());

        ResponseEntity<List<PublicTeamResultDto>> response = controller.getPublicResults();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEmpty();
    }

    @Test
    void getPublicResults_returnsResults_whenPublished() {
        EventSettings settings = new EventSettings("Monash Hackathon");
        settings.setResultsPublishedAt(OffsetDateTime.now());
        when(eventSettingsRepository.findSingleton()).thenReturn(Optional.of(settings));

        User user = new User("leader@example.com", "Leader", "participant");
        ReflectionTestUtils.setField(user, "id", 1L);
        Team team = new Team("Team Alpha", "ALPHA1", user);
        ReflectionTestUtils.setField(team, "id", 101L);

        TeamResult tr = new TeamResult(team);
        ReflectionTestUtils.setField(tr, "teamId", 101L);
        tr.setFinalScore(new BigDecimal("88.50"));
        tr.setRank(1);
        tr.setOutcome("winner");
        tr.setJudgeCount(3);
        tr.setPublishedAt(OffsetDateTime.now());

        Submission sub = new Submission(team, "Alpha App");
        ReflectionTestUtils.setField(sub, "teamId", 101L);
        sub.setTrackLabel("Open Innovation");

        when(teamResultRepository.findAll()).thenReturn(List.of(tr));
        when(submissionRepository.findAll()).thenReturn(List.of(sub));

        ResponseEntity<List<PublicTeamResultDto>> response = controller.getPublicResults(null);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).hasSize(1);
        PublicTeamResultDto item = response.getBody().get(0);
        assertThat(item.teamName()).isEqualTo("Team Alpha");
        assertThat(item.projectTitle()).isEqualTo("Alpha App");
        assertThat(item.rank()).isEqualTo(1);
        assertThat(item.finalScore()).isEqualTo(new BigDecimal("88.50"));
    }

    @Test
    void getMyDetailedResult_returnsNoContent_whenNotPublished() {
        User user = new User("p@example.com", "P User", "participant");
        ReflectionTestUtils.setField(user, "id", 1L);

        when(eventSettingsRepository.findSingleton()).thenReturn(Optional.empty());

        ResponseEntity<MyDetailedResultDto> response = controller.getMyDetailedResult(user);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }
}
