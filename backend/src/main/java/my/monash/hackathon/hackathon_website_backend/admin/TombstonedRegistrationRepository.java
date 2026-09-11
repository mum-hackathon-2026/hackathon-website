package my.monash.hackathon.hackathon_website_backend.admin;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface TombstonedRegistrationRepository extends JpaRepository<TombstonedRegistration, Long> {

    @Query("select count(t) > 0 from TombstonedRegistration t where lower(trim(t.teamName)) = lower(trim(:teamName)) and (t.memberEmails = :memberEmails or t.memberEmails is null or t.memberEmails = '')")
    boolean existsByTeamNameAndMemberEmails(@Param("teamName") String teamName, @Param("memberEmails") String memberEmails);
}
