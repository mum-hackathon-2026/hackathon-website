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

Then add or remove the matching block of six questions on the Google Form, titled exactly:

```
Member 6: Full Name (First & Family Name)
Member 6: Email Address
Member 6: Phone / WhatsApp Number
Member 6: LinkedIn Profile URL
Member 6: Resume / CV (PDF)
Member 6: GitHub Profile URL
```

Header matching ignores case and punctuation and is generated per block number, so a new
block needs no alias list of its own. **A block must be all six columns or none** — five of
six is a mis-titled question and halts the run. Keep "Repository" and "repo" out of the
GitHub question title: `users.github_url` is the person's own account, not a project repo,
and a title containing either word aborts the import on purpose.

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
  var WEBHOOK_SECRET = "dev_webhook_secret_2026"; // matches app.webhook.secret

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

