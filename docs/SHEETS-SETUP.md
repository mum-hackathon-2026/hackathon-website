# Google Sheets Importer Setup

This guide explains how to set up Google Sheets API access using a Google Cloud Service Account so that `FormRegistrationImporter` can read participant registrations directly from the live Google Sheet.

---

## 1. Google Cloud Project Setup

> [!IMPORTANT]
> Create the Google Cloud Project under **No organization** (Personal Google account). Monash / organizational Google Workspace accounts enforce organizational policies that disable service account key creation (`iam.disableServiceAccountKeyCreation`).

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `hackathon-sheets-importer`) with **No organization**.
3. Enable the **Google Sheets API**:
   - Navigate to **APIs & Services** > **Library**.
   - Search for **Google Sheets API**.
   - Click **Enable**.

---

## 2. Create Service Account & Download Key

1. Navigate to **IAM & Admin** > **Service Accounts**.
2. Click **Create Service Account**:
   - **Service account name**: `hackathon-sheet-reader`
   - **Service account ID**: `hackathon-sheet-reader`
   - Role permissions: No project-level roles required.
3. Click **Done**.
4. Click on the newly created service account, go to the **Keys** tab:
   - Click **Add Key** > **Create new key**.
   - Select **JSON** format.
   - Download the JSON file.

---

## 3. Save the Service Account Key

1. Save the downloaded JSON file to:
   ```
   backend/credentials/sheets-key.json
   ```
2. Ensure the directory is gitignored (both `.gitignore` and `backend/.gitignore` ignore `credentials/` and `backend/credentials/`).
3. **Never commit the key file or print its contents.**

---

## 4. Share the Google Sheet with the Service Account

1. Open your downloaded `sheets-key.json` and look for the `"client_email"` property (e.g. `hackathon-sheet-reader@<project-id>.iam.gserviceaccount.com`).
2. Open the Google Sheet:
   - **Sheet ID**: `1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4`
   - **Tab Name**: `Form responses 1`
3. Click **Share** at the top right of the Google Sheet.
4. Add the `client_email` address with the role **Viewer**.
5. Uncheck "Notify people" and click **Share**.

---

## 5. Scope & Configuration Summary

| Setting | Value |
| --- | --- |
| **API** | Google Sheets API v4 |
| **OAuth Scope** | `https://www.googleapis.com/auth/spreadsheets.readonly` ONLY |
| **Default Sheet ID** | `1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4` |
| **Default Tab** | `Form responses 1` |
| **Default Key Path** | `backend/credentials/sheets-key.json` |
| **Env Var Override**| `GOOGLE_APPLICATION_CREDENTIALS` |
| **Team size** | Read from `event_settings` at import time — see below |
| **Submission sheet** | `app.sheets.submission-sheet-id` / `app.sheets.submission-tab`, falling back to the registration sheet id |
| **Poll interval** | `app.sheets.poll-interval-ms`, **default 15000** — see §8 |
| **Webhook secret** | `app.webhook.secret` — **ships blank, which disables the check**. See §7 |

---

## 5a. Team size comes from the database, not the code

Teams are **2 to 5 people**. Solo entries are not accepted.

The importer does **not** hold these numbers. It reads `min_team_size` and `max_team_size`
from the `event_settings` singleton (`id = 1`) on every run, and prints what it read in the
run header so you can see which limits were actually enforced:

```
  team size   : 2-5 (from event_settings)
```

That one value decides two things: which team sizes are accepted, and **how many
`Member N` blocks the column-mapping guard expects to find in the sheet**. With the maximum
at 5, the form needs six columns for each of members 1 through 5.

**There is no fallback.** If the `event_settings` row is missing, or either value is null,
the importer aborts with **exit `2`** and imports nothing — no `RESULT` line, no partial
write. Importing a season's registrations against guessed limits is worse than not
importing them.

### Changing the limits later

An `UPDATE` plus a form change. **No code change, and no new migration.**

```sql
update event_settings set min_team_size = 2, max_team_size = 6 where id = 1;
```

Then add or remove the matching block of seven questions on the Google Form, titled exactly:

```
Member 6: Full Name (First & Family Name)
Member 6: Email Address
Member 6: Phone / WhatsApp Number
Member 6: Major / Field of Study
Member 6: LinkedIn Profile URL
Member 6: Resume / CV (PDF)
Member 6: GitHub Profile URL
```

Header matching ignores case and punctuation and is generated per block number, so a new
block needs no alias list of its own. **A block must be all seven columns or none** — six of
seven is a mis-titled question and halts the run. Keep "Repository" and "repo" out of the
GitHub question title: `users.github_url` is the person's own account, not a project repo,
and a title containing either word aborts the import on purpose.

