package my.monash.hackathon.hackathon_website_backend.submission;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import my.monash.hackathon.hackathon_website_backend.team.Team;
import my.monash.hackathon.hackathon_website_backend.team.TeamMember;
import my.monash.hackathon.hackathon_website_backend.team.TeamMemberRepository;
import my.monash.hackathon.hackathon_website_backend.webhook.SubmissionImportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.lang.reflect.Field;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SubmissionControllerTest {

    private SubmissionRepository submissionRepository;
    private UserRepository userRepository;
    private TeamMemberRepository teamMemberRepository;
    private my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository assignmentRepository;
    private my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository eventSettingsRepository;
    private SubmissionImportService submissionImportService;
    private SubmissionController controller;
    private User currentUser;

    @BeforeEach
    void setUp() {
        submissionRepository = mock(SubmissionRepository.class);
        userRepository = mock(UserRepository.class);
        teamMemberRepository = mock(TeamMemberRepository.class);
        assignmentRepository = mock(my.monash.hackathon.hackathon_website_backend.judging.AssignmentRepository.class);
        eventSettingsRepository = mock(my.monash.hackathon.hackathon_website_backend.event.EventSettingsRepository.class);
        submissionImportService = mock(SubmissionImportService.class);
        controller = new SubmissionController(
                submissionRepository,
                userRepository,
                teamMemberRepository,
                assignmentRepository,
                eventSettingsRepository,
                submissionImportService
        );
        currentUser = null;
    }

    private MockMvc buildMockMvc() {
        return MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType().equals(User.class);
                    }

                    @Override
                    public Object resolveArgument(MethodParameter parameter,
                                                  ModelAndViewContainer mavContainer,
                                                  NativeWebRequest webRequest,
                                                  WebDataBinderFactory binderFactory) {
                        return currentUser;
                    }
                })
                .build();
    }

    @Test
    void getMySubmissionUnauthorizedWhenNoAuth() throws Exception {
        currentUser = null;
        buildMockMvc().perform(get("/api/submissions/my"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getMySubmissionNoContentWhenUserHasNoTeam() throws Exception {
        User user = new User("user@example.com", "User One", "participant");
        setId(user, 10L);
        currentUser = user;

        when(teamMemberRepository.findById(10L)).thenReturn(Optional.empty());

        buildMockMvc().perform(get("/api/submissions/my"))
                .andExpect(status().isNoContent());
    }

    @Test
    void getMySubmissionReturnsDetailsWhenSubmitted() throws Exception {
        User user = new User("user@example.com", "User One", "participant");
        setId(user, 10L);
        currentUser = user;

        Team team = new Team("Super Team", "JOIN1234", user);
        setId(team, 100L);

        TeamMember member = new TeamMember(user, team);
        setField(member, "userId", 10L);

        Submission submission = new Submission(team, "EcoTrack");
        submission.setDescription("An eco friendly application");
        submission.setGithubUrl("https://github.com/monash/ecotrack");
        submission.setDeployedUrl("https://ecotrack.app");
        submission.setSlideDeckUrl("https://docs.google.com/presentation/d/xyz");
        submission.setVideoDemoUrl("https://youtube.com/watch?v=12345");
        submission.setRepresentativeName("Alice Smith");
        submission.setRepresentativePhone("+60123456789");
        submission.setRepresentativeEmail("alice@example.com");
        submission.setTrackLabel("Sustainability");
        submission.setStatus("submitted");
        submission.setSubmittedAt(OffsetDateTime.now());

        when(teamMemberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(submissionRepository.findByTeamId(100L)).thenReturn(Optional.of(submission));

        buildMockMvc().perform(get("/api/submissions/my"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projectTitle").value("EcoTrack"))
                .andExpect(jsonPath("$.githubUrl").value("https://github.com/monash/ecotrack"))
                .andExpect(jsonPath("$.deployedUrl").value("https://ecotrack.app"))
                .andExpect(jsonPath("$.slideDeckUrl").value("https://docs.google.com/presentation/d/xyz"))
                .andExpect(jsonPath("$.videoDemoUrl").value("https://youtube.com/watch?v=12345"))
                .andExpect(jsonPath("$.representativeName").value("Alice Smith"))
                .andExpect(jsonPath("$.trackLabel").value("Sustainability"))
                .andExpect(jsonPath("$.status").value("submitted"));
    }

    private static void setId(Object entity, Long id) throws Exception {
        Field idField = entity.getClass().getDeclaredField("id");
        idField.setAccessible(true);
        idField.set(entity, id);
    }

    private static void setField(Object entity, String fieldName, Object value) throws Exception {
        Field field = entity.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(entity, value);
    }
}
