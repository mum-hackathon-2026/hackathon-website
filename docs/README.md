# Docs

- `databaseSchema.pdf` — relational schema for all 11 tables, across three slides: accounts/teams/event settings, judging/results/audit, and a table describing what each entity is for.

## What the schema PDF does and does not decide

It is **structural only**. It defines the tables, their columns, the primary keys, the foreign keys, and the unique constraints — and `backend/src/main/resources/db/migration/V1__baseline_schema.sql` matches it column for column.

It does **not** specify data types, `ON DELETE` behaviour, CHECK vocabularies, or team size limits. Those were left to be decided separately, and the sections below track how far that has got.

**The PDF is no longer the whole schema.** `V2__hard_delete_and_status_cleanup.sql`, `V3__form_registration.sql`, `V4__add_user_github_url.sql`, `V5__submission_additional_fields.sql`, `V6__team_size_two_to_five.sql`, `V7__seed_judging_criteria.sql` and `V8__judges_per_team_setting.sql` changed things the diagram still shows the old way — read V1 through **V8**, or read the live database, before trusting a slide.

## Ratified — settled, do not reopen

**V2 through V8 closed these.** The migration files carry the full reasoning for each; this is the summary.

### V8 — `event_settings.judges_per_team`

`judges_per_team integer not null default 3`, CHECKed to 1–10 on the singleton row. It is how many judges the admin Assignments section expects each team to draw, and it follows the V6 pattern: **a policy number in `event_settings`, not a constant in code**.

- **This one has a real column DEFAULT (`3`) and `EventSettings.judgesPerTeam` initialises to `3` to mirror it.** That is the convention CLAUDE.md describes — Hibernate always names the column in the INSERT, so the database DEFAULT never fires and the initialiser is what actually applies. Change one, change the other.
- The migration is written with `if not exists` / `drop constraint if exists`, so it is re-runnable. Flyway still only applies it once.

### V7 — the judging criteria are seeded, and the seed is destructive

`V7__seed_judging_criteria.sql` installs the Averis 2026 preliminary-round rubric: **seven active criteria totalling 100 points, split 70 technical / 30 product.**

- **It opens with `delete from scores;` and `delete from judging_criteria;`.** On a fresh database that is a no-op. On a database that already holds judging, it destroys every score that has been given. It is safe as applied — nothing had been scored when it landed — and it is **not a pattern to copy**: if the rubric changes again mid-event, write an `update` migration, or add new rows and set `is_active = false` on the old ones.
- **`Score` snapshots `max_score` and `weight` at the moment it is written**, so criteria edited *after* scoring do not retroactively invalidate scores. That protection does not extend to deleting the criteria rows, which is why the `delete` above matters.
- One criterion is explicitly provisional: **`Technology Integration (TBC)`**, 15 points, is a placeholder pending sponsor alignment. Its title says so. It is `is_active = true`, so judges see it.

### V6 — team size is 2–5, and it lives in `event_settings`

The proposal's team-size conflict is settled: **teams are 2 to 5 people. Solo entries are no longer accepted.**

- **`V6__team_size_two_to_five.sql` is an `UPDATE`, not an `INSERT`.** V1 seeds the `event_settings` singleton at `id = 1`, so the row already exists; V6 corrects `min_team_size` to 2 and `max_team_size` to 5 on it.
- **V1's seed still says 1 / 4, deliberately.** V1 is immutable — editing its seed would change its checksum and break every database that has already applied it. A fresh database runs V1 (1/4) then V6 (2/5); an existing one runs V6 alone. Both finish at 2/5.
- **No constraint changed.** V1's `check (min_team_size >= 1 and min_team_size <= max_team_size)` already admits 2 / 5. The range is a policy the organisers set, not a shape the schema fixes.
- **The column DEFAULTs are still `1` and `4`.** V6 changes the seeded row, not the DEFAULT, so `EventSettings`'s `minTeamSize = 1` / `maxTeamSize = 4` field initialisers still match the DEFAULT they mirror. Do not "fix" them.

