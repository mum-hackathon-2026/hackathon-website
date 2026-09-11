package my.monash.hackathon.hackathon_website_backend.admin;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface TombstonedRegistrationRepository extends JpaRepository<TombstonedRegistration, Long> {

    @Query("select count(t) > 0 from TombstonedRegistration t where lower(trim(t.teamName)) = lower(trim(:teamName))")
    boolean existsByTeamNameIgnoreCase(@Param("teamName") String teamName);

    @Query("select count(t) > 0 from TombstonedRegistration t where lower(trim(t.email)) = lower(trim(:email))")
    boolean existsByEmailIgnoreCase(@Param("email") String email);

    @Query("select count(t) > 0 from TombstonedRegistration t where lower(trim(t.teamName)) = lower(trim(:teamName)) or lower(trim(t.email)) in :emails")
    boolean existsByTeamNameOrEmailIn(@Param("teamName") String teamName, @Param("emails") Collection<String> emails);
}
