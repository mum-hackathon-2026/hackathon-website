# SECRETS_EXPOSURE Fix Plan

## Changes
- None required. All current configurations adhere to strict secrets management standards.

## New files
- None.

## Verification goals
- [x] `.env` and `.env.local` are not tracked by git.
- [x] No live secret tokens or passwords exist in source files.
- [x] `application-example.properties` has placeholder values only.
- [x] Frontend bundles contain no private API keys.

## Manual verification (for the human)
- When deploying to staging or production, inject `APP_JWT_SECRET` and `APP_GOOGLE_CLIENT_ID` via server environment variables, never committing them to git.
