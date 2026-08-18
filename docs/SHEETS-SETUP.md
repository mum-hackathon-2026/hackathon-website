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
