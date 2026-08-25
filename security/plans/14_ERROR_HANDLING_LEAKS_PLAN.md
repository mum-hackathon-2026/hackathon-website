# ERROR_HANDLING_LEAKS Fix Plan

## Changes
- `backend/.../common/GlobalExceptionHandler.java` — Created centralized error response handler.

## New files
- `backend/src/main/java/my/monash/hackathon/hackathon_website_backend/common/GlobalExceptionHandler.java`

## Verification goals
- [x] Unhandled exceptions return generic 500 JSON without stack traces.
- [x] Validation errors return clean field-level messages without internal implementation details.

## Manual verification (for the human)
- Trigger a 500 error on an unhandled route; inspect response body to confirm zero stack trace output.