**Never delete or rename the Major question.** It is the only input to the IT course check,
and a sheet with no Major column anywhere aborts the import with exit `2` rather than
importing registrations nobody screened. Its answer is used for that check and stored in no
column. If the question has to be retitled, the importer also accepts `Major`, `Course`,
`Field of Study`, `Course of Study`, `Degree`, `Degree Programme`, `Programme`, `Program`
and `Study Field`, each prefixed `Member N`.

---

## 6. Running the Importer

### Dry Run (Validation Only)
```powershell
cd backend
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --dry-run"
```

### Live Run (Writes to Database)
```powershell
cd backend
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4"
```

### Specifying Custom Tab or Credentials Path
```powershell
cd backend
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --tab=\"Form responses 1\" --credentials=backend/credentials/sheets-key.json --dry-run"
```

---

## 7. Instant Push Execution (Google Apps Script Webhook)

> ⚠️ **Set `app.webhook.secret` before you use this.** `RegistrationWebhookController` checks the
> `X-Webhook-Secret` header **only when the property is non-blank**, and `application.properties`
> commits it as `app.webhook.secret=` — empty. As shipped, the endpoint is unauthenticated and
> anyone who can reach the backend can trigger a full sheet import. Put a real secret in
> `application-local.properties` (or an environment variable) and use the same value in the script
> below. **Never commit the secret** — the placeholder in the snippet is deliberate.


To automatically trigger registration import the moment a user submits the Google Form, set up an `onFormSubmit` Apps Script webhook:

1. Open your linked Google Sheet (`1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4`).
2. Click **Extensions** > **Apps Script**.
3. Replace any default code in `Code.gs` with the following script:

```javascript
/**
 * Triggers backend registration sync immediately upon form submission.
 */
function onFormSubmit(e) {
  // Replace with your deployed backend server URL (or ngrok/tunnel for local testing)
  var WEBHOOK_URL = "https://your-server-domain.com/api/webhooks/forms/registration";
  var WEBHOOK_SECRET = "REPLACE_ME"; // must match app.webhook.secret — see the warning below

  var payload = {
    eventType: "form_submission",
    timestamp: new Date().toISOString()
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Webhook-Secret": WEBHOOK_SECRET
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log("Webhook response code: " + response.getResponseCode());
    Logger.log("Webhook response body: " + response.getContentText());
  } catch (err) {
    Logger.log("Error sending webhook: " + err);
  }
}
```

4. Set up the Installable Trigger:
   - In Apps Script, click the **Triggers** icon (clock icon) in the left sidebar.
   - Click **Add Trigger** (bottom right).
   - Choose function to run: `onFormSubmit`
   - Select event source: **From spreadsheet** (or **From form**)
   - Select event type: **On form submit**
   - Click **Save** and grant permissions.


---

## 8. The importers also run inside the app

The Apps Script webhook is one of **two** triggers, and the other one runs whether or not you set
the webhook up.

Both `webhook/RegistrationImportService` and `webhook/SubmissionImportService` carry:

```java
@Scheduled(fixedDelayString = "${app.sheets.poll-interval-ms:15000}", initialDelay = 3000)
```

**A running backend re-reads its sheet every 15 seconds.** Three consequences worth knowing before
you start the app:

- **The sheet ids are committed in `application.properties`** and point at the team's live sheets.
  Every checkout that starts the backend polls them four times a minute against the Sheets API
  quota. **The only off switch is blanking the id** — set `app.sheets.sheet-id=` and
  `app.sheets.submission-sheet-id=` in `application-local.properties` if you do not want this.
  There is no separate enable flag.
- **The registration sync swallows its failures at `DEBUG`.** `RegistrationImportService.scheduledSync`
  catches every exception and logs `log.debug(...)`, so at the default level a sync that has been
  failing all day is completely silent. `SubmissionImportService` uses `log.warn` for the same case.
- **The import is idempotent**, which is what makes polling safe: a team already present with the
  same members is reported as already present and left alone.

### The two endpoints

| | Registration | Submission |
| - | ------------ | ---------- |
| Endpoint | `POST /api/webhooks/forms/registration` | `POST /api/webhook/submissions` |
| Sheet id | `app.sheets.sheet-id` | `app.sheets.submission-sheet-id` (falls back to `sheet-id`) |
| Tab | `app.sheets.tab` | `app.sheets.submission-tab` |
| Writes | `users`, `teams`, `team_members` | `submissions` |
| Re-submission | Rejected if the members differ | **Updates** the existing row |

