# CSRF_PROTECTION Fix Plan

## Changes
- None required. Bearer JWT design is inherently safe from CSRF.

## New files
- None.

## Verification goals
- [x] State-changing POST/PUT requests without `Authorization: Bearer` header return 401.
- [x] No state-changing actions rely on ambient session cookies.

## Manual verification (for the human)
- Create a test HTML page with an external form posting to `/api/teams/create`; verify the backend rejects the unauthenticated POST request.