> **These two columns are now the only place the limits live.** `FormRegistrationImporter` reads both from the singleton row at import time; it used to carry its own constant, which is exactly why this policy change needed a code edit at all. There is no fallback: **if the row is missing or either value is null the importer aborts with exit `2` and imports nothing**, because importing a season's registrations against guessed limits is worse than not importing them.
>
> **Changing the limits again is an `UPDATE` plus a form change — no code change.** Update `event_settings`, then add or remove the matching `Member N: ...` block on the Google Form.

### V5 — the submission form's extra fields

`submissions` gained `slide_deck_url`, `video_demo_url`, `representative_name`, `representative_phone` and `representative_email`, all nullable.

- **The two URL columns carry `~ '^https?://'` CHECKs**; the three `representative_*` columns carry none — they are free text the form collects, and the same argument V3 makes about `users.resume_url` applies.
- These are what `tools/FormSubmissionImporter` writes. **The “no submission importer” note further down this file is out of date** — see *Importing form submissions*.

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

Registration no longer happens on the site. A Google Form collects **one row per team** — a leader plus up to four more members, **2–5 in total** — and captures a name, email, phone number, Google Drive resume link and LinkedIn URL for each person. `backend/.../tools/FormRegistrationImporter.java` reads the exported sheet into the database.

- **`users.google_sub` is nullable.** A `google_sub` only ever comes back from a real OAuth sign-in, so form registration cannot produce one. **A NULL means "registered but has never signed in."** It is filled in on first Google sign-in by matching on email.
- **`users` is the sign-in allowlist.** `AuthController` looks the email up and returns 403 if it is absent, so being in the table *is* the permission. Form-registered people never log in through the form; their row is what later lets them in.
- **The UNIQUE constraint on `google_sub` stayed.** A Postgres unique index treats NULLs as distinct, so any number of pending users coexist while two real Google accounts still collide. Nothing had to be relaxed.
- **Three new columns on `users`: `phone`, `resume_url`, `linkedin_url`, all `text` and all NULLABLE.** The form requires all three of every participant, but **`users` is the accounts table, not the participants table** — judges and admins are rows in it too, are created by hand, and have no resume or LinkedIn. NOT NULL would make adding a judge impossible without inventing values. **Enforcement belongs to the form and the importer, not the database.** Do not "fix" these to NOT NULL; V3 says so at length in a comment.
- **There are no CHECK constraints on the two URL columns**, for the same reason. The importer validates them and can report a readable reason to a human; a constraint violation cannot.

**V3 deliberately did nothing else.** No `submitted` boolean on `teams`, nothing on `submissions`, nothing on `teams.status`. A second column recording what `submissions.status` already records is precisely the duplication V2 removed, and that still holds. **Submission-by-form is no longer undecided** — V5 added the columns and `tools/FormSubmissionImporter` fills them; see *Importing form submissions*.

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
# validate without writing anything (CSV mode)
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
# and for real (CSV mode)
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/registrations.csv"

