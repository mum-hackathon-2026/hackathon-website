# ACCESS_CONTROL Security Report

## Status: PASS

## Findings
- **Resource Ownership Verification**:
  - Participant routes (e.g. `GET /api/teams/my`) fetch data scoped strictly to `currentUser.getId()` extracted from the authenticated JWT.
  - Judge evaluation routes (e.g. `POST /api/judge/assignments/{assignmentId}/draft`, `complete`, `decline`) pass through `getVerifiedAssignment()` which explicitly verifies `assignment.getJudge().getId().equals(judge.getId())` before performing read or write operations.
  - Results endpoints (e.g. `GET /api/results/my`) resolve results scoped strictly to the team associated with the authenticated principal.
- **Admin Isolation**: Admin resource mutations (`/api/admin/teams/{id}`, `/api/admin/assignments`, `/api/admin/settings`) require `hasAuthority("admin")`.

## What's at risk
Insecure Direct Object References (IDOR) could allow judges to modify or view evaluations of teams not assigned to them, or allow participants to view other squads' private draft submissions.

## What's already secure
- Explicit ownership checks on all parameterized mutation routes.
- Principal-derived queries rather than client-supplied user ID parameters.

## Recommendations
- Continue writing integration tests simulating cross-user IDOR access attempts to ensure 403 / 400 responses are returned.
