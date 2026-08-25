# CORS_AND_HEADERS Security Report

## Status: PASS

## Findings
- **CORS Configuration**: CORS policy configured via `UrlBasedCorsConfigurationSource` restricting allowed origins to local development (`http://localhost:4200`, `http://localhost:8080`) and official production Firebase/Web App hosting domains (`https://monash-hackathon-2026.web.app`, `https://*.web.app`, `https://*.firebaseapp.com`).
- **HTTP Security Headers**:
  - `X-Frame-Options: DENY` (prevents clickjacking via malicious iframe embedding).
  - `X-Content-Type-Options: nosniff` (prevents MIME-type sniffing attacks).
  - Content Security Policy and SSL/TLS headers ready for CDN/edge termination.

## What's at risk
Permissive CORS (`*` with credentials) or missing frame options can expose API responses to malicious third-party websites or enable clickjacking attacks.

## What's already secure
- Restricted origin patterns for CORS.
- Frame options DENY enabled in Spring Security filter chain.
- No wildcard origins with credentials enabled.

## Recommendations
- Enforce Strict-Transport-Security (HSTS) headers at the edge reverse proxy / CDN in production.