# read directly from Google Sheets API
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --dry-run"
# live import directly from Google Sheets API
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4"
```

For Google Sheets API setup, service account creation, and sheet permissions, see [SHEETS-SETUP.md](SHEETS-SETUP.md).

Expected columns, matched **case- and punctuation-insensitively**, with unrecognised columns (Google's `Timestamp`, consent checkboxes) ignored:

```
Team Name
Member 1 Name, Member 1 Email, Member 1 Phone, Member 1 Resume, Member 1 LinkedIn,
Member 1 GitHub
... and the same six for Member 2, Member 3, Member 4 and Member 5.
```

`Member N GitHub` feeds `users.github_url` — **the person's own account**. The importer matches `github`, `github url`, `github link`, `github profile`, `github account` and `github username`, and deliberately matches nothing containing "project" or "repo", so a form question about a project repository cannot silently land in a participant's profile column.

The importer prints which CSV column fed which field before it touches the database, and **refuses to run unless every member block that appears at all appears whole** — importing someone with a silently-null resume is the worst thing it could do.

The rule is **all six columns or none at all**, and it applies to each of the five blocks:

- **Member 1 is the leader**, every row has one, so its six columns are always required.
- **Members 2–5 may be left out of the form entirely.** A sheet that only ever collects pairs has no Member 3, 4 or 5 columns, and that is a legitimate shape — the report says `(no columns - not collected)` and the run proceeds. How many blocks are permitted is read from `event_settings.max_team_size`, not fixed in code.
- **A block with only some of its columns halts the run.** That is a mis-titled question, not a smaller team: a team smaller than the maximum leaves those columns *empty*, it does not omit them. Before this guard existed, a question titled `Member 2 Project GitHub` imported the row, reported `rejected=0` and stored a null GitHub URL the form had actually collected.

**Two columns with the same title also halt the run.** Google Forms lets two questions share a title, and values are keyed by normalised header, so the second column would silently win. Titles differing only in case or punctuation were already refused; exact duplicates now are too.

**It is idempotent, because the form keeps collecting and this gets re-run.** A team whose name is already in the database *and* whose members are exactly the ones in the CSV row is reported as already present and left alone. A team whose name is taken but whose members differ is *rejected*, not merged — that is two teams that picked the same name, and a person has to resolve it. Each team is one transaction, so a team that fails at any step is rolled back whole; there is no such thing as a half-registered team.

`--dry-run` does the identical work and then rolls back instead of committing, so every CHECK, UNIQUE index and foreign key really does fire rather than being approximated.

Rejections are reported per row and never stop the run — duplicate email, a person listed on two teams, a duplicate team name, a team outside the permitted size, a malformed email, and a resume, LinkedIn or GitHub value that is not a URL. Every other row still imports; a human reads the report and chases the rest.

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

## Importing form submissions

`tools/FormSubmissionImporter` is the registration importer's sibling: same CSV-or-Sheets input, same `0` / `1` / `2` exit codes, writing into `submissions` instead of `users` / `teams` / `team_members`. It matches a row to a team by team name or by the submitter's email, and it **updates** an existing submission rather than rejecting it — a team that resubmits overwrites its own row, which is the behaviour a Google Form that allows edits needs.

It fills the V5 columns (`slide_deck_url`, `video_demo_url`, `representative_name`, `representative_phone`, `representative_email`) alongside V1's `project_title`, `description`, `github_url`, `track_label`, `status` and `submitted_at`.

## Running the importers from inside the app

**Neither importer is command-line-only any more.** `webhook/RegistrationImportService` and `webhook/SubmissionImportService` wrap them as Spring beans, and each has two triggers:

- a **webhook** — `POST /api/webhooks/forms/registration` and `POST /api/webhook/submissions`, both `permitAll` in `SecurityConfig`, both driven by an Apps Script `onFormSubmit` trigger (see [SHEETS-SETUP.md](SHEETS-SETUP.md) §7);
- a **`@Scheduled` poll** on `app.sheets.poll-interval-ms`, **default 15 000 ms**. A running backend re-reads its sheet every 15 seconds regardless of the webhook.

Two things to know before running the backend locally:

- **The sheet ids are committed in `application.properties`** and point at the team's live sheets, so every checkout that starts the backend polls them. Blanking `app.sheets.sheet-id` / `app.sheets.submission-sheet-id` in `application-local.properties` is the off switch — there is no separate enable flag.
- **`app.webhook.secret` ships blank**, and the controller only checks `X-Webhook-Secret` when the property is non-blank. As committed, the webhook is unauthenticated. Set a real secret in anything deployed.

## Screening: what rejects a registration today

There is **no configurable auto-reject filter**, and `event_settings.screening_enabled` is a column that **nothing reads**. Three separate mechanisms get mistaken for one:

| | What it is | Where | Configurable? |
| - | ---------- | ----- | ------------- |
| Row validation | Refuses to import a malformed row | `tools/TeamRow` | No — hardcoded, except team size |
| Eligibility filter | Filters the admin Participants **table** | `admin-participants.ts` | It is a view control, not a policy |
| `screening_enabled` | A boolean an admin can toggle | `event_settings` | **No consumer at all** |

`TeamRow` **rejects** on: missing team name; team name over 120 characters; no member blocks; team size outside `event_settings`'s min/max; a member with no name or a name over 200 characters; a member with no email, a malformed email, or one outside 3–320 characters; a resume, LinkedIn or GitHub value that is **present but is not an `http(s)://` URL**; and the same email listed twice inside one team. The importer adds: a duplicate team name, a person already on another team, and a team already present with different members.

