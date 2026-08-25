# INPUT_VALIDATION Security Report

## Status: PASS

## Findings
- **Jakarta Bean Validation**: Backend incoming DTO records use Jakarta validation annotations (`@NotNull`, `@NotBlank`, `@Size`, `@Valid`) on all mutation endpoints.
- **Business Bounds Validation**:
  - Score bounds (0 <= score <= maxScore) are enforced in `JudgeBackendService.java`.
  - Team name and participant string inputs are validated against database check constraints (e.g. `team_name_length_check CHECK (length(name) between 1 and 100)`).
  - Webhook registration inputs validate email format, non-empty full names, and participant IDs.

## What's at risk
Unvalidated inputs can lead to application crashes, negative scores, database constraint violations, or unexpected business state corruption.

## What's already secure
- Strong type-safety with Java 21 records.
- Server-side range checks and non-null guarantees.
- Database CHECK constraints mirroring application layer constraints.

## Recommendations
- Retain unit tests covering boundary values (e.g. score = -1, score = 11 for maxScore = 10).
