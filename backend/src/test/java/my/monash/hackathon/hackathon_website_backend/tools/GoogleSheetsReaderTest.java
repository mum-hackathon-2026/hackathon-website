package my.monash.hackathon.hackathon_website_backend.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class GoogleSheetsReaderTest {

    @TempDir private Path tempDir;

    @Test
    void sheetModeParsesStubbedApiResponseCorrectly() {
        List<Object> header = List.of(
                "Timestamp",
                "Your Full Name",
                "Your Email Address",
                "Phone",
                "Team Name",
                "Member 1: Full Name (First & Family Name)",
                "Member 1: Email Address",
                "Member 1: Phone / WhatsApp Number",
                "Member 1: Resume / CV (PDF)",
                "Member 1: LinkedIn Profile URL",
                "Member 1: GitHub Profile URL",
                "Do you want to add another team member?",
                "Member 2: Full Name (First & Family Name)",
                "Member 2: Email Address",
                "Member 2: Phone / WhatsApp Number",
                "Member 2: Resume / CV (PDF)",
                "Member 2: LinkedIn Profile URL",
                "Member 2: GitHub Profile URL"
        );

        List<Object> dataRow = List.of(
                "2026/08/01 9:00:00 AM GMT+8",
                "Contact Name",
                "contact@example.com",
                60111111111L,
                "Binary Beasts",
                "Leader One",
                "leader@example.com",
                6.0148422243E10,
                "https://drive.google.com/file/d/leader/view",
                "https://www.linkedin.com/in/leader",
                "https://github.com/leader",
                "Yes",
                "Second Member",
                "second@example.com",
                60198765432L,
                "https://drive.google.com/file/d/second/view",
                "https://www.linkedin.com/in/second",
                "https://github.com/second"
        );

        List<List<Object>> rawValues = List.of(header, dataRow);
        CsvReader.Sheet sheet = GoogleSheetsReader.parseValues(rawValues);

        assertThat(sheet.rows()).hasSize(1);
        CsvReader.Row row = sheet.rows().getFirst();
        assertThat(row.lineNumber()).isEqualTo(2);

        TeamRow team = TeamRow.from(row, LIMITS);
        assertThat(team.teamName()).isEqualTo("Binary Beasts");
        assertThat(team.members()).hasSize(2);

        TeamRow.Member leader = team.leader();
        assertThat(leader.fullName()).isEqualTo("Leader One");
        assertThat(leader.email()).isEqualTo("leader@example.com");
        assertThat(leader.phone()).isEqualTo("60148422243");
        assertThat(leader.resumeUrl()).isEqualTo("https://drive.google.com/file/d/leader/view");
        assertThat(leader.linkedinUrl()).isEqualTo("https://www.linkedin.com/in/leader");
        assertThat(leader.githubUrl()).isEqualTo("https://github.com/leader");

        TeamRow.Member member2 = team.members().get(1);
        assertThat(member2.fullName()).isEqualTo("Second Member");
        assertThat(member2.email()).isEqualTo("second@example.com");
        assertThat(member2.phone()).isEqualTo("60198765432");
    }

    @Test
    void numericPhoneConversion() {
        // Long / integer
        assertThat(GoogleSheetsReader.formatCellValue(60148422243L)).isEqualTo("60148422243");

        // Double from scientific notation in JSON API response
        assertThat(GoogleSheetsReader.formatCellValue(6.0148422243E10)).isEqualTo("60148422243");

        // Double with trailing .0
        assertThat(GoogleSheetsReader.formatCellValue(60148422243.0)).isEqualTo("60148422243");

        // String representation of scientific notation
        assertThat(GoogleSheetsReader.formatCellValue("6.0148422243E10")).isEqualTo("60148422243");
        assertThat(GoogleSheetsReader.formatCellValue("6.0148422243e+10")).isEqualTo("60148422243");

        // Regular phone strings with + or dashes stay untouched
        assertThat(GoogleSheetsReader.formatCellValue("+60 12-345 6789")).isEqualTo("+60 12-345 6789");
        assertThat(GoogleSheetsReader.formatCellValue(null)).isEmpty();
    }

    /** The live limits, so these parse tests exercise the same shape the importer does. */
    private static final TeamRow.SizeLimits LIMITS = new TeamRow.SizeLimits(2, 5);

    @Test
    void unknownColumnsAreIgnoredSilently() {
        List<Object> header = List.of(
                "Timestamp",
                "Your Full Name",
                "Your Email Address",
                "Phone",
                "Gender",
                "Institute",
                "Team Name",
                "Member 1: Full Name (First & Family Name)",
                "Member 1: Email Address",
                "Member 1: Phone / WhatsApp Number",
                "Member 1: Resume / CV (PDF)",
                "Member 1: LinkedIn Profile URL",
                "Member 1: GitHub Profile URL",
                "Do you want to add another team member?",
                "Member 1: University",
                "Member 1: Major",
                "Member 1: Year of Study",
                "Member 1: Semester",
                "Member 1: Dietary Restrictions",
                "Do you want to add another team member?",
                "Member 2: Full Name (First & Family Name)",
                "Member 2: Email Address",
                "Member 2: Phone / WhatsApp Number",
                "Member 2: Resume / CV (PDF)",
                "Member 2: LinkedIn Profile URL",
                "Member 2: GitHub Profile URL",
                "Do you want to add another team member?"
        );

        List<Object> dataRow = new ArrayList<>(List.of(
                "2026/08/01 9:00:00 AM GMT+8",
                "Primary Contact",
                "primary@example.com",
                "+60 11-111 1111",
                "Male",
                "Monash",
                "Pair Squad",
                "Real Leader",
                "leader@example.com",
                "+60 12-000 0000",
                "https://drive.google.com/file/d/leader/view",
                "https://www.linkedin.com/in/leader",
                "https://github.com/leader",
                "No",
                "Monash University",
                "Computer Science",
                "Year 2",
                "Semester 1",
                "None",
                "No",
                "Second Member",
                "second@example.com",
                "+60 12-000 0001",
                "https://drive.google.com/file/d/second/view",
                "https://www.linkedin.com/in/second",
                "https://github.com/second",
                "No"
        ));

        CsvReader.Sheet sheet = GoogleSheetsReader.parseValues(List.of(header, dataRow));
        assertThat(sheet.rows()).hasSize(1);

        TeamRow team = TeamRow.from(sheet.rows().getFirst(), LIMITS);
        assertThat(team.teamName()).isEqualTo("Pair Squad");
        assertThat(team.members()).hasSize(2);
        assertThat(team.leader().fullName()).isEqualTo("Real Leader");
        assertThat(team.leader().phone()).isEqualTo("+60 12-000 0000");
    }

    @Test
    void missingCredentialsThrowsSheetsException() {
        Path missingPath = tempDir.resolve("non-existent-key.json");

        assertThatThrownBy(() -> GoogleSheetsReader.read("sheet-123", "Form responses 1", missingPath))
                .isInstanceOf(GoogleSheetsReader.SheetsException.class)
                .hasMessageContaining("Credentials missing");
    }

    @Test
    void invalidCredentialsThrowsSheetsException() throws IOException {
        Path invalidKey = tempDir.resolve("bad-key.json");
        Files.writeString(invalidKey, "{ \"invalid\": true }");

        assertThatThrownBy(() -> GoogleSheetsReader.read("sheet-123", "Form responses 1", invalidKey))
                .isInstanceOf(GoogleSheetsReader.SheetsException.class)
                .hasMessageContaining("Credentials invalid");
    }
}
