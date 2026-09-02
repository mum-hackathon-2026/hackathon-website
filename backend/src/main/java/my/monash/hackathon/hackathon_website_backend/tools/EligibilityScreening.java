package my.monash.hackathon.hackathon_website_backend.tools;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * The checks that flag a registration for a human to decide, rather than importing it
 * unattended.
 *
 * <p>Every reason produced here is a judgement call or an almost-certain typo — a resume
 * link pasted into the LinkedIn box, a major that does not obviously match an IT course.
 * None of it used to be grounds to throw a team out on its own; now it is one of the ways a
 * team ends up in the admin review queue, alongside the purely structural problems
 * {@link TeamRow} finds (a missing email, a team of six). Both kinds are reported the same
 * way — a list of strings the importer writes to {@code registration_reviews.issues} — and
 * an admin decides from there.
 *
 * <p>A team is <strong>not written to {@code users}/{@code teams}/{@code team_members}</strong>
 * just because it was screened; only an admin's Approve action does that. A team still
 * sitting as {@code awaiting_review} or {@code needs_fix} is re-screened from the sheet on
 * every run, so correcting the spreadsheet refreshes what the admin sees without anyone
 * having to clear anything by hand — see {@code FormRegistrationImporter.toReview}.
 *
 * <p><strong>These checks are offline.</strong> Nothing here opens a network connection.
 * A URL is checked for its shape and its domain and nothing more — this class cannot tell
 * you that a LinkedIn profile exists, that a Drive link is shared with anyone, or that a
 * GitHub account belongs to the person who typed it. Do not read a clean run as evidence
 * that any link resolves.
 */
final class EligibilityScreening {

    // =====================================================================================
    // IT COURSE KEYWORDS - REVIEW THIS LIST BEFORE REGISTRATION OPENS.
    //
    // This is the only copy. A team passes the course check when AT LEAST ONE member's
    // major contains one of these terms; a team that matches none of them is held PENDING
    // for a human, never rejected, because this list cannot know every course name a
    // university offers and being absent from it is not evidence of anything.
    //
    // Matching ignores case, spacing and punctuation on both sides (see #normalise), so
    // "Cyber-Security" matches "cyber security" and "Computer Science in Data Science"
    // matches "computer science". It is a SUBSTRING match, so "information system" also
    // covers "Business Information Systems".
    //
    // Adding a term is cheap and safe; every term left out costs somebody a manual check.
    // Deliberately NOT here: "analytics" (would match Business Analytics), "technology"
    // (Food Technology, Biotechnology) and "it" (appears inside ordinary words such as
    // hospitality). Terms that broad turn the check into a rubber stamp.
    // =====================================================================================
    static final List<String> IT_COURSE_KEYWORDS = List.of(
            "computer science",
            "information technology",
            "information system",
            "information security",
            "computer engineering",
            "computer system",
            "computer application",
            "computing",
            "informatics",
            "software",
            "data science",
            "data engineering",
            "data analytics",
            "artificial intelligence",
            "machine learning",
            "cyber security",
            "digital forensics",
            "network engineering",
            "web development",
            "game development");

    /** The host a LinkedIn profile has to be on. Subdomains count: my.linkedin.com is fine. */
    private static final String LINKEDIN_DOMAIN = "linkedin.com";

    private static final String GITHUB_DOMAIN = "github.com";

    /** A resume is a Google Drive file or a Google Doc; the form asks for a Drive link. */
    private static final List<String> RESUME_DOMAINS =
            List.of("drive.google.com", "docs.google.com");

    private static final int MIN_PHONE_DIGITS = 8;
    private static final int MAX_PHONE_DIGITS = 15;

    /** Everything a person may legitimately type around the digits of a phone number. */
    private static final String PHONE_PUNCTUATION = "[\\s+()\\[\\]-]";

    private EligibilityScreening() {}

    /**
     * Every reason this team needs a human, in report order: the team-level course check
     * first, then each member in form order.
     *
     * <p>All of them, not the first — whoever chases this makes one phone call, not four.
     * An empty list means the team is clear to import.
     *
     * <p>A reason may contain newlines; the caller indents the continuation lines.
     */
    static List<String> screen(TeamRow team) {
        List<String> reasons = new ArrayList<>();
        itCourse(team).ifPresent(reasons::add);
        for (TeamRow.Member member : team.members()) {
            screenMember(member, reasons);
        }
        return List.copyOf(reasons);
    }

    /** The keyword list as one line, for the run header. */
    static String describeKeywords() {
        return String.join(", ", IT_COURSE_KEYWORDS);
    }

