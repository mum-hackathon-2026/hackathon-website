# SSRF_PREVENTION Fix Plan

## Changes
- None required. No user-controlled outbound HTTP fetching exists.

## New files
- None.

## Verification goals
- [x] Outbound HTTP requests only target trusted Google endpoints.
- [x] Submission URLs are treated as inert strings.

## Manual verification (for the human)
- Submit a project URL pointing to `http://169.254.169.254`; verify that the backend merely stores the string without making any network request to that address.
