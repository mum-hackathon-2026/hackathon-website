# AUTH_MIDDLEWARE Fix Plan

## Changes
- None required. All routes are mapped with appropriate authorization policies.

## New files
- None.

## Verification goals
- [x] Unauthenticated calls to `/api/teams/my` return 401.
- [x] Participant calls to `/api/admin/overview` return 403.
- [x] Participant calls to `/api/judge/assignments` return 403.
- [x] Admin calls to `/api/admin/overview` succeed with 200.

## Manual verification (for the human)
- Test calling `/api/admin/overview` with a participant Bearer token; verify HTTP 403 Forbidden is returned.
