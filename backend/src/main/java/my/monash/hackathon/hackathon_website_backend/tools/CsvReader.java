package my.monash.hackathon.hackathon_website_backend.tools;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A minimal RFC 4180 CSV reader, sufficient for the files Google Sheets exports.
 *
 * <p>Hand-rolled rather than pulled in as a dependency: this is the only CSV in the
 * project, it is read by one standalone tool, and adding a library to the production
 * {@code pom.xml} to serve a tool that never runs in the application is a poor trade. The
 * parser does handle the cases that actually bite — quoted fields, commas and newlines
 * inside quotes, doubled quotes as an escape, CRLF line endings, and a UTF-8 BOM — because
 * team names and resume links genuinely contain commas.
 *
 * <p>Headers are matched after normalisation: lowercased with every non-alphanumeric
 * character removed, so {@code "Member 1 Email"}, {@code "member 1 email"} and
 * {@code "MEMBER_1_EMAIL"} are the same column. Columns the importer does not recognise
 * (Google's {@code Timestamp}, a consent checkbox, an auto-collected email address) are
 * carried along and simply never looked up.
 */
final class CsvReader {

    private CsvReader() {}

    /**
     * One data row. {@code lineNumber} is the physical line the record started on, which is
     * what a human needs in order to find it in the spreadsheet — it is not the same as the
     * record's index once a quoted field contains a newline.
     */
    record Row(int lineNumber, Map<String, String> byNormalisedHeader) {

        /** The raw value for the first header that is present, or null if none are. */
        String firstPresent(List<String> normalisedHeaders) {
            for (String header : normalisedHeaders) {
                String value = byNormalisedHeader.get(header);
                if (value != null) {
                    return value;
                }
            }
            return null;
        }
    }

    /** The parsed file: the header row as it was written, plus every non-blank data row. */
    record Sheet(Map<String, String> headersByNormalisedName, List<Row> rows) {

        boolean hasHeader(String normalisedHeader) {
            return headersByNormalisedName.containsKey(normalisedHeader);
        }

        /** The header exactly as it appears in the file, for reporting the column mapping. */
        String originalHeader(String normalisedHeader) {
            return headersByNormalisedName.get(normalisedHeader);
        }
    }

    /** Thrown for a file that cannot be interpreted as a sheet at all. */
    static final class MalformedCsvException extends RuntimeException {
        MalformedCsvException(String message) {
            super(message);
        }
    }

    static String normalise(String header) {
        return header.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    static Sheet read(Path file) throws IOException {
        String content = Files.readString(file, StandardCharsets.UTF_8);
        // Sheets exports are frequently BOM-prefixed; left in place the BOM becomes part of
        // the first header and that column silently stops matching.
        if (!content.isEmpty() && content.charAt(0) == '﻿') {
            content = content.substring(1);
        }

        List<ParsedRecord> records = parse(content);
        if (records.isEmpty()) {
            throw new MalformedCsvException("the file is empty — expected a header row");
        }

        List<String> headerRecord = records.getFirst().fields();
        Map<String, String> headersByNormalisedName = new LinkedHashMap<>();
        for (String header : headerRecord) {
            String trimmed = header.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String normalised = normalise(trimmed);
            if (normalised.isEmpty()) {
                continue;
            }
            String existing = headersByNormalisedName.putIfAbsent(normalised, trimmed);
            if (existing != null && !existing.equals(trimmed)) {
                throw new MalformedCsvException(
                        "two columns mean the same thing once punctuation and case are ignored: "
                                + "'" + existing + "' and '" + trimmed + "'. Rename one of them.");
            }
        }
        if (headersByNormalisedName.isEmpty()) {
            throw new MalformedCsvException("the header row has no usable column names");
        }

        List<Row> rows = new ArrayList<>();
        for (int i = 1; i < records.size(); i++) {
            List<String> record = records.get(i).fields();
            int lineNumber = records.get(i).startLine();
            if (record.stream().allMatch(field -> field.trim().isEmpty())) {
                continue; // trailing blank rows are routine in a Sheets export
            }
            Map<String, String> byHeader = new LinkedHashMap<>();
            int column = 0;
            for (String header : headerRecord) {
                String trimmed = header.trim();
                if (!trimmed.isEmpty()) {
                    String normalised = normalise(trimmed);
                    if (!normalised.isEmpty()) {
                        byHeader.put(normalised, column < record.size() ? record.get(column) : "");
                    }
                }
                column++;
            }
            rows.add(new Row(lineNumber, byHeader));
        }

        return new Sheet(headersByNormalisedName, rows);
    }

    /**
     * A record together with the physical line it began on. The two travel together because
     * a newline inside a quoted field makes record index and line number diverge, and it is
     * the line number a human needs to find the row in the spreadsheet.
     */
    private record ParsedRecord(int startLine, List<String> fields) {}

    private static List<ParsedRecord> parse(String content) {
        List<ParsedRecord> records = new ArrayList<>();

        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        int line = 1;
        int recordStart = 1;

        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);

            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < content.length() && content.charAt(i + 1) == '"') {
                        field.append('"'); // "" is an escaped quote
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    if (c == '\n') {
                        line++;
                    }
                    field.append(c);
                }
                continue;
            }

            switch (c) {
                case '"' -> {
                    // Only a quote opening a field starts a quoted section. A stray quote
                    // in the middle of an unquoted field is a literal character.
                    if (field.isEmpty()) {
                        inQuotes = true;
                    } else {
                        field.append(c);
                    }
                }
                case ',' -> {
                    fields.add(field.toString());
                    field.setLength(0);
                }
                case '\r' -> {
                    // swallow; the \n that follows ends the record
                }
                case '\n' -> {
                    fields.add(field.toString());
                    field.setLength(0);
                    records.add(new ParsedRecord(recordStart, fields));
                    fields = new ArrayList<>();
                    line++;
                    recordStart = line;
                }
                default -> field.append(c);
            }
        }

        // A file that does not end in a newline still has a final record.
        if (inQuotes) {
            throw new MalformedCsvException(
                    "the file ends inside a quoted field — a closing double quote is missing "
                            + "(the record starting at line " + recordStart + " never ends)");
        }
        if (!field.isEmpty() || !fields.isEmpty()) {
            fields.add(field.toString());
            records.add(new ParsedRecord(recordStart, fields));
        }

        return records;
    }
}
