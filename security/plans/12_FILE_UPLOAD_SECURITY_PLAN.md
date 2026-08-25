# FILE_UPLOAD_SECURITY Fix Plan

## Changes
- None required. Application relies on external hosted URLs.

## New files
- None.

## Verification goals
- [x] No `MultipartFile` or `/upload` routes exist in the backend.

## Manual verification (for the human)
- Verify submission forms only accept URL links.
