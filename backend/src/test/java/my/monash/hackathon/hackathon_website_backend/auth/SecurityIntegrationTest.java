package my.monash.hackathon.hackathon_website_backend.auth;

import my.monash.hackathon.hackathon_website_backend.admin.AdminBackendService;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminOverviewDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.AdminStatsDto;
import my.monash.hackathon.hackathon_website_backend.admin.dto.EventSettingsDto;
import my.monash.hackathon.hackathon_website_backend.user.User;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class SecurityIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtService jwtService;

    /** Same key JwtService signs with, so a test can mint a jti-less legacy token. */
    @org.springframework.beans.factory.annotation.Value("${app.jwt.secret}")
    private String jwtSecret;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private AdminBackendService adminService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
    }

    @Test
    void devLoginEndpointIsStrictlyDeleted() throws Exception {
        var result = mockMvc.perform(post("/api/auth/dev-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"admin\"}"))
                .andReturn();

        // Must never return 200 or return any JWT token payload
        org.assertj.core.api.Assertions.assertThat(result.getResponse().getStatus()).isNotEqualTo(200);
        org.assertj.core.api.Assertions.assertThat(result.getResponse().getContentAsString()).doesNotContain("token");
    }

    @Test
    void adminEndpointsRejectUnauthenticatedCallers() throws Exception {
        mockMvc.perform(get("/api/admin/overview"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminEndpointsRejectParticipantToken() throws Exception {
        User participant = new User("sub-part", "participant@example.com", "Participant Person");
        participant.setRole("participant");
        setUserId(participant, 101L);

        when(userRepository.findById(101L)).thenReturn(Optional.of(participant));

        String token = jwtService.generateToken(participant);

        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminEndpointsRejectJudgeToken() throws Exception {
        User judge = new User("sub-judge", "judge@example.com", "Judge Person");
        judge.setRole("judge");
        setUserId(judge, 202L);

        when(userRepository.findById(202L)).thenReturn(Optional.of(judge));

        String token = jwtService.generateToken(judge);

        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminEndpointsAllowAdminToken() throws Exception {
        User admin = new User("sub-admin", "admin@example.com", "Admin Person");
        admin.setRole("admin");
        setUserId(admin, 303L);

        when(userRepository.findById(303L)).thenReturn(Optional.of(admin));
        when(adminService.getOverview()).thenReturn(new AdminOverviewDto(
                new AdminStatsDto(1, 1, 0, 0, 0, 1, 1, 100, 0, 1, 1, 0),
                List.of()
        ));

        String token = jwtService.generateToken(admin);

        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    // A copied token must stop working the moment its owner signs out, rather than
    // drifting on until its natural exp — see TokenRevocationService.
    @Test
    void logoutRevokesTheTokenSoItCanNoLongerAuthenticate() throws Exception {
        User admin = new User("sub-admin", "admin@example.com", "Admin Person");
        admin.setRole("admin");
        setUserId(admin, 404L);

        when(userRepository.findById(404L)).thenReturn(Optional.of(admin));
        when(adminService.getOverview()).thenReturn(new AdminOverviewDto(
                new AdminStatsDto(1, 1, 0, 0, 0, 1, 1, 100, 0, 1, 1, 0),
                List.of()
        ));

        String token = jwtService.generateToken(admin);

        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/logout")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    /*
     * A token with no jti predates server-side revocation, so logout can never revoke
     * it. Honouring one would leave a stolen pre-deploy token working for the rest of
     * its 24h life with no way to take it away, so the filter fails closed instead.
     */
    @Test
    void aTokenWithoutAJtiIsRejected() throws Exception {
        User admin = new User("sub-admin", "admin@example.com", "Admin Person");
        admin.setRole("admin");
        setUserId(admin, 505L);

        when(userRepository.findById(505L)).thenReturn(Optional.of(admin));

        // Minted the way tokens were before the jti was introduced.
        String legacyToken = io.jsonwebtoken.Jwts.builder()
                .subject("505")
                .claim("email", admin.getEmail())
                .claim("role", admin.getRole())
                .claim("name", admin.getFullName())
                .issuedAt(new java.util.Date())
                .expiration(new java.util.Date(System.currentTimeMillis() + 3600_000))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                        jwtSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .compact();

        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer " + legacyToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void logoutWithNoBearerTokenIsANoOp() throws Exception {
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isNoContent());
    }

    @Test
    void logoutWithAnAlreadyInvalidTokenIsANoOp() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                        .header("Authorization", "Bearer invalid.token.payload"))
                .andExpect(status().isNoContent());
    }

    @Test
    void judgeEndpointsRejectParticipantToken() throws Exception {
        User participant = new User("sub-part", "participant@example.com", "Participant Person");
        participant.setRole("participant");
        setUserId(participant, 101L);

        when(userRepository.findById(101L)).thenReturn(Optional.of(participant));

        String token = jwtService.generateToken(participant);

        mockMvc.perform(get("/api/judge/assignments")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidOrTamperedJwtIsRejected() throws Exception {
        mockMvc.perform(get("/api/admin/overview")
                        .header("Authorization", "Bearer invalid.token.payload"))
                .andExpect(status().isForbidden());
    }

    @Test
    void publicEndpointsAreAccessibleWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/api/event/settings"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/results"))
                .andExpect(status().isOk());
    }

    /*
     * /api/event/settings is permitAll, so everything it returns is world readable.
     * updatedBy is the organiser who last edited the settings — a real person's name,
     * which an anonymous visitor has no reason to receive.
     */
    @Test
    void publicEventSettingsDoNotNameTheOrganiserWhoEditedThem() throws Exception {
        when(adminService.getSettings()).thenReturn(new EventSettingsDto(
                1L, "Averis Hackathon 2026", null, null, null, null,
                false, 2, 5, true, 3, "Shariq Nauman"));

        mockMvc.perform(get("/api/event/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventName").value("Averis Hackathon 2026"))
                .andExpect(jsonPath("$.updatedBy").doesNotExist());
    }

    @Test
    void signedInCallersStillSeeWhoUpdatedTheSettings() throws Exception {
        User participant = new User("sub-part", "participant@example.com", "Participant Person");
        participant.setRole("participant");
        setUserId(participant, 606L);

        when(userRepository.findById(606L)).thenReturn(Optional.of(participant));
        when(adminService.getSettings()).thenReturn(new EventSettingsDto(
                1L, "Averis Hackathon 2026", null, null, null, null,
                false, 2, 5, true, 3, "Shariq Nauman"));

        String token = jwtService.generateToken(participant);

        mockMvc.perform(get("/api/event/settings")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updatedBy").value("Shariq Nauman"));
    }

    @Test
    void corsAllowsLocalhost4200() throws Exception {
        mockMvc.perform(options("/api/event/settings")
                        .header(HttpHeaders.ORIGIN, "http://localhost:4200")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:4200"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }

    @Test
    void corsRejectsUntrustedSubdomainsAndWildcards() throws Exception {
        // Multi-tenant Google Run / Web App / Firebase subdomains must not be permitted
        mockMvc.perform(options("/api/event/settings")
                        .header(HttpHeaders.ORIGIN, "https://attacker.run.app")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));

        mockMvc.perform(options("/api/event/settings")
                        .header(HttpHeaders.ORIGIN, "https://evil.web.app")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));

        mockMvc.perform(options("/api/event/settings")
                        .header(HttpHeaders.ORIGIN, "https://phishing.firebaseapp.com")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));

        // Port 8080 (backend origin) should not be allowed CORS
        mockMvc.perform(options("/api/event/settings")
                        .header(HttpHeaders.ORIGIN, "http://localhost:8080")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void securityHeadersIncludeClickjackingAndContentTypeProtection() throws Exception {
        mockMvc.perform(get("/api/event/settings"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    private static void setUserId(User user, Long id) {
        try {
            var field = User.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(user, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
