# DEPENDENCY_VULNERABILITIES Fix Plan

## Changes
- Ran `npm audit fix` in `frontend/` to upgrade vulnerable build-time dependencies.

## New files
- None.

## Verification goals
- [x] Transitive dependencies patched.
- [x] All unit tests pass with upgraded packages.

## Manual verification (for the human)
- Run `mvn dependency:check` or `npm audit` periodically in CI pipelines.
