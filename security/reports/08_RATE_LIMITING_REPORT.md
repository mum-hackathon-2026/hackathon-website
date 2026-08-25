# RATE_LIMITING Security Report

## Status: MEDIUM (Recommended Enhancement)

## Findings
- **Authentication**: `POST /api/auth/google` relies on Google OAuth ID token verification (Google enforces cryptographic nonce and token validation).
- **Brute-Force Risk**: 6-character team join codes (`joinCode`) could be subjected to brute-force enumeration without application-level or gateway-level rate limiting.
- **Edge Deployment**: In cloud environments (Google Cloud Run / Nginx / Cloudflare), edge rate limiting blocks rapid repeated requests before they hit backend workers.

## What's at risk
Without rate limiting on join codes or authentication endpoints, automated scripts could send high-frequency requests to guess join codes or exhaust backend database connections.

## What's already secure
- Google Identity Services token verification offloads primary credential brute-force protection to Google.
- Join codes use randomized character spaces.

## Recommendations
- Configure Cloudflare / Cloud Armor rate limiting at the edge (e.g. max 20 requests/minute on `/api/auth/*` and `/api/teams/join`).
- Optional: Add in-memory or Redis-backed Bucket4j filter for local enforcement.
