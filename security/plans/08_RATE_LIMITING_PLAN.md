# RATE_LIMITING Fix Plan

## Changes
- Recommended edge rate-limiting rules in Cloud Run / Nginx / Cloudflare.

## New files
- None.

## Verification goals
- [x] Join code endpoint rejects malformed/non-existent codes gracefully without crashing.
- [x] Edge / WAF rate limiting policy documented for deployment.

## Manual verification (for the human)
- When deploying reverse proxy or Cloudflare in front of the backend, configure a rate limiting rule (e.g., 60 req/min per IP).
