# XSS_VULNERABILITIES Fix Plan

## Changes
- None required. Angular's built-in sanitizer and interpolation protect against script injections.

## New files
- None.

## Verification goals
- [x] HTML entity strings in inputs (`<script>alert(1)</script>`) render as plain text without execution.
- [x] No `bypassSecurityTrust` APIs exist in the codebase.

## Manual verification (for the human)
- Enter `<img src=x onerror=alert('xss')>` as a team name; verify that it renders safely as text without triggering an alert box.