    /**
     * One member on an IT course is enough — teams are deliberately allowed to be mixed, and
     * a business student on a technical team is a feature of the event, not a problem.
     */
    private static Optional<String> itCourse(TeamRow team) {
        for (TeamRow.Member member : team.members()) {
            if (matchesItKeyword(member.major())) {
                return Optional.empty();
            }
        }
        // Every major verbatim, quoted, in member order. The human reading this is deciding
        // whether "Actuarial Science" counts this year, and they cannot decide that from a
        // count of how many members failed.
        String majors = team.members().stream()
                .map(member -> "\"" + member.major() + "\"")
                .collect(Collectors.joining(", "));
        return Optional.of("no clear IT-related course\n(majors: " + majors + ")");
    }

    static boolean matchesItKeyword(String major) {
        String normalisedMajor = normalise(major);
        if (normalisedMajor.isEmpty()) {
            return false;
        }
        for (String keyword : IT_COURSE_KEYWORDS) {
            if (normalisedMajor.contains(normalise(keyword))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Lowercased with every non-alphanumeric character removed, so spellings that mean the
     * same thing compare equal: "Cyber-Security", "cyber security" and "CyberSecurity" all
     * become "cybersecurity".
     */
    private static String normalise(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static void screenMember(TeamRow.Member member, List<String> reasons) {
        String who = "member " + member.block() + " (" + member.fullName() + ")";

        if (member.resumeUrl() == null) {
            reasons.add(who + " gave no resume link");
        } else {
            checkDomain(member.resumeUrl(), RESUME_DOMAINS, "the resume",
                    " - we expect a Google Drive or Google Docs link", who, reasons);
        }

        if (member.linkedinUrl() == null) {
            reasons.add(who + " gave no LinkedIn link");
        } else {
            checkDomain(member.linkedinUrl(), List.of(LINKEDIN_DOMAIN), "LinkedIn", "",
                    who, reasons);
        }

        if (member.githubUrl() == null) {
            reasons.add(who + " gave no GitHub link");
        } else {
            checkDomain(member.githubUrl(), List.of(GITHUB_DOMAIN), "GitHub", "", who, reasons);
        }

        // A blank phone number stays a note rather than becoming a reason to hold the team:
        // it is chaseable at any time and blocks nothing. A phone number that is present but
        // unreadable is different — somebody typed something that is not a number.
        if (member.phone() != null && !isPlausiblePhone(member.phone())) {
            reasons.add(who + " gave a phone number that is not " + MIN_PHONE_DIGITS + " to "
                    + MAX_PHONE_DIGITS + " digits: '" + member.phone() + "'");
        }
    }

    /**
     * Names the domain the person actually used, because that is what makes the report
     * actionable: "gave a github.com link for LinkedIn" tells whoever reads it exactly what
     * happened — the two boxes were filled in the wrong order.
     */
    private static void checkDomain(String url, List<String> permitted, String what,
                                    String expectation, String who, List<String> reasons) {
        String host = hostOf(url);
        if (host == null) {
            reasons.add(who + " gave a " + what + " link we cannot read: '" + url + "'");
            return;
        }
        for (String domain : permitted) {
            if (host.equals(domain) || host.endsWith("." + domain)) {
                return;
            }
        }
        reasons.add(who + " gave a " + displayHost(host) + " link for " + what + expectation);
    }

    /**
     * The host, lowercased, or null if the URL cannot be parsed.
     *
     * <p>Parsed with {@link URI} rather than matched with a regex on purpose: it is what
     * correctly reads {@code https://linkedin.com@example.com/x} as a link to example.com.
     * A "contains linkedin.com" check would wave that through.
     */
    private static String hostOf(String url) {
        try {
            String host = new URI(url).getHost();
            return host == null ? null : host.toLowerCase(Locale.ROOT);
        } catch (URISyntaxException e) {
            return null;
        }
    }

    /** "www.github.com" reads better as "github.com" in a sentence. */
    private static String displayHost(String host) {
        return host.startsWith("www.") ? host.substring(4) : host;
    }

    /**
     * Digits only once the punctuation a person types around a number is removed, and a
     * length that could be a real number somewhere in the world (E.164 caps at 15).
     *
     * <p>This says nothing about whether the number is in service, and it cannot: checking
     * that means calling or texting it. Do not read a pass here as a reachable phone.
     */
    static boolean isPlausiblePhone(String phone) {
        String digits = phone.replaceAll(PHONE_PUNCTUATION, "");
        if (digits.length() < MIN_PHONE_DIGITS || digits.length() > MAX_PHONE_DIGITS) {
            return false;
        }
        return digits.chars().allMatch(Character::isDigit);
    }
}
