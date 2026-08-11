package my.monash.hackathon.hackathon_website_backend.audit;

import org.springframework.data.jpa.repository.JpaRepository;

/** No derived queries yet — none are needed to prove the mapping. */
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {}
