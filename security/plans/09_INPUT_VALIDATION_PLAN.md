# INPUT_VALIDATION Fix Plan

## Changes
- None required. Jakarta validation and server-side range bounds checks are active.

## New files
- None.

## Verification goals
- [x] Out-of-bounds scores throw `IllegalArgumentException` / 400 Bad Request.
- [x] Empty strings on required fields are rejected.

## Manual verification (for the human)
- Attempt saving a judge score with value `999`; verify that backend rejects the review submission.
