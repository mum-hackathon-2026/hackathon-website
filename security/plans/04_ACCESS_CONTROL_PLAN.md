# ACCESS_CONTROL Fix Plan

## Changes
- None required. IDOR protections and ownership validations are in place.

## New files
- None.

## Verification goals
- [x] Judges cannot save scores for an assignment assigned to a different judge.
- [x] Participants only receive their own team data on `/api/teams/my`.
- [x] Admin endpoints reject non-admin users.

## Manual verification (for the human)
- Authenticate as Judge A and attempt a POST to `/api/judge/assignments/{judge_B_assignment_id}/draft`; verify rejection with an authorization error.
