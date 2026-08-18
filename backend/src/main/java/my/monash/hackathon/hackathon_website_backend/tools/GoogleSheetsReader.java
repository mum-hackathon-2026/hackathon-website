package my.monash.hackathon.hackathon_website_backend.tools;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads Google Sheets directly via the Google Sheets API v4 using a service account key.
 */
final class GoogleSheetsReader {

    static final String DEFAULT_TAB = "Form responses 1";

    private GoogleSheetsReader() {}

    static CsvReader.Sheet read(String sheetId, String tabName, Path credentialsPath)
            throws SheetsException {
        if (credentialsPath == null || !Files.exists(credentialsPath) || !Files.isReadable(credentialsPath)) {
            throw new SheetsException(SheetsException.Reason.MISSING_CREDENTIALS,
                    "Credentials missing: file not found or unreadable at '"
                            + (credentialsPath == null ? "null" : credentialsPath.toAbsolutePath()) + "'");
        }

        GoogleCredentials credentials;
        try (InputStream in = new FileInputStream(credentialsPath.toFile())) {
            credentials = GoogleCredentials.fromStream(in)
                    .createScoped(Collections.singleton(SheetsScopes.SPREADSHEETS_READONLY));
        } catch (IOException | IllegalArgumentException e) {
            throw new SheetsException(SheetsException.Reason.INVALID_CREDENTIALS,
                    "Credentials invalid in '" + credentialsPath.toAbsolutePath() + "': " + e.getMessage());
        }

        Sheets service;
        try {
            service = new Sheets.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    new HttpCredentialsAdapter(credentials))
                    .setApplicationName("hackathon-website-importer")
                    .build();
        } catch (GeneralSecurityException | IOException e) {
            throw new SheetsException(SheetsException.Reason.UNREACHABLE,
                    "Could not initialize Google Sheets client: " + e.getMessage());
        }

        String targetTab = (tabName == null || tabName.isBlank()) ? DEFAULT_TAB : tabName;
        String range = "'" + targetTab.replace("'", "''") + "'";

        ValueRange response;
        try {
            response = service.spreadsheets().values()
                    .get(sheetId, range)
                    .setValueRenderOption("UNFORMATTED_VALUE")
                    .execute();
        } catch (GoogleJsonResponseException e) {
            if (e.getStatusCode() == 403 || e.getStatusCode() == 404
                    || (e.getMessage() != null && e.getMessage().toLowerCase().contains("permission"))) {
                throw new SheetsException(SheetsException.Reason.UNREACHABLE,
                        "Sheet unreachable: sheet not shared with the service account (or does not exist). Ensure the sheet is shared with the service account email as Viewer.");
            }
            throw new SheetsException(SheetsException.Reason.UNREACHABLE,
                    "Sheet unreachable: Google Sheets API returned HTTP " + e.getStatusCode() + ": " + e.getMessage());
        } catch (IOException e) {
            throw new SheetsException(SheetsException.Reason.UNREACHABLE,
                    "Sheet unreachable: could not reach Google Sheets API for sheet '" + sheetId + "': " + e.getMessage());
        }

        List<List<Object>> values = response.getValues();
        return parseValues(values);
    }

    static CsvReader.Sheet parseValues(List<List<Object>> values) {
        if (values == null || values.isEmpty()) {
            throw new CsvReader.MalformedCsvException("the sheet is empty - expected a header row");
        }

        List<Object> headerRow = values.getFirst();
        Map<String, String> headersByNormalisedName = new LinkedHashMap<>();
        List<String> headerStrings = new ArrayList<>();

        for (Object cell : headerRow) {
            String header = formatCellValue(cell).trim();
            headerStrings.add(header);
            if (header.isEmpty()) {
                continue;
            }
            String normalised = CsvReader.normalise(header);
            if (normalised.isEmpty()) {
                continue;
            }
            String existing = headersByNormalisedName.putIfAbsent(normalised, header);
            if (existing != null && TeamRow.isMappedHeader(normalised)) {
                if (existing.equals(header)) {
                    throw new CsvReader.MalformedCsvException(
                            "two columns have the same name: '" + header + "'. Google Forms "
                                    + "allows two questions with the same title, but there is no "
                                    + "way to tell which one to read - the value would be taken "
                                    + "from whichever column came last. Rename one of them.");
                }
                throw new CsvReader.MalformedCsvException(
                        "two columns mean the same thing once punctuation and case are ignored: "
                                + "'" + existing + "' and '" + header + "'. Rename one of them.");
            }
        }

        if (headersByNormalisedName.isEmpty()) {
            throw new CsvReader.MalformedCsvException("the header row has no usable column names");
        }

        List<CsvReader.Row> rows = new ArrayList<>();
        for (int i = 1; i < values.size(); i++) {
            List<Object> rowValues = values.get(i);
            int lineNumber = i + 1;

            boolean allEmpty = true;
            for (Object cell : rowValues) {
                if (!formatCellValue(cell).trim().isEmpty()) {
                    allEmpty = false;
                    break;
                }
            }
            if (allEmpty) {
                continue;
            }

            Map<String, String> byHeader = new LinkedHashMap<>();
            for (int col = 0; col < headerStrings.size(); col++) {
                String header = headerStrings.get(col);
                if (!header.isEmpty()) {
                    String normalised = CsvReader.normalise(header);
                    if (!normalised.isEmpty()) {
                        String cellVal = col < rowValues.size() ? formatCellValue(rowValues.get(col)) : "";
                        byHeader.put(normalised, cellVal);
                    }
                }
            }
            rows.add(new CsvReader.Row(lineNumber, byHeader));
        }

        return new CsvReader.Sheet(headersByNormalisedName, rows);
    }

    static String formatCellValue(Object cell) {
        if (cell == null) {
            return "";
        }
        if (cell instanceof Number number) {
            if (number instanceof BigDecimal bd) {
                return bd.stripTrailingZeros().toPlainString();
            }
            if (number instanceof Long || number instanceof Integer || number instanceof Short || number instanceof Byte) {
                return number.toString();
            }
            double d = number.doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                return "";
            }
            BigDecimal bd = BigDecimal.valueOf(d);
            if (bd.scale() > 0 && bd.stripTrailingZeros().scale() <= 0) {
                return bd.toBigInteger().toString();
            }
            return bd.stripTrailingZeros().toPlainString();
        }
        String str = cell.toString();
        if (str.matches("^[+-]?[0-9]+(\\.[0-9]+)?[eE][+-]?[0-9]+$")) {
            try {
                BigDecimal bd = new BigDecimal(str);
                if (bd.scale() > 0 && bd.stripTrailingZeros().scale() <= 0) {
                    return bd.toBigInteger().toString();
                }
                return bd.stripTrailingZeros().toPlainString();
            } catch (NumberFormatException ignored) {
            }
        }
        return str;
    }

    static final class SheetsException extends Exception {
        enum Reason {
            MISSING_CREDENTIALS,
            INVALID_CREDENTIALS,
            UNREACHABLE
        }

        private final Reason reason;

        SheetsException(Reason reason, String message) {
            super(message);
            this.reason = reason;
        }

        Reason reason() {
            return reason;
        }
    }
}
