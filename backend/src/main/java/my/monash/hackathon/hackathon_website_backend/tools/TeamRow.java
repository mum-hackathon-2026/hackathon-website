package my.monash.hackathon.hackathon_website_backend.tools;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * One row of the exported registration sheet, turned into a team and its members.
 *
 * <p>The form collects one row per TEAM: a leader in the "Member 1" block plus the rest.
 * This class works out which member blocks a row actually filled in, checks every value the
 * database or the rules require, and reports the first problem in words a person chasing the
 * registrant can act on.
 *
 * <p>Nothing here touches the database. Everything it rejects is decidable from the row
 * alone plus the {@link SizeLimits} it is handed — shape, formats, team size, and a person
 * listed twice on their own team. Clashes with rows already in the database, or with earlier
 * rows in the same file, are the importer's job.
 *
 * <p>How many member blocks the form carries is not fixed here. The field aliases are
 * generated per block number, so "Member 5: Email Address" maps by the same rule that maps
 * "Member 1 Email"; the only thing that decides how many blocks are permitted is
 * {@code event_settings.max_team_size}.
 */
final class TeamRow {

    /**
     * The permitted team size, inclusive at both ends.
     *
     * <p>Read from the {@code event_settings} singleton at import time — see
     * {@code FormRegistrationImporter.readTeamSizeLimits}. This class deliberately does not
     * know how to fetch it: everything here is decidable from a row plus these two numbers,
     * and keeping the database out preserves that.
     *
     * <p>There is no default and no fallback anywhere. The limits used to be a constant on
     * this class, which is exactly why moving from 1–4 to 2–5 needed a recompile; now the
     * only copy is the database row.
     */
    record SizeLimits(int min, int max) {

        SizeLimits {
            if (min < 1 || max < min) {
                throw new IllegalArgumentException(
                        "nonsensical team size limits: min=" + min + ", max=" + max);
            }
        }

        /** "2-5", for the run header and for rejection messages. */
        String describe() {
            return min + "-" + max;
        }
    }

    /** The blocks the form is expected to produce (2 to 5 members). */
    static final int MIN_TEAM_SIZE = 2;
    static final int MAX_TEAM_SIZE = 5;

    /**
     * How far past the maximum to keep looking for member blocks. A form that grew one more
     * block than the limit allows is a mistake worth naming — reporting "team size is 6, the
     * limit is 5" is far more use than ignoring the column and importing a team that is
     * quietly missing someone.
     *
     * <p>Fixed rather than derived from {@link SizeLimits}: it is a scan depth, not a
     * policy, and it only has to sit far enough above any plausible limit to catch the
     * overflow. Raise it if {@code max_team_size} ever approaches it.
     */
    private static final int BLOCK_SCAN_LIMIT = 8;

    private static final int MAX_NAME_LENGTH = 200;      // users_full_name_length_check
    private static final int MAX_EMAIL_LENGTH = 320;     // users_email_length_check
    private static final int MIN_EMAIL_LENGTH = 3;       // users_email_length_check
    private static final int MAX_TEAM_NAME_LENGTH = 120; // teams_name_length_check

