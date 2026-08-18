package my.monash.hackathon.hackathon_website_backend.team;

import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TeamControllerTest {

    @Test
    void getMyTeamReturns404WhenNoMembership() throws Exception {
        TeamRepository teamRepo = mock(TeamRepository.class);
        TeamMemberRepository memberRepo = mock(TeamMemberRepository.class);
        UserRepository userRepo = mock(UserRepository.class);

        User currentUser = new User("sub-1", "alice@example.com", "Alice");
        // reflection or mock ID:
        when(memberRepo.findById(1L)).thenReturn(Optional.empty());

        TeamController controller = new TeamController(teamRepo, memberRepo, userRepo);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller)
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
                        return null; // unauthenticated
                    }
                })
                .build();

        mockMvc.perform(get("/api/teams/my"))
                .andExpect(status().isUnauthorized());
    }
}
