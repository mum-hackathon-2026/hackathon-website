# Docs

- `databaseSchema.pdf` — relational schema for all 11 tables, across three slides: accounts/teams/event settings, judging/results/audit, and a table describing what each entity is for.

## What the schema PDF does and does not decide

It is **structural only**. It defines the tables, their columns, the primary keys, the foreign keys, and the unique constraints — and `backend/src/main/resources/db/migration/V1__baseline_schema.sql` matches it column for column.

It does **not** specify data types, `ON DELETE` behaviour, CHECK vocabularies, or team size limits. Those were left to be decided separately, and the sections below track how far that has got.

**The PDF is no longer the whole schema.** `V2__hard_delete_and_status_cleanup.sql` changed things the diagram still shows the old way — read V1 *and* V2, or read the live database, before trusting a slide.

## Ratified — settled, do not reopen

**V2 closed these.** The migration file carries the full reasoning for each; this is the summary.

- **`users.status` does not exist.** Deletion is a **hard delete**: a deleted user is removed from `users`, not flagged. V1's `'active' / 'suspended' / 'deleted'` column and its CHECK are both dropped. There is no status column to filter on and no `status` field on the `User` entity. The PDF still shows this column — it is gone.
- **`teams.status` is `forming`, `complete`, `disqualified`, `withdrawn`.** `'submitted'` was removed. V1 recorded "this team submitted" in two places that could disagree, with nothing keeping them in step; submission state now lives **only** on `submissions.status`. To find out whether a team submitted, join `submissions` — do not read `teams.status`.
- **`assignments.judge_id` is `ON DELETE CASCADE`** (V1 had `RESTRICT`). Under hard delete, `RESTRICT` would have stopped a judge deleting their own account for as long as they held any assignment. `scores.assignment_id` already cascaded, so deleting a judge now removes their assignments and the scores attached to them.
- **Empty teams are retained.** `team_members.user_id` cascades, so a team whose last member leaves stays behind with no members. Nothing auto-deletes it — no trigger, no cascade, no sweep. The team keeps its UNIQUE name and join code, so the name stays reserved and anyone with the code can rejoin and revive it. This is a decision; V2 documents it in a comment with no DDL attached. Don't "fix" it.

Because deletion is now real, **the `ON DELETE` rules are live behaviour rather than annotation**. Deleting a user cascades away their `team_members` row and, as a judge, their `assignments` and `scores`, and nulls out `teams.created_by`, `event_settings.updated_by`, `notifications_log.user_id` and `audit_log.actor_user_id`. That last one means deleting a user **anonymises their audit trail rather than deleting it** — entries survive with a null actor.

## Unratified — still proposals

`submissions.status` was left untouched by V2 and keeps its full V1 vocabulary, which is a deliberate choice rather than an oversight (removing `'submitted'` from both tables would leave the system unable to record a submission at all) — but the *literals* have still never been signed off. The same holds for the rest below.

These split by how much scrutiny they have actually had:

### Exercised by the frontend, but never formally approved

The frontend codes against these strings verbatim, so they have at least been read and used — but no one has ratified them, and a change here breaks a TypeScript union with nothing but a comment connecting the two.

| Column | Current values |
| ------ | -------------- |
| `users.role` | `participant`, `judge`, `admin` |
| `submissions.status` | `draft`, `submitted`, `withdrawn`, `disqualified` |
| `team_results.outcome` | `winner`, `runner_up`, `finalist`, `participant`, `disqualified` |

### Never reviewed at all

**No one has looked at these.** They exist only because V1 had to write something. There is no judge page and no admin page yet, so nothing consumes them and nothing has pushed back on them. Treat them as a first draft, and expect to revise them when those pages are designed.

| Column | Current values |
| ------ | -------------- |
| `assignments.status` | `pending`, `in_progress`, `completed`, `declined` |
| `notifications_log.type` | `team_invite`, `team_joined`, `submission_receipt`, `deadline_reminder`, `judge_assignment`, `results_published` |
| `notifications_log.status` | `pending`, `sent`, `failed`, `bounced` |

### Not vocabularies, but still open

- **Column data types** — e.g. `audit_log.details` is implemented as `jsonb`; the diagram just says `details`.
- **`ON DELETE` behaviour beyond what V2 settled.** V2 ratified `assignments.judge_id` and the hard-delete cascade set that follows from it. The remaining rules were written in V1 and have not been separately reviewed.
- **Team size limits** — `min_team_size` and `max_team_size` are seeded as 1 and 4, which no document confirms.

Additionally, `created_at` on `users`, `teams` and `judging_criteria` is an addition beyond the diagram. (`audit_log.created_at` is in the diagram.)

See the PR for `feature/db-baseline-schema` for V1's originally proposed values, and `V2__hard_delete_and_status_cleanup.sql` for what changed since.

## Reading the live vocabulary

Rather than trusting this file, ask the database:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```

The `Check constraints` block lists the permitted values as Postgres currently enforces them.
