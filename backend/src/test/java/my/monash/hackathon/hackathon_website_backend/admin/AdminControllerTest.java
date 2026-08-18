package my.monash.hackathon.hackathon_website_backend.admin;

import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminOverviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminStatsDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminTeamDto;
import my.monash.hackathon.hackathon_website_backend.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminControllerTest {

    private AdminBackendService adminService;
    private MockMvc mockMvc;
    private User adminUser;

    @BeforeEach
    void setUp() {
        adminService = mock(AdminBackendService.class);
        adminUser = new User("sub-admin", "admin@example.com", "Admin User");
        adminUser.setRole("admin");

        AdminController controller = new AdminController(adminService);
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
                        return adminUser;
                    }
                })
                .build();
    }

    @Test
    void getOverviewReturnsStats() throws Exception {
        var stats = new AdminStatsDto(
                5, 12, 3, 1, 1, 9, 9, 100, 0, 5, 3, 0
        );
        when(adminService.getOverview()).thenReturn(new AdminOverviewDto(stats, List.of()));

        mockMvc.perform(get("/api/admin/overview"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stats.teams").value(5))
                .andExpect(jsonPath("$.stats.participants").value(12))
                .andExpect(jsonPath("$.stats.percentJudged").value(100));
    }

    @Test
    void getTeamsReturnsTeamList() throws Exception {
        var teamDto = new AdminTeamDto(
                1L, "ByteBuilders", "complete", true, 4,
                "submitted", "Project AI", "AI Track",
                3, 3, List.of(), "https://github.com/test", "https://app.test", null
        );
        when(adminService.getTeams()).thenReturn(List.of(teamDto));

        mockMvc.perform(get("/api/admin/teams"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamId").value(1))
                .andExpect(jsonPath("$[0].teamName").value("ByteBuilders"))
                .andExpect(jsonPath("$[0].status").value("complete"));
    }

    @Test
    void updateTeamSucceeds() throws Exception {
        var updated = new AdminTeamDto(
                1L, "ByteBuilders Renamed", "complete", true, 4,
                "submitted", "Project AI", "AI Track",
                3, 3, List.of(), "https://github.com/test", "https://app.test", null
        );
        when(adminService.updateTeam(eq(1L), any(), any())).thenReturn(updated);

        mockMvc.perform(patch("/api/admin/teams/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"teamName\":\"ByteBuilders Renamed\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.teamName").value("ByteBuilders Renamed"));
    }

    @Test
    void promoteAndDemoteJudge() throws Exception {
        mockMvc.perform(post("/api/admin/judges/5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        mockMvc.perform(delete("/api/admin/judges/5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }
}
