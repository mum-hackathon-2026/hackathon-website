package my.monash.hackathon.hackathon_website_backend.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import my.monash.hackathon.hackathon_website_backend.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Reads the {@code Authorization: Bearer <token>} header, validates the JWT,
 * loads the user from the database, and populates the Spring Security context.
 *
 * <p>If the header is absent, the token is invalid, or the token has been revoked
 * ({@link TokenRevocationService}) the filter silently continues — Spring Security
 * will reject the request later if the endpoint requires authentication.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final TokenRevocationService tokenRevocationService;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository,
                                    TokenRevocationService tokenRevocationService) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.tokenRevocationService = tokenRevocationService;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(BEARER_PREFIX.length());

        try {
            var claims = jwtService.validateToken(token);

            if (tokenRevocationService.isRevoked(claims.getId())) {
                filterChain.doFilter(request, response);
                return;
            }

            Long userId = Long.parseLong(claims.getSubject());
            var userOpt = userRepository.findById(userId);

            if (userOpt.isPresent()) {
                var user = userOpt.get();
                var authorities = List.of(new SimpleGrantedAuthority(user.getRole()));
                var authentication = new UsernamePasswordAuthenticationToken(
                        user, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        } catch (Exception e) {
            log.debug("JWT validation failed: {}", e.getMessage());
            // SecurityContext stays empty — the request will be rejected downstream
        }

        filterChain.doFilter(request, response);
    }
}
