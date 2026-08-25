# SQL_INJECTION Fix Plan

## Changes
- None required. All repository methods use safe parameterized JPA queries.

## New files
- None.

## Verification goals
- [x] All 11 repositories use typed JPA methods or parameterized parameters.
- [x] No `Statement` or raw SQL concatenation is present.

## Manual verification (for the human)
- Attempt sending SQL injection payloads (e.g. `' OR '1'='1`) in search / name inputs; verify they are treated as literal search strings.
