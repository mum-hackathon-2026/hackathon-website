# SESSION_MANAGEMENT Fix Plan

## Changes
- None required. JJWT HMAC-SHA256 token verification is secure.

## New files
- None.

## Verification goals
- [x] Expired tokens are rejected with authentication failure.
- [x] Altered payload claims cause signature validation failure.

## Manual verification (for the human)
- Alter a single character in a JWT token string and call `/api/teams/my`; verify the request is rejected with 401.
