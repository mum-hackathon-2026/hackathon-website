package my.monash.hackathon.hackathon_website_backend.auth;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Central security configuration.
 *
 * <p>Authentication is stateless JWT — no HTTP session, no CSRF token.
 * The Angular frontend at {@code localhost:4200} is allowed via CORS.
 *
 * <p>This class also enables {@link JwtProperties} and
 * {@link GoogleAuthProperties} so they are bound from the active profile.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({
        JwtProperties.class,
        GoogleAuthProperties.class,
        my.monash.hackathon.hackathon_website_backend.webhook.WebhookProperties.class,
        my.monash.hackathon.hackathon_website_backend.webhook.SheetsProperties.class
})
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(org.springframework.security.config.Customizer.withDefaults())
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers("/api/event/**").permitAll()
                        .requestMatchers("/api/results").permitAll()
                        .requestMatchers("/api/webhooks/**", "/api/webhook/**").permitAll()
                        .requestMatchers("/api/admin/**").hasAuthority("admin")
                        .requestMatchers("/api/judge/**").hasAuthority("judge")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        var config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:4200",
                "http://localhost:8080",
                "https://monash-hackathon-2026.web.app",
                "https://*.web.app",
                "https://*.firebaseapp.com",
                "https://*.run.app",
                "https://*.monash.edu.my"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
