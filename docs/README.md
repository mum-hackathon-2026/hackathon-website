# Docs

- `databaseSchema.pdf` — relational schema for all 11 tables, across three slides: accounts/teams/event settings, judging/results/audit, and a table describing what each entity is for.

## What the schema PDF does and does not decide

It is **structural only**. It defines the tables, their columns, the primary keys, the foreign keys, and the unique constraints — and the implemented schema in `backend/src/main/resources/db/migration/V1__baseline_schema.sql` matches it column for column.

It does **not** specify any of the following, so these are still open team decisions and the values currently in `V1` are proposals awaiting sign-off:

- **Column data types** — e.g. `audit_log.details` is implemented as `jsonb`; the diagram just says `details`.
- **`ON DELETE` behaviour** — whether deleting a team removes its assignments, whether a judge with assignments can be deleted, and so on.
- **CHECK vocabularies** — the exact permitted strings for `users.role`, `users.status`, `teams.status`, `submissions.status`, `assignments.status`, `team_results.outcome`, `notifications_log.type` and `notifications_log.status`. These matter most, because the frontend will code against those literal values.
- **Team size limits** — `min_team_size` and `max_team_size` are seeded as 1 and 4, which no document confirms.

Additionally, `created_at` on `users`, `teams` and `judging_criteria` is an addition beyond the diagram. (`audit_log.created_at` is in the diagram.)

See the PR for `feature/db-baseline-schema` for the full list of proposed values.