    /**
     * Deliberately permissive: an address with an @ and a dotted domain and no whitespace.
     * The aim is to catch a person who typed their name or "n/a" into the email box, not to
     * adjudicate RFC 5322 — over-strict validation rejects real addresses and creates work.
     */
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@,;]+@[^\\s@,;.]+(\\.[^\\s@,;.]+)+$");

    /** Mirrors the shape submissions.github_url is constrained to in V1. */
    private static final Pattern URL = Pattern.compile("^https?://\\S+$");

    private static final List<String> TEAM_NAME_HEADERS = List.of("teamname", "team");

    /**
     * {@code githubUrl} is the person's own GitHub account, collected for screening. It is
     * unrelated to {@code submissions.github_url}, which is a team's project repository.
     *
     * <p>{@code major} has no column in {@code users} and is never written anywhere. It is
     * read for one purpose — {@link EligibilityScreening}'s IT course check — and then
     * discarded with the row. It is carried verbatim, punctuation and capitalisation
     * included, because the report quotes it back to whoever has to judge it.
     */
    record Member(int block, String fullName, String email, String phone, String major,
                  String resumeUrl, String linkedinUrl, String githubUrl) {}

    /** A row that could not be interpreted; {@code reason} is written for a human. */
    static final class InvalidRowException extends RuntimeException {
        InvalidRowException(String reason) {
            super(reason);
        }
    }

    private final int lineNumber;
    private final String teamName;
    private final List<Member> members;
    private final List<String> warnings;

    private TeamRow(int lineNumber, String teamName, List<Member> members, List<String> warnings) {
        this.lineNumber = lineNumber;
        this.teamName = teamName;
        this.members = members;
        this.warnings = warnings;
    }

    int lineNumber() {
        return lineNumber;
    }

    String teamName() {
        return teamName;
    }

    List<Member> members() {
        return members;
    }

    Member leader() {
        return members.getFirst();
    }

    List<String> emails() {
        return members.stream().map(Member::email).toList();
    }

    /** Non-fatal observations — a missing phone number is chaseable, not a reason to refuse. */
    List<String> warnings() {
        return warnings;
    }

    /** The values collected per person, with the header spellings each will match. */
    enum Field {
        NAME("Name", "name", "fullname", "fullnamefirstfamilyname"),
        EMAIL("Email", "email", "emailaddress"),
        PHONE("Phone", "phone", "phonenumber", "contactnumber", "mobile", "phonewhatsappnumber"),
        // Feeds the IT course check and nothing else - there is no users.major column. The
        // aliases are wide on purpose: this question is titled differently on every form
        // ("Major", "Course", "Field of Study", "Degree Programme"), and a spelling that
        // fails to map halts the whole run rather than importing anyone unscreened.
        MAJOR("Major", "major", "fieldofstudy", "majorfieldofstudy", "majororfieldofstudy",
                "fieldofstudymajor", "course", "courseofstudy", "majorcourse", "degree",
                "degreeprogramme", "degreeprogram", "programme", "program", "studyfield"),
        RESUME("Resume", "resume", "resumeurl", "resumelink", "cv", "cvlink", "resumecvpdf"),
        LINKEDIN("LinkedIn", "linkedin", "linkedinurl", "linkedinlink", "linkedinprofile", "linkedinprofileurl"),
        // The person's own account. Nothing here matches a "project"/"repo" spelling on
        // purpose — submissions.github_url is a different column with a different meaning,
        // and a header called "Project GitHub" must not silently land in users.github_url.
        GITHUB("GitHub", "github", "githuburl", "githublink", "githubprofile",
                "githubaccount", "githubusername", "githubprofileurl");

        private final String label;
        private final List<String> suffixes;

        Field(String label, String... suffixes) {
            this.label = label;
            this.suffixes = List.of(suffixes);
        }

        String label() {
            return label;
        }

        /** Normalised header names this field will match for the given member block. */
        List<String> aliases(int block) {
            return suffixes.stream().map(suffix -> "member" + block + suffix).toList();
        }

        /** The header spelling to recommend when this field failed to map, e.g. "Member 3 Name". */
        String canonicalHeader(int block) {
            return "Member " + block + " " + label;
        }
    }

    /** Whether a normalised header name corresponds to any mapped field or team name. */
    static boolean isMappedHeader(String normalisedHeader) {
        if (TEAM_NAME_HEADERS.contains(normalisedHeader)) {
            return true;
        }
        for (int block = 1; block <= BLOCK_SCAN_LIMIT; block++) {
            for (Field field : Field.values()) {
                if (field.aliases(block).contains(normalisedHeader)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Every field's label, in form order: Name, Email, Phone, Resume, LinkedIn, GitHub. */
    static List<String> fieldLabels() {
        return Arrays.stream(Field.values()).map(Field::label).toList();
    }

    /** The six canonical header spellings for one member block, quoted for a report. */
    static String canonicalHeaders(int block) {
        return Arrays.stream(Field.values())
                .map(field -> "'" + field.canonicalHeader(block) + "'")
                .collect(Collectors.joining(", "));
    }

    static List<String> teamNameHeaders() {
        return TEAM_NAME_HEADERS;
    }

    /**
     * Interprets a row. Throws {@link InvalidRowException} with a readable reason rather
     * than returning a partially-built team — a row the importer cannot fully understand is
     * one a human has to look at.
     */
    static TeamRow from(CsvReader.Row row, SizeLimits limits) {
        String rawTeamName = row.firstPresent(TEAM_NAME_HEADERS);
        String teamName = rawTeamName == null ? "" : rawTeamName.trim();
        if (teamName.isEmpty()) {
            throw new InvalidRowException("no team name");
        }
        if (teamName.length() > MAX_TEAM_NAME_LENGTH) {
            throw new InvalidRowException("team name is " + teamName.length()
                    + " characters; the limit is " + MAX_TEAM_NAME_LENGTH);
        }

        // Everything from here on knows which team it is talking about, so every rejection
        // is named. A report line reading "team size is 5" tells whoever has to chase it
        // almost nothing; "'Overflow Five' - team size is 5" tells them who to email.
        try {
            return membersOf(row, teamName, limits);
        } catch (InvalidRowException e) {
            throw new InvalidRowException("'" + teamName + "' - " + e.getMessage());
        }
    }

    private static TeamRow membersOf(CsvReader.Row row, String teamName, SizeLimits limits) {
        // Which member blocks this row actually filled in. Established before any of them is
        // validated, so an oversized team is reported as oversized rather than as whatever
        // its fifth member happened to get wrong.
        Map<Integer, Map<Field, String>> filled = new LinkedHashMap<>();
        for (int block = 1; block <= BLOCK_SCAN_LIMIT; block++) {
            Map<Field, String> values = readBlock(row, block);
            if (values.values().stream().anyMatch(value -> !value.isEmpty())) {
                filled.put(block, values);
            }
        }

        if (filled.isEmpty()) {
            throw new InvalidRowException("no members at all");
        }
        // Both ends are named against the live limits rather than a literal, so the message
        // cannot drift from what was actually enforced. Under-size is its own message: "team
        // has 1 member; the minimum is 2" tells whoever chases it what to ask for, where
        // "must have between 2 and 5" leaves them working out which end was wrong.
        if (filled.size() < limits.min()) {
            throw new InvalidRowException("team has " + describeSize(filled.size())
                    + "; the minimum is " + limits.min());
        }
        if (filled.size() > limits.max()) {
            throw new InvalidRowException("team size is " + filled.size()
                    + "; teams must have between " + limits.min() + " and " + limits.max()
                    + " members");
        }

        List<Member> members = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // A blank block BETWEEN two filled ones is worth flagging: someone may have been
        // dropped. Blocks after the last filled one are just the unused half of the form and
        // say nothing at all, so they are not mentioned.
        int lastFilled = filled.keySet().stream().mapToInt(Integer::intValue).max().orElseThrow();
        List<Integer> gaps = new ArrayList<>();
        for (int block = 1; block < lastFilled; block++) {
            if (!filled.containsKey(block)) {
                gaps.add(block);
            }
        }
        if (!gaps.isEmpty()) {
            warnings.add("member block(s) " + gaps + " are blank but block " + lastFilled
                    + " is filled in - members were taken in order, check nobody was dropped");
        }

        for (Map.Entry<Integer, Map<Field, String>> entry : filled.entrySet()) {
            members.add(validateBlock(entry.getKey(), entry.getValue(), warnings));
        }

        Set<String> seen = new LinkedHashSet<>();
        for (Member member : members) {
            if (!seen.add(member.email())) {
                throw new InvalidRowException("duplicate email within this team: "
                        + member.email() + " is listed for more than one member");
            }
        }

        return new TeamRow(row.lineNumber(), teamName, List.copyOf(members), List.copyOf(warnings));
    }

    private static Map<Field, String> readBlock(CsvReader.Row row, int block) {
        Map<Field, String> values = new EnumMap<>(Field.class);
        for (Field field : Field.values()) {
            String raw = row.firstPresent(field.aliases(block));
            values.put(field, raw == null ? "" : raw.trim());
        }
        return values;
    }

    private static Member validateBlock(int block, Map<Field, String> values,
                                        List<String> warnings) {
        String who = "member " + block;

        String fullName = values.get(Field.NAME);
        if (fullName.isEmpty()) {
            throw new InvalidRowException(who + " has no name");
        }
        if (fullName.length() > MAX_NAME_LENGTH) {
            throw new InvalidRowException(who + " (" + fullName.substring(0, 40) + "...) has a name "
                    + fullName.length() + " characters long; the limit is " + MAX_NAME_LENGTH);
        }

        String rawEmail = values.get(Field.EMAIL);
        if (rawEmail.isEmpty()) {
            throw new InvalidRowException(who + " (" + fullName + ") has no email address");
        }
        // Lowercased to satisfy users_email_lowercase_check, which is what makes the UNIQUE
        // constraint on email genuinely case-insensitive.
        String email = rawEmail.toLowerCase(Locale.ROOT);
        if (!EMAIL.matcher(email).matches()) {
            throw new InvalidRowException("malformed email for " + who + " (" + fullName + "): '"
                    + rawEmail + "'");
        }
        if (email.length() < MIN_EMAIL_LENGTH || email.length() > MAX_EMAIL_LENGTH) {
            throw new InvalidRowException("email for " + who + " (" + fullName + ") is "
                    + email.length() + " characters; the limit is " + MAX_EMAIL_LENGTH);
        }

        String phone = blankToNull(values.get(Field.PHONE));
        if (phone == null) {
            warnings.add(who + " (" + fullName + ") gave no phone number");
        }

        // Verbatim, not lowercased and not blank-to-nulled: the screening report quotes it
        // back to a human, and "" is itself the answer to "what did they put?".
        String major = values.get(Field.MAJOR);

        String resumeUrl = validateUrl(values.get(Field.RESUME), "resume", who, fullName);
        String linkedinUrl = validateUrl(values.get(Field.LINKEDIN), "LinkedIn", who, fullName);
        String githubUrl = validateUrl(values.get(Field.GITHUB), "GitHub", who, fullName);

        return new Member(block, fullName, email, phone, major, resumeUrl, linkedinUrl, githubUrl);
    }

    /**
     * A value that is present but is not a URL is a rejection — "will send later" in the
     * resume box is a form somebody filled in wrongly on purpose, and no amount of chasing
     * turns that string into a link. A value that is simply absent returns null and is
     * picked up by {@link EligibilityScreening} as a PENDING reason instead: the column is
     * nullable, and a blank box is a person to remind, not a team to refuse.
     *
     * <p>Shape only. Which domain the URL points at is screening's business, not this
     * class's — a wrong domain is a paste error and must not reject the row.
     */
    private static String validateUrl(String value, String what, String who, String fullName) {
        String trimmed = blankToNull(value);
        if (trimmed == null) {
            return null;
        }
        if (!URL.matcher(trimmed).matches()) {
            throw new InvalidRowException(what + " for " + who + " (" + fullName
                    + ") is not a URL: '" + trimmed + "' - it must start with http:// or https://");
        }
        return trimmed;
    }

    private static String blankToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    /** "1 member" / "3 members", so the rejection reads as a sentence. */
    private static String describeSize(int size) {
        return size + (size == 1 ? " member" : " members");
    }
}
