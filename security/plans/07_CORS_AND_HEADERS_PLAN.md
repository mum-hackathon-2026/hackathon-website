# CORS_AND_HEADERS Fix Plan

## Changes
- `backend/.../auth/SecurityConfig.java` — Added `frameOptions.deny()` and `contentTypeOptions()`, expanded allowed origin patterns to production web domains.

## New files
- None.

## Verification goals
- [x] Pre-flight OPTIONS requests return correct Access-Control-Allow-Origin headers.
- [x] Disallowed origins are rejected by CORS filter.
- [x] Security headers `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` are present on responses.

## Manual verification (for the human)
- Attempt embedding the website in an `<iframe>` on an external domain; verify the browser blocks rendering due to `X-Frame-Options: DENY`.