`TeamRow` **warns but still imports** when a member leaves phone, resume, LinkedIn or GitHub **blank**. That is deliberate — `validateUrl` argues it in a comment: a value that is present but wrong is a mistake to chase, an absent one is a nullable column doing its job, and refusing a whole team over one blank box blocks a registration the organisers would rather have.

**So "resume left empty" imports today.** If that should become a rejection, the change belongs in `TeamRow.validateBlock`, with the policy read from `event_settings` beside the size limits — the pattern V6 established, so tightening the rule is an `UPDATE` and not a recompile. Two design questions have to be answered first, and neither is a code question:

1. **Per-field or one switch?** `screening_enabled` as a single boolean is the cheapest thing to wire, but "require a resume" and "require a LinkedIn" are not obviously the same decision.
2. **Rejected means what?** Today a rejected row is simply *not imported*, and `users` is the sign-in allowlist — so the person cannot sign in and is never told why. There is no `rejected` state on any table and no notification path (`notifications_log` still has no consumer). Rejecting silently at import time and rejecting visibly are different features.

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

**No one formally ratified these**, and that has become more pressing rather than less. When this was written nothing consumed them; the judge portal and the admin workspace now both do. `assignments.status` is read and written by `JudgeController` / `AdminBackendService` and rendered by `app-status-pill` — it took V1's proposal verbatim rather than ratifying it. The two `notifications_log` vocabularies still have **no consumer at all**: nothing writes a notification row, so there is no notification path anywhere in the system.

| Column | Current values |
| ------ | -------------- |
| `assignments.status` | `pending`, `in_progress`, `completed`, `declined` |
| `notifications_log.type` | `team_invite`, `team_joined`, `submission_receipt`, `deadline_reminder`, `judge_assignment`, `results_published` |
| `notifications_log.status` | `pending`, `sent`, `failed`, `bounced` |

### Not vocabularies, but still open

- **Column data types** — e.g. `audit_log.details` is implemented as `jsonb`; the diagram just says `details`.
- **`event_settings.screening_enabled`** — a settable boolean with no consumer. See *Screening: what rejects a registration today*.
- **`judging_criteria`'s seeded rubric** — V7 seeds seven criteria, one of which is titled `Technology Integration (TBC)` and is explicitly pending sponsor alignment.
- **`ON DELETE` behaviour beyond what V2 settled.** V2 ratified `assignments.judge_id` and the hard-delete cascade set that follows from it. The remaining rules were written in V1 and have not been separately reviewed.
- ~~**Team size limits**~~ — **settled by V6.** See the ratified section above.

Additionally, `created_at` on `users`, `teams` and `judging_criteria` is an addition beyond the diagram. (`audit_log.created_at` is in the diagram.)

See the PR for `feature/db-baseline-schema` for V1's originally proposed values, and `V2__hard_delete_and_status_cleanup.sql` and `V3__form_registration.sql` for what changed since.

## Reading the live vocabulary

Rather than trusting this file, ask the database:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```

The `Check constraints` block lists the permitted values as Postgres currently enforces them.