Both accept `?dryRun=true`, which does the real inserts and rolls them back.

### Credential lookup order

`resolveCredentialsPath` tries four locations in order and uses the first that exists:

1. `app.sheets.credentials-path`
2. `$GOOGLE_APPLICATION_CREDENTIALS`
3. `backend/credentials/sheets-key.json`
4. `credentials/sheets-key.json`

`credentials/` is gitignored at both the repo root and inside `backend/`, and no key has ever been
committed. Keep it that way.

---

## 9. What the importer rejects, holds, and lets through

Every team ends in one of **three** states. `REJECTED` is structural and unfixable without a new
registration; `PENDING` is eligibility screening holding the team for a human; everything else is
imported. Both `REJECTED` and `PENDING` end the run with exit `1` and are listed separately in the
report, because the follow-up work is different.

**Rejected** (the row is not imported; every other row still is, and the run ends with exit `1`):

| | Rule |
| - | ---- |
| Team | No team name; team name over 120 characters; a team name already taken by a different set of members |
| Size | Fewer members than `event_settings.min_team_size`, or more than `max_team_size` |
| Name | A member with no name, or a name over 200 characters |
| Email | A member with no email; a malformed email; an email outside 3–320 characters; the same email twice inside one team; an email already on another team |
| Links | A resume, LinkedIn or GitHub value that is **present but is not an `http(s)://` URL** |

**Pending** (the row is **not imported**, nothing is written for it, and the run ends with exit `1`):

| | Rule |
| - | ---- |
| Course | **No** member's major contains an IT keyword. One IT member is enough for the whole team. The message quotes every member's major verbatim so a person can judge it |
| Links | A **blank** resume, LinkedIn or GitHub; or a link on the wrong domain — LinkedIn must be `linkedin.com`, GitHub `github.com`, a resume `drive.google.com` or `docs.google.com` (subdomains count) |
| Phone | A phone number that is **present** but is not 8–15 digits once spaces, `+`, `-` and brackets are stripped |

**A held team leaves no trace.** No row, no flag, no column — so the next run reads the sheet and
screens it again. **Correcting the spreadsheet is the entire fix**, and a team stays on the report
every run until somebody resolves it. That is the point; it is not a queue that can go stale.

**Links are checked for shape and domain only.** Nothing calls the network. The importer cannot
tell you a LinkedIn profile exists, that a Drive file is shared with anyone, or that a GitHub
account belongs to the person who typed it. **Do not read a clean run as evidence that a link
resolves.** Checking that is a different feature and needs a decision about rate limits, timeouts
and what a 404 from a private Drive file is supposed to mean.

**Warned, but still imported** — the row goes in and the warning is printed for a human to chase:

- A member left **phone** blank. (Chaseable at any time and blocks nothing; a *malformed* phone
  number is different and holds the team.)
- A blank member block sits *between* two filled ones (someone may have been dropped).

**A missing resume no longer imports with a note.** It used to, which in practice meant it imported
and nobody read the note. It is now `PENDING`.

### The keyword list needs a human before registration opens

The IT course check is a case-, space- and punctuation-insensitive **substring** match against one
constant, `EligibilityScreening.IT_COURSE_KEYWORDS`, and the list is **printed in full in every run
header** so a "no clear IT-related course" line can be read against the terms that decided it.

- A course **missing** from the list costs somebody a manual check — the team is held, not refused,
  so the cost is time rather than a lost registration.
- A term that is **too broad** turns the check into a rubber stamp. `analytics` would match Business
  Analytics, `technology` matches Food Technology and Biotechnology, and `it` appears inside
  ordinary words like hospitality. All three are excluded on purpose.

Review it against the courses your universities actually offer. Adding a term is one line.

### What is still not built

- **Nobody tells the registrant.** A held or rejected team learns nothing unless an organiser
  contacts them: no table carries a rejected state, `users` is the sign-in allowlist so they simply
  cannot sign in, and `notifications_log` still has no writer. The report names the team, the member
  and the reason in plain language exactly so a person can send that email by hand.
- **`event_settings.screening_enabled` still gates nothing.** Screening always runs; the importer
  never reads that column. A safety check that defaults to off is not a safety check. (The
  eligibility dropdown in the admin Participants table is also *not* this — it is a view filter over
  already-imported rows, deriving `eligible` / `unverified` / `not_student` from the email domain and
  `users.email_verified`, storing nothing and never looking at `resume_url`.)
