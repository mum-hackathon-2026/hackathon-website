# Docs

- `databaseSchema.pdf` — relational schema for all 11 tables, across three slides: accounts/teams/event settings, judging/results/audit, and a table describing what each entity is for.

## What the schema PDF does and does not decide

It is **structural only**. It defines the tables, their columns, the primary keys, the foreign keys, and the unique constraints — and `backend/src/main/resources/db/migration/V1__baseline_schema.sql` matches it column for column.

It does **not** specify data types, `ON DELETE` behaviour, CHECK vocabularies, or team size limits. Those were left to be decided separately, and the sections below track how far that has got.

**The PDF is no longer the whole schema.** `V2__hard_delete_and_status_cleanup.sql`, `V3__form_registration.sql` and `V4__add_user_github_url.sql` changed things the diagram still shows the old way — read V1 through V4, or read the live database, before trusting a slide.

## Ratified — settled, do not reopen

**V2, V3 and V4 closed these.** The migration files carry the full reasoning for each; this is the summary.

### V4 — `users.github_url`, and the two columns that share its name

The registration form collects **three links per person** so an admin can screen applicants before accepting them: a resume (Google Drive), a **GitHub account**, and a LinkedIn profile. V3 added two of the three and missed GitHub; V4 adds it.

- **`users.github_url` is `text` and NULLABLE**, for exactly the reason the V3 columns are: judges and admins are rows in `users` too, are created by hand rather than by the form, and have no GitHub profile. `NOT NULL` would make adding a judge impossible without inventing a value. **Enforcement belongs to the form and the importer.** No CHECK constraint either, for the same reason V3 gives.

> **⚠ There are now two columns called `github_url`, and they are different things.**
>
> | Column | What it is | Written by |
> | ------ | ---------- | ---------- |
> | `users.github_url` | **The person.** Their own GitHub account, collected at registration for screening. | The form importer, once |
> | `submissions.github_url` | **The project.** The repository for what the team built during the hackathon. | The team, while they work |
>
> One is an identity, the other an artefact. A query joining `users` to `submissions` can select both and get a profile URL where it wanted a repo, with nothing to catch it — **always qualify which one you mean.** Both carry a `COMMENT ON COLUMN` saying so, readable with `\d+ users` / `\d+ submissions`. V4 only *comments* `submissions.github_url`; its V1 `submissions_github_url_check` is untouched.

### V3 — registration moved to a Google Form

Registration no longer happens on the site. A Google Form collects **one row per team** — a leader plus up to three more members, 1–4 in total — and captures a name, email, phone number, Google Drive resume link and LinkedIn URL for each person. `backend/.../tools/FormRegistrationImporter.java` reads the exported sheet into the database.

- **`users.google_sub` is nullable.** A `google_sub` only ever comes back from a real OAuth sign-in, so form registration cannot produce one. **A NULL means "registered but has never signed in."** It is filled in on first Google sign-in by matching on email.
- **`users` is the sign-in allowlist.** `AuthController` looks the email up and returns 403 if it is absent, so being in the table *is* the permission. Form-registered people never log in through the form; their row is what later lets them in.
- **The UNIQUE constraint on `google_sub` stayed.** A Postgres unique index treats NULLs as distinct, so any number of pending users coexist while two real Google accounts still collide. Nothing had to be relaxed.
- **Three new columns on `users`: `phone`, `resume_url`, `linkedin_url`, all `text` and all NULLABLE.** The form requires all three of every participant, but **`users` is the accounts table, not the participants table** — judges and admins are rows in it too, are created by hand, and have no resume or LinkedIn. NOT NULL would make adding a judge impossible without inventing values. **Enforcement belongs to the form and the importer, not the database.** Do not "fix" these to NOT NULL; V3 says so at length in a comment.
- **There are no CHECK constraints on the two URL columns**, for the same reason. The importer validates them and can report a readable reason to a human; a constraint violation cannot.

**V3 deliberately did nothing else.** No `submitted` boolean on `teams`, nothing on `submissions`, nothing on `teams.status`. Submission-by-form is undecided, and a second column recording what `submissions.status` already records is precisely the duplication V2 removed.

### V2 — hard delete and status cleanup

- **`users.status` does not exist.** Deletion is a **hard delete**: a deleted user is removed from `users`, not flagged. V1's `'active' / 'suspended' / 'deleted'` column and its CHECK are both dropped. There is no status column to filter on and no `status` field on the `User` entity. The PDF still shows this column — it is gone.
- **`teams.status` is `forming`, `complete`, `disqualified`, `withdrawn`.** `'submitted'` was removed. V1 recorded "this team submitted" in two places that could disagree, with nothing keeping them in step; submission state now lives **only** on `submissions.status`. To find out whether a team submitted, join `submissions` — do not read `teams.status`.
- **`assignments.judge_id` is `ON DELETE CASCADE`** (V1 had `RESTRICT`). Under hard delete, `RESTRICT` would have stopped a judge deleting their own account for as long as they held any assignment. `scores.assignment_id` already cascaded, so deleting a judge now removes their assignments and the scores attached to them.
- **Empty teams are retained.** `team_members.user_id` cascades, so a team whose last member leaves stays behind with no members. Nothing auto-deletes it — no trigger, no cascade, no sweep. The team keeps its UNIQUE name and join code, so the name stays reserved and anyone with the code can rejoin and revive it. This is a decision; V2 documents it in a comment with no DDL attached. Don't "fix" it.

