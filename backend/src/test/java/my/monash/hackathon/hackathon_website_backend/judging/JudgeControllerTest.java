package my.monash.hackathon.hackathon_website_backend.judging;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import my.monash.hackathon.hackathon_website_backend.judging.dto.CriterionScoreResponse;
import my.monash.hackathon.hackathon_website_backend.judging.dto.JudgeAssignmentResponse;
import my.monash.hackathon.hackathon_website_backend.judging.dto.JudgingCriterionDto;
import my.monash.hackathon.hackathon_website_backend.judging.dto.SaveReviewRequest;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class JudgeControllerTest {

    private JudgeBackendService judgeService;
    private MockMvc mockMvc;
    private User judgeUser;

    @BeforeEach
    void setUp() {
        judgeService = mock(JudgeBackendService.class);
        judgeUser = new User("sub-judge", "judge@example.com", "Dr. Judge");
        judgeUser.setRole("judge");

        JudgeController controller = new JudgeController(judgeService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(new org.springframework.web.method.support.HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(org.springframework.core.MethodParameter parameter) {
                        return parameter.getParameterType().equals(User.class);
                    }

                    @Override
                    public Object resolveArgument(org.springframework.core.MethodParameter parameter,
                                                  org.springframework.web.method.support.ModelAndViewContainer mavContainer,
                                                  org.springframework.web.context.request.NativeWebRequest webRequest,
                                                  org.springframework.web.bind.support.WebDataBinderFactory binderFactory) {
                        return judgeUser;
                    }
                })
                .build();
    }

    @Test
    void getAssignmentsReturnsList() throws Exception {
        var resp = new JudgeAssignmentResponse(
                1L, 101L, "ByteCraft", "AI Smart Tutor", "AI Track", "A smart tutor project",
                "https://github.com/test/repo", "https://demo.com", "", "", 3, "pending",
                OffsetDateTime.now(), null, "", List.of()
        );
        when(judgeService.getAssignmentsForJudge(any())).thenReturn(List.of(resp));

        mockMvc.perform(get("/api/judge/assignments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].teamName").value("ByteCraft"))
                .andExpect(jsonPath("$[0].projectTitle").value("AI Smart Tutor"));
    }

    @Test
    void getCriteriaReturnsActiveList() throws Exception {
        var criterion = new JudgingCriterionDto(
                1L, "Innovation", "How novel is the approach", new BigDecimal("10.00"), new BigDecimal("25.00"), 1, true
        );
        when(judgeService.getActiveCriteria()).thenReturn(List.of(criterion));

        mockMvc.perform(get("/api/judge/criteria"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].title").value("Innovation"))
                .andExpect(jsonPath("$[0].maxScore").value(10.00));
    }

    @Test
    void saveDraftReturnsUpdatedAssignment() throws Exception {
        var scoreResp = new CriterionScoreResponse(
                1L, "Innovation", new BigDecimal("10.00"), new BigDecimal("25.00"),
                new BigDecimal("8.50"), "Great idea", new BigDecimal("10.00"), new BigDecimal("25.00")
        );
        var resp = new JudgeAssignmentResponse(
                1L, 101L, "ByteCraft", "AI Smart Tutor", "AI Track", "A smart tutor project",
                "https://github.com/test/repo", "https://demo.com", "", "", 3, "in_progress",
                OffsetDateTime.now(), null, "Good draft", List.of(scoreResp)
        );
        when(judgeService.saveDraft(eq(1L), any(SaveReviewRequest.class), any())).thenReturn(resp);

        mockMvc.perform(post("/api/judge/assignments/1/draft")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scores\":[{\"criteriaId\":1,\"score\":8.5,\"comment\":\"Great idea\"}],\"overallFeedback\":\"Good draft\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("in_progress"))
                .andExpect(jsonPath("$.overallFeedback").value("Good draft"))
                .andExpect(jsonPath("$.scores[0].score").value(8.5));
    }

    @Test
    void completeReviewReturnsCompletedAssignment() throws Exception {
        var scoreResp = new CriterionScoreResponse(
                1L, "Innovation", new BigDecimal("10.00"), new BigDecimal("25.00"),
                new BigDecimal("9.00"), "Outstanding", new BigDecimal("10.00"), new BigDecimal("25.00")
        );
        var resp = new JudgeAssignmentResponse(
                1L, 101L, "ByteCraft", "AI Smart Tutor", "AI Track", "A smart tutor project",
                "https://github.com/test/repo", "https://demo.com", "", "", 3, "completed",
                OffsetDateTime.now(), OffsetDateTime.now(), "Finalized review", List.of(scoreResp)
        );
        when(judgeService.completeReview(eq(1L), any(SaveReviewRequest.class), any())).thenReturn(resp);

        mockMvc.perform(post("/api/judge/assignments/1/complete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scores\":[{\"criteriaId\":1,\"score\":9.0,\"comment\":\"Outstanding\"}],\"overallFeedback\":\"Finalized review\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.overallFeedback").value("Finalized review"));
    }

    @Test
    void declineAssignmentReturnsOk() throws Exception {
        mockMvc.perform(post("/api/judge/assignments/1/decline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }
}
