package my.monash.hackathon.hackathon_website_backend.notification;

import org.springframework.data.jpa.repository.JpaRepository;

/** No derived queries yet — none are needed to prove the mapping. */
public interface NotificationLogRepository extends JpaRepository<NotificationLog, Long> {}
