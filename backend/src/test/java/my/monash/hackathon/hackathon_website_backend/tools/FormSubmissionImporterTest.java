package my.monash.hackathon.hackathon_website_backend.tools;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class FormSubmissionImporterTest {

    @Test
    void extractDataMapsAllTenFields() {
        Map<String, String> raw = Map.of(
                "timestamp", "2026/08/21 12:00:00 AM",
                "team name", "Binary Beasts",
                "team representative full name", "Zaid Ahmed",
                "team representative whatsapp / phone number", "+60111222333",
                "team representative email address", "zaid@monash.edu",
                "project name", "AI Sustainability Tracker",
                "project description / summary", "Real-time AI carbon accounting",
                "github repository url", "https://github.com/monash/tracker",
                "live prototype / demo url", "https://tracker-demo.app",
                "slide deck / documentation url", "https://docs.google.com/presentation/d/123"
        );
        java.util.Map<String, String> normalised = new java.util.HashMap<>();
        raw.forEach((k, v) -> normalised.put(CsvReader.normalise(k), v));
        normalised.put(CsvReader.normalise("video demo url (5 minutes maximum)"), "https://youtube.com/watch?v=demo");

        CsvReader.Row row = new CsvReader.Row(1, normalised);

        FormSubmissionImporter.SubmissionData data = FormSubmissionImporter.extractData(row);

        assertEquals("Binary Beasts", data.teamName());
        assertEquals("Zaid Ahmed", data.representativeName());
        assertEquals("+60111222333", data.representativePhone());
        assertEquals("zaid@monash.edu", data.representativeEmail());
        assertEquals("AI Sustainability Tracker", data.projectTitle());
        assertEquals("Real-time AI carbon accounting", data.description());
        assertEquals("https://github.com/monash/tracker", data.githubUrl());
        assertEquals("https://tracker-demo.app", data.deployedUrl());
        assertEquals("https://docs.google.com/presentation/d/123", data.slideDeckUrl());
        assertEquals("https://youtube.com/watch?v=demo", data.videoDemoUrl());
        assertNotNull(data.submittedAt());
    }
}
