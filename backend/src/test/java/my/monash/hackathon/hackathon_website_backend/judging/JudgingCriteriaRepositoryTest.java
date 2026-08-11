package my.monash.hackathon.hackathon_website_backend.judging;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class JudgingCriteriaRepositoryTest {

    @Autowired private TestEntityManager entityManager;

    @Autowired private JudgingCriteriaRepository judgingCriteriaRepository;

    @Test
    void databaseGeneratesTheIdAndPopulatesCreatedAt() {
        JudgingCriteria criteria = new JudgingCriteria("Innovation", new BigDecimal("10.00"));
        assertThat(criteria.getId()).as("id must not be assigned by Java").isNull();
        assertThat(criteria.getCreatedAt()).as("created_at is the database's to set").isNull();

        JudgingCriteria saved = judgingCriteriaRepository.save(criteria);
        entityManager.flush();
        entityManager.clear();

        JudgingCriteria found = judgingCriteriaRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getId()).isNotNull();
        assertThat(found.getCreatedAt())
                .as("created_at is populated by DEFAULT now(), read back after insert")
                .isNotNull();
        assertThat(found.getTitle()).isEqualTo("Innovation");
        assertThat(found.getMaxScore()).isEqualByComparingTo("10.00");
        assertThat(found.getWeight()).as("V1 DEFAULT 1.00").isEqualByComparingTo("1.00");
        assertThat(found.getDisplayOrder()).as("V1 DEFAULT 0").isZero();
        assertThat(found.getIsActive()).as("V1 DEFAULT true").isTrue();
    }

    /** numeric(5,2), so a fractional weight survives the round trip exactly. */
    @Test
    void keepsDecimalPrecisionOnWeights() {
        JudgingCriteria criteria = new JudgingCriteria("Impact", new BigDecimal("25.50"));
        criteria.setWeight(new BigDecimal("1.25"));
        JudgingCriteria saved = judgingCriteriaRepository.saveAndFlush(criteria);
        entityManager.clear();

        JudgingCriteria found = judgingCriteriaRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getMaxScore()).isEqualByComparingTo("25.50");
        assertThat(found.getWeight()).isEqualByComparingTo("1.25");
    }

    @Test
    void findsOnlyActiveCriteriaInDisplayOrder() {
        judgingCriteriaRepository.save(orderedCriteria("Third Thing", 30, true));
        judgingCriteriaRepository.save(orderedCriteria("First Thing", 10, true));
        judgingCriteriaRepository.save(orderedCriteria("Retired Thing", 20, false));
        entityManager.flush();
        entityManager.clear();

        List<JudgingCriteria> active =
                judgingCriteriaRepository.findByIsActiveTrueOrderByDisplayOrder();

        assertThat(active).extracting(JudgingCriteria::getTitle)
                .containsExactly("First Thing", "Third Thing");
    }

    private static JudgingCriteria orderedCriteria(String title, int order, boolean active) {
        JudgingCriteria criteria = new JudgingCriteria(title, new BigDecimal("10.00"));
        criteria.setDisplayOrder(order);
        criteria.setIsActive(active);
        return criteria;
    }
}