Because deletion is now real, **the `ON DELETE` rules are live behaviour rather than annotation**. Deleting a user cascades away their `team_members` row and, as a judge, their `assignments` and `scores`, and nulls out `teams.created_by`, `event_settings.updated_by`, `notifications_log.user_id` and `audit_log.actor_user_id`. That last one means deleting a user **anonymises their audit trail rather than deleting it** — entries survive with a null actor.

## Importing form registrations

`scripts/sample-form-registration.csv` is a worked example of the expected shape, and doubles as the fixture the importer was verified against.

```powershell
cd backend
# validate without writing anything
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
# and for real
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/registrations.csv"
```

Expected columns, matched **case- and punctuation-insensitively**, with unrecognised columns (Google's `Timestamp`, consent checkboxes) ignored:

```
Team Name
Member 1 Name, Member 1 Email, Member 1 Phone, Member 1 Resume, Member 1 LinkedIn,
Member 1 GitHub
... and the same six for Member 2, Member 3 and Member 4.
```

`Member N GitHub` feeds `users.github_url` — **the person's own account**. The importer matches `github`, `github url`, `github link`, `github profile`, `github account` and `github username`, and deliberately matches nothing containing "project" or "repo", so a form question about a project repository cannot silently land in a participant's profile column.

The importer prints which CSV column fed which field before it touches the database, and **refuses to run unless every member block that appears at all appears whole** — importing someone with a silently-null resume is the worst thing it could do.

The rule is **all six columns or none at all**, and it applies to each of the four blocks:

- **Member 1 is the leader**, every row has one, so its six columns are always required.
- **Members 2–4 may be left out of the form entirely.** A sheet that only ever collects pairs has no Member 3 or Member 4 columns, and that is a legitimate shape — the report says `(no columns - not collected)` and the run proceeds.
- **A block with only some of its columns halts the run.** That is a mis-titled question, not a smaller team: a team with fewer than four members leaves those columns *empty*, it does not omit them. Before this guard existed, a question titled `Member 2 Project GitHub` imported the row, reported `rejected=0` and stored a null GitHub URL the form had actually collected.

**Two columns with the same title also halt the run.** Google Forms lets two questions share a title, and values are keyed by normalised header, so the second column would silently win. Titles differing only in case or punctuation were already refused; exact duplicates now are too.

**It is idempotent, because the form keeps collecting and this gets re-run.** A team whose name is already in the database *and* whose members are exactly the ones in the CSV row is reported as already present and left alone. A team whose name is taken but whose members differ is *rejected*, not merged — that is two teams that picked the same name, and a person has to resolve it. Each team is one transaction, so a team that fails at any step is rolled back whole; there is no such thing as a half-registered team.

`--dry-run` does the identical work and then rolls back instead of committing, so every CHECK, UNIQUE index and foreign key really does fire rather than being approximated.

Rejections are reported per row and never stop the run — duplicate email, a person listed on two teams, a duplicate team name, a team outside 1–4, a malformed email, and a resume, LinkedIn or GitHub value that is not a URL. Every other row still imports; a human reads the report and chases the rest.

The **last line is machine-readable** and its keys are stable, for the day this runs unattended:

```
RESULT mode=live rows=8 imported=2 skipped=0 rejected=6
```

`mode` is in there deliberately — a dry run and a live run otherwise produce identical counts, and a scheduler must never confuse the two.

### Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | The import ran to the end and nothing was rejected. |
| `1` | The import ran to the end, but `rejected=` is non-zero and those rows need a human. **Everything else was still imported** — this is not a failed run, it is a run with follow-up. |
| `2` | **Nothing was imported.** Bad arguments, an unreadable or malformed CSV, a member block missing some of its columns, two columns with the same name, a file with no data rows, or no reachable database. |

A `RESULT` line is printed for `0` and `1` and **never** for `2`, so an unattended caller can rely on the exit code alone and read `rejected=` only when it wants the count. The distinction that matters to a scheduler is `1` versus `2`: after a `1` the database has changed and re-running will report the imported teams as already present; after a `2` nothing happened and the sheet or the environment has to be fixed first.

Connection settings default to the local container as `hackathon_app` (DML only — an importer has no business holding DDL rights) and are overridable via `IMPORT_DB_URL` / `IMPORT_DB_USER` / `IMPORT_DB_PASSWORD`. Prefer those to `--password`, which is visible to anyone who can list processes.

## Unratified — still proposals

`submissions.status` was left untouched by V2 and keeps its full V1 vocabulary, which is a deliberate choice rather than an oversight (removing `'submitted'` from both tables would leave the system unable to record a submission at all) — but the *literals* have still never been signed off. The same holds for the rest below.

These split by how much scrutiny they have actually had:

### Exercised by the frontend, but never formally approved

The frontend codes against these strings verbatim, so they have at least been read and used — but no one has ratified them, and a change here breaks a TypeScript union with nothing but a comment connecting the two.

| Column | Current values |
| ------ | -------------- |
| `users.role` | `participant`, `judge`, `admin` — now also written verbatim in `SecurityConfig` (`hasAuthority("admin")`, `hasAuthority("judge")`) and issued as a JWT claim, so a change here moves who can reach `/api/admin/**` as well as breaking a TypeScript union |
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

See the PR for `feature/db-baseline-schema` for V1's originally proposed values, and `V2__hard_delete_and_status_cleanup.sql` and `V3__form_registration.sql` for what changed since.

## Reading the live vocabulary

Rather than trusting this file, ask the database:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```

The `Check constraints` block lists the permitted values as Postgres currently enforces them.
