# SSRF_PREVENTION Security Report

## Status: PASS

## Findings
- **Outbound HTTP Calls**:
  - `GoogleTokenVerifier.java` calls only Google's official ID token verification endpoint (`https://oauth2.googleapis.com/tokeninfo`). The endpoint URL is hardcoded and fixed.
  - `SheetsImportBackendService.java` queries Google Sheets via the official Google API Client SDK. Sheet IDs and credentials paths are fixed in server configuration.
- **User-Supplied Links**: Participant submission links (GitHub URLs, deployed project URLs, slide deck links) are stored strictly as text metadata in PostgreSQL and rendered on the client as clickable outbound `<a>` links. The backend server never fetches, crawls, proxies, or executes requests against user-provided URLs.

## What's at risk
Server-Side Request Forgery (SSRF) occurs when a backend server fetches arbitrary user-supplied URLs, allowing attackers to access internal cloud metadata services (`http://169.254.169.254`), VPC resources, or internal network services.

## What's already secure
- No server-side HTTP proxying or URL fetching of user inputs.
- All external API calls target hardcoded, trusted service endpoints.

## Recommendations
- If an automated link preview or screenshot generator is added in the future, implement an IP-allowlist validator blocking loopback (`127.0.0.0/8`, `::1`) and metadata IP ranges (`169.254.169.254`).
