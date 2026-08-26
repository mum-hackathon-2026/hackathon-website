# Project status

**Repo:** `mum-hackathon-2026/hackathon-website` — this file is `docs/PROJECT-STATUS.md`; paths below are relative to the git root.
**As of:** `34f6df7` (= `origin/main`, through PR #76), 2026-08-26.
**Verified:** read from the source tree on `docs/align-current-state`. **Neither suite was run for this pass** — the figures in [§7](#7-verification) are carried forward and are older than the code they describe. Treat every test count below as a lower bound of unknown age.

This is the **progress tracker**: what is built, what is not, and what comes next. It does not explain *how* anything works — [CLAUDE.md](../CLAUDE.md) holds the conventions and [docs/README.md](README.md) holds the schema decisions. When a fact here needs detail, this file points at one of those rather than repeating it. See [§8](#8-where-the-detail-lives).

---

## 1. At a glance

| Area | State | One line |
| ---- | ----- | -------- |
| **Database** | 🟢 Done | 11 tables across V1–V8, live and migrating cleanly |
| **Backend persistence** | 🟢 Done | All 11 tables mapped, 11 repositories, 22 test classes |
| **Backend API** | 🟢 Built | 9 controllers, ~40 endpoints — teams, submissions, judging, results, admin, event settings, webhooks |
| **Backend security** | 🔴 Two holes | `SecurityConfig` + JWT filter are sound, but `POST /api/auth/dev-login` mints an admin token for anyone and the webhook secret ships blank. **Still zero tests in `auth/`** |
| **Frontend pages** | 🟢 Done | 12 components behind 15 route entries, all three roles covered |
| **Admin workspace** | 🟢 10 of 10 | Overview, Teams, Participants, Judges, Assignments, Submissions, Judging, Results, Audit, Settings |
| **Frontend data** | 🟢 Live | All 7 core services are `HttpClient` callers; the in-memory stand-ins are gone |
| **Integration** | 🟢 Wired | Every page reads the database. Registration and submission both sync from Google Sheets |
| **Import pipeline** | 🟡 Works, unguarded | Two importers, each on a webhook **and** a 15-second poll against sheet ids committed in `application.properties` |
| **Screening / auto-reject** | 🔴 Not built | `event_settings.screening_enabled` has no consumer; a blank resume imports |
| **CI** | 🔴 Red | Two jobs, both gating — and **`npm run lint` currently fails on `main` with 31 errors** |
| **Docs** | 🟡 Realigned here | Had drifted 89 commits (PRs #62–#76). This pass is the correction; the test figures in §7 are still stale |
| **Deployment** | 🟡 Documented | Production `Dockerfile`s for both halves + `docs/GCP_DEPLOYMENT_GUIDE.md`. Not yet deployed |

**The single most important line:** the application is functionally complete and **not yet safe to expose**. `POST /api/auth/dev-login` is unauthenticated and returns a signed admin JWT to any caller; the registration webhook accepts any caller because `app.webhook.secret` is committed blank; and the `auth/` package — the only code that decides who gets in — still has no test. The 17-category audit under `security/` marks 16 of 17 PASS and mentions none of this. [§6](#6-what-comes-next) is reordered around it.

---

## 2. Backend — what is done

### Schema and migrations

- [x] **V1 `V1__baseline_schema.sql`** — creates all 11 tables, seeds the `event_settings` singleton inert (registration windows null, judging closed, nothing published)
- [x] **V2 `V2__hard_delete_and_status_cleanup.sql`** — ratifies hard delete, the `teams.status` cleanup, and the judge cascade
- [x] **V3 `V3__form_registration.sql`** — registration moves to a Google Form: `users.google_sub` becomes nullable (NULL = registered, never signed in), and `phone` / `resume_url` / `linkedin_url` are added, all nullable because judges and admins are rows in `users` too
- [x] **V4 `V4__add_user_github_url.sql`** — adds `users.github_url`, the third screening link the form collects and the one V3 missed. Nullable for the same reason. **Not the same column as `submissions.github_url`** — that is a team's project repo, this is a participant's own account; both are now commented in the database to keep them apart
- [x] **V5 `V5__submission_additional_fields.sql`** — `submissions` gains `slide_deck_url`, `video_demo_url`, `representative_name`, `representative_phone`, `representative_email`. The two URL columns carry `~ '^https?://'` CHECKs.
- [x] **V6 `V6__team_size_two_to_five.sql`** — the `event_settings` singleton moves to `min_team_size` 2 / `max_team_size` 5. **An `UPDATE`, not a DEFAULT change** — the column DEFAULTs stay 1 / 4 and the entity initialisers correctly mirror them.
- [x] **V7 `V7__seed_judging_criteria.sql`** — seeds the Averis 2026 preliminary rubric: seven criteria, 100 points, 70 technical / 30 product. ⚠️ **It opens with `delete from scores` and `delete from judging_criteria`.** Harmless as applied; destructive if ever re-run against a scored database. One criterion, `Technology Integration (TBC)`, is a live placeholder pending sponsor alignment.
- [x] **V8 `V8__judges_per_team_setting.sql`** — `event_settings.judges_per_team`, `not null default 3`, CHECKed 1–10. `EventSettings.judgesPerTeam = 3` mirrors the DEFAULT as the convention requires.
- [x] Conventions held throughout V1: `bigint generated always as identity`, `timestamptz`, `text` + `CHECK` over `varchar(n)`, no Postgres `ENUM` types, `numeric` for scored values, every FK index-backed
- [x] **Two Postgres roles with a privilege split** (`scripts/bootstrap.sql`) — `hackathon_migrator` owns the schema and runs Flyway; `hackathon_app` is DML-only with no DDL
- [x] Local Postgres 16 in Docker (`hackathon-pg16`) on **5433**

The 11 tables: `users`, `event_settings`, `teams`, `team_members`, `submissions`, `judging_criteria`, `assignments`, `scores`, `team_results`, `notifications_log`, `audit_log`.

### Entities and repositories

- [x] **11 `@Entity` classes**, one per table, in feature packages under `my.monash.hackathon.hackathon_website_backend` — `user/`, `team/`, `event/`, `submission/`, `judging/`, `result/`, `notification/`, `audit/`
- [x] **11 Spring Data repositories**, deliberately thin — `JpaRepository` plus derived queries only. **No `@Query` anywhere in the codebase.**
- [x] Schema rules encoded in the mappings rather than left to convention: `@MapsId` shared primary keys on `TeamMember` / `Submission` / `TeamResult`, the `EventSettings` singleton, `Score`'s criterion snapshot, `jsonb` on `AuditLog.details`, `@Version` on `Team` and `Submission`

> Each of those encodes a constraint that a naive entity would silently discard. Before editing one, read *Mappings that encode a schema rule* in [CLAUDE.md](../CLAUDE.md).

### Authentication (PRs #32, #34)

Nine classes in `auth/`, which owns no table of its own. It was the first HTTP surface and is no longer the only one — see *The rest of the API* below.

- [x] **`POST /api/auth/google`** — verifies a Google ID token against Google's keys, requires a verified email, looks the address up in `users`, backfills `google_sub` / `email_verified` / `last_login_at` / display name, and returns a JWT plus the user
- [x] **Access is by pre-existing row.** An unregistered email gets **403**; there is no self-registration endpoint. This is the whole of the admissions policy
- [x] **`GET /api/auth/me`** — returns the caller's profile from the JWT. Written for session restore, and **called for it as of #60**: `AuthService.revalidateSession()` asks it on construction, so a reload checks the stored token instead of trusting it
- [x] **`SecurityConfig`** — stateless, CSRF off, CORS for `http://localhost:4200`, `JwtAuthenticationFilter` ahead of `UsernamePasswordAuthenticationFilter`. Matchers: `/api/auth/**` open, `/api/admin/**` needs authority `admin`, `/api/judge/**` needs `judge`, everything else authenticated
- [x] **`JwtService`** — HS256, claims `sub`/`email`/`role`/`name`, expiry from `app.jwt.expiration-ms`
- [x] **Config validated at startup** — `app.jwt.secret` (≥32 chars) and `app.google.client-id` are `@NotBlank`, so a missing value fails the boot rather than a request

- [x] **`POST /api/auth/dev-login`** — takes `{"role": "..."}`, finds the first user with that role (or any user at all) and returns a signed JWT for them. **No profile guard, no secret, no environment check**, and `/api/auth/**` is `permitAll`. See the warning below.

> ⚠️ **`dev-login` is a production-reachable admin bypass.** Anyone who can reach the backend can POST `{"role":"admin"}` and receive a valid admin token. Gate it behind `@Profile("local")` or delete it before anything is deployed. **The `security/` audit does not mention it.**
>
> **Zero tests on the backend side.** The `auth/` package still has no test class: CI compiles `GoogleTokenVerifier`, `JwtService`, `AuthController` and the filter and never runs them. This has been item 1 on *what comes next* since PR #59 and is still open.

### The rest of the API (PRs #63, #65, #67, #69)

Eight more controllers landed after the docs were last aligned. All follow the packages-by-feature shape the entities use, and two carry a service class (`AdminBackendService`, `JudgeBackendService`); `common/GlobalExceptionHandler` translates errors centrally.

| Controller | Prefix | Endpoints | Gate |
| ---------- | ------ | --------- | ---- |
| `AdminController` | `/api/admin` | 18 — overview, teams, participants, judges (single + batch register, role change, delete), assignments, audit, settings, results publish/unpublish | `hasAuthority("admin")` |
| `JudgeController` | `/api/judge` | 5 — assignments, criteria, draft/complete/decline a review | `hasAuthority("judge")` |
| `ResultController` | `/api/results` | 2 — public rankings, `/my` detailed result | `/api/results` permitted; `/my` authenticated |
| `SubmissionController` | `/api` | 2 — `/submissions/my`, `POST /webhook/submissions` | mixed; the webhook is permitted |
| `TeamController` | `/api/teams` | 1 — `/my` | authenticated |
| `EventSettingsController` | `/api/event` | 1 — `/settings` | permitted |
| `RegistrationWebhookController` | `/api/webhooks` | 1 — `/forms/registration` | permitted, secret optional |

> ⚠️ **The registration webhook is unauthenticated as committed.** `RegistrationWebhookController` checks `X-Webhook-Secret` **only when `app.webhook.secret` is non-blank**, and `application.properties` ships it as `app.webhook.secret=` — empty. Any caller can trigger a full sheet import.

### The Sheets import pipeline (PRs #63, #65, #67)

- [x] **`tools/GoogleSheetsReader`** — reads a sheet directly through the Sheets API with a service-account key, so the importers no longer need an exported CSV. `CsvReader` still handles the file path.
- [x] **`tools/FormSubmissionImporter`** — the registration importer's sibling, writing project submissions into `submissions`. Matches a row to a team by name or submitter email and **updates** rather than rejecting on resubmission.
- [x] **`webhook/RegistrationImportService` and `webhook/SubmissionImportService`** — both importers as Spring beans, each with a webhook **and** a `@Scheduled(fixedDelayString = "${app.sheets.poll-interval-ms:15000}")` poll.
- [x] **Apps Script `onFormSubmit` webhook** documented in `docs/SHEETS-SETUP.md` §7.

> **Three things about this pipeline are worth flagging.** The **sheet ids are committed** in `application.properties` and point at the team's live sheets, so every checkout that starts the backend polls them four times a minute — the only off switch is blanking the id. The registration service **swallows scheduled-sync failures at `log.debug`**, so a sync that has been failing all day is silent at the default level (the submission service uses `log.warn` for the same case — make them agree). And the webhook secret is blank, as above.

### Tests

- [x] **22 test classes** — repository tests (JPA slice against real Postgres), `FlywayBaselineMigrationTests`, the two importer tests, and `@WebMvcTest`-style controller tests for admin, judge, result, submission, team and the registration webhook. **`auth/` has none.** ⚠️ The "48 tests" figure this line used to carry is from PR #59 and was not re-measured for this pass — see [§7](#7-verification).
- [x] Slice pinned to the real database with `@AutoConfigureTestDatabase(replace = Replace.NONE)` — H2 was removed from `pom.xml` on purpose
- [x] `FlywayBaselineMigrationTests` **refuses to run** unless live JDBC metadata shows a database ending in `/hackathon_db_test`, because it calls `flyway.clean()`
- [x] Connection settings environment-overridable (`DB_TEST_URL` / `DB_TEST_USER` / `DB_TEST_PASSWORD`) so CI supplies its own

### Build and CI

- [x] Spring Boot **4.1.0** on Java 21, Maven wrapper
- [x] `.github/workflows/ci.yml` — backend job runs `./mvnw -B clean verify` against a `postgres:16` service container with a `pg_isready` health gate
- [x] Frontend job runs `npm ci`, `npx ng test --watch=false`, `npm run build` — **a failing spec fails the job**

---

## 3. Frontend — what is done

### Pages and routes

**12 page components behind 15 route entries.** `Progress` takes three paths — `/participant/progress`, `/participant/progress/team` and `/participant/progress/event` — and `/admin/dashboard` is a redirect entry onto `/admin/dashboard/:section`, so a section is always named in the URL.

| Route | Component | Guard |
| ----- | --------- | ----- |
| `/` | `Home` (hero, theme, timeline, sponsors, organisers, FAQ, contact, footer) | — |
| `/timeline` | `Timeline` | — |
| `/organizers` | `Organizers` | — |
| `/participant/team` | `MyTeam` | `participantGuard` |
| `/participant/submission` | `MySubmission` | `participantGuard` |
| `/participant/progress` | `Progress` (default tab) | `participantGuard` |
| `/participant/progress/team` | `Progress` (`tab: 'team'`) | `participantGuard` |
| `/participant/progress/event` | `Progress` (`tab: 'event'`) | `participantGuard` |
| `/judge/portal` | `JudgePortal` — **lazy-loaded** | `judgeGuard` |
| `/judge/reviews/:assignmentId` | `JudgeReview` — **lazy-loaded** | `judgeGuard` |
| `/admin/dashboard` | redirect → `/admin/dashboard/:section` | `adminGuard` |
| `/admin/dashboard/:section` | `AdminDashboard` — **lazy-loaded** | `adminGuard` |
| `/results` | `Results` | `signedInGuard` (any role) |
| `/sign-in` | `SignIn` | — |
| `**` | `NotFound` | — |

> **The two participant write-flows are gone from the site (PR #40).** Team registration and project submission both happen on a Google Form now, so `MyTeam` and `MySubmission` are read-only status views plus a link out. There is no create/join/rename/leave, no draft editor, and **no join code anywhere** — the registration form collects one row per team, leader plus up to four more members (2–5, read from `event_settings`), so a team arrives whole and there is nothing to join. The URLs live on `SiteCopy` as `teamRegistrationFormUrl` / `projectSubmissionFormUrl` and are **live as of #67**; the JSDoc above them still said PLACEHOLDER and was corrected in this pass.

- [x] Three paths onto one `Progress` component, distinguished by `data: { tab }`, so each view is linkable
- [x] The three role-gated pages — `AdminDashboard`, `JudgePortal`, `JudgeReview` — are the lazy routes. Everything a signed-out visitor can reach is eager; everything behind an `adminGuard` or `judgeGuard` is not, because participants are most of the traffic and can never reach any of it.
- [x] Wildcard `**` stays last

### Core services (`src/app/core/`)

- [x] `auth/` — `AuthService` with **two sign-in paths**: `signInWithGoogle()` (real, POSTs to the backend, stores the JWT under `hackathon.jwt-token`) and `signIn(role)` (the original demo path, no network, still what the specs and role buttons use). Both feed one `currentUser` signal through one `toAuthUser()` mapping, so nothing downstream can tell them apart — except `revalidateSession()`, which runs on construction, asks `GET /api/auth/me` about a stored JWT, and skips the tokenless demo session precisely because it has nothing to check. Plus the `roleGuard` factory (`participantGuard`, `judgeGuard`, `adminGuard`, `signedInGuard`) and three injection tokens — `SESSION_STORAGE`, `API_BASE_URL`, `GOOGLE_CLIENT_ID`
- [x] `event/` — `EVENT_CONFIG` token (now the **seed**, not the live copy), `EventSettingsService` owning the `event_settings` singleton as mutable state, `PhaseService`, `MilestoneService`, static site copy
- [x] `team/`, `submission/`, `results/` — **now real `HttpClient` callers**, not stand-ins. **`TeamService` and `SubmissionService` keep their mutations but no page calls them any more** — the two participant pages only read. They are kept because the progress and results specs seed fixtures through `createTeam` / `joinTeam` / `submit`, and because the submission validation is the written-down copy of the table's CHECK constraints. Do not build a page on them.
- [x] `judge/` — assignments, scores, criteria; validation repeats the tables' CHECK constraints so the UI never accepts what the API would reject
- [x] `admin/` — event-wide read model (a join across `teams`, `team_members`, `submissions`, `assignments`), plus rename and settle mutations on a team

> **Nothing in `AdminService` is counted twice.** A team's member count comes from the roster, its completed reviews from the assignment rows, and a judge's workload from the same rows — none of them is seeded alongside the thing it counts. Two fields recording one fact can disagree with nothing to catch it, which is the shape of bug V2 undid on `teams.status`. Specs assert each pair agrees.

### The admin workspace

`admin/dashboard/:section` is ten sections, each its own URL. **All ten are built**, and every one reads live data over `/api/admin/*`:

| Section | State | Note |
| ------- | ----- | ---- |
| Overview | ✅ Built | Six stat tiles, urgent actions, activity feed |
| Teams | ✅ Built | Filterable; rename, withdraw, disqualify |
| Participants | ✅ Built | Roster with derived eligibility (email domain + `email_verified`); read-only, and the eligibility control is a **view filter**, not a policy — see [§4](#4-what-is-not-done) |
| Submissions | ✅ Built | Filterable, with links |
| Judges | ✅ Built | The panel with counted workloads; add and remove by `users.role` |
| Assignments | ✅ Built | Assign/unassign judges, panel workload, coverage filters |
| Audit Log | ✅ Built | Full log, grouped by day, filterable by kind; **and the dashboard's own actions now land in it** |
| Results & Publication | ✅ Built | Rankings read from `ResultsService`, shortlist toggle, publish/unpublish stamping `team_results.published_at` |
| Event Settings | ✅ Built | The `event_settings` row, editable; MYT-explicit datetimes, confirms before publishing results or closing judging |
| Judging Progress | ✅ Built | 184 lines of component + a 283-line template + a spec — the last stub was closed in #69 |

**Every section was checked against the schema before it was built.** Each was checked against V1 + V2 rather than against the design draft alone, and where the draft wants something the database cannot hold, the section ships reduced and says so in place:

- **Participants** — no student ID column and no eligibility column, so no Verify/Flag action. Eligibility is derived from the address and `users.email_verified` instead, screened against `site.studentEmailDomain`. `event_settings.screening_enabled` is surfaced but gates nothing.
- **Teams** — no `locked` status in `teams_status_check`, so no Lock action; Withdraw and Disqualify are the settled states that do exist.
- **Assignments** — supported as drawn. Two departures are constraints rather than choices: a repeat assignment is refused (`assignments_team_id_judge_id_key` is UNIQUE, where the draft ignores it silently), and removing a judge who has started asks first, because `scores.assignment_id` is `ON DELETE CASCADE` and their scores go with the row.
- **Judges** — no active or inactive judge, because there is no column for one: being a judge *is* holding `users.role = 'judge'`, so adding and removing is that one write. The draft's email invitation has nowhere to live either — there is no invitations table, and sign-in admits an address only if `users` already holds it — so an organiser promotes somebody already registered instead. Removing is refused while the judge still holds assignments: a role change is not a delete, so `assignments.judge_id`'s cascade never fires and their rows would outlive their access. **The draft's third state, `pending`, the section does not show** — V3 made it representable (see the note below), but `AdminService` does not carry `google_sub` yet.

> **`AdminJudge.isActive` is gone.** It was documented as a `users` column and there has never been one — V1's `users.status` was dropped by V2 and nothing replaced it. Being a judge is holding `users.role = 'judge'`; there is no separate active flag, so the Overview's "Active judges" tile is now a plain judge count.
>
> **The draft's `pending` state, however, is now representable — V3 changed this.** While `users.google_sub` was NOT NULL a row could only appear once that person had signed in, so "invited but not yet joined" had nowhere to live. V3 dropped that NOT NULL: **a row with a NULL `google_sub` is exactly a person who is registered but has never signed in**, which is what the form importer creates for every participant. The same shape would represent a judge who has been added to the allowlist but has not yet logged in. Nothing in the admin UI reads it yet — this is a state the schema can now hold, not a feature that exists.

All seven mirror their tables field for field, and the three team-facing ones share seed data on purpose so they do not describe different universes.

### Layout kit and design system

- [x] 9 reusable components — `nav-bar`, `profile-menu`, `page-header`, `state-locked`, `confirm-dialog`, `event-timeline`, `faq-list`, `status-pill`, `form-link-card`
- [x] `styles.scss` holds the design system as CSS custom properties — brand accents with pre-darkened `-ink` variants, a neutral ramp, `--font-sans` / `--font-display`

### Tests

- [x] **72 spec files**, colocated, no database or dev server needed. ⚠️ The "798 tests" figure this line used to carry is from PR #60 and was not re-measured for this pass — see [§7](#7-verification). Every file under `src/app/` has one except `app.config.ts` and `src/main.ts`, which are bootstrap wiring
- [x] Zoneless Angular 21 throughout — signals for state, `await fixture.whenStable()` in tests, vitest under jsdom (not Karma)

---

## 4. What is NOT done

### CI is red on `main`

- [ ] ⚠️ **`npm run lint` fails on `main` with 31 errors** — 24 `@typescript-eslint/no-explicit-any` and 7 `@typescript-eslint/no-unused-vars`, across `core/admin/admin.ts`, `core/event/event-settings.ts`, `core/judge/judge.ts`, `admin-dashboard/admin-judging/admin-judging.ts`, and the `sponsors`, `judge-review`, `progress` and `sign-in` specs. The lint step has no `continue-on-error`, so the frontend CI job is failing. Verified 2026-08-26 on `34f6df7` with a clean `npm ci`.
- [ ] **At least one merge bypassed the PR gate.** `900af35 Merge branch 'feature/judge-registration' into main` is a local merge pushed straight to `main`, not a squash-merge from a reviewed PR. CI still runs on `push: main`, but a red push-build blocks nothing.
- [ ] **`npm run format:check` cannot be trusted locally on Windows.** `core.autocrlf=true` with no `.gitattributes` gives the working tree CRLF, and Prettier's default `endOfLine: "lf"` then flags ~148 files that are perfectly fine on CI. Adding a `.gitattributes` with `* text=auto eol=lf` would make the local check mean something.

### Security — the blocking items

**These are the only things standing between the current tree and something that could be exposed.** All three are open.

- [ ] ⚠️ **`POST /api/auth/dev-login` is an unauthenticated admin bypass.** It takes `{"role": "admin"}`, finds a matching user (or any user), and returns a signed JWT for them. `/api/auth/**` is `permitAll`, and the endpoint carries no `@Profile`, no secret and no environment check. Fix: gate it behind `@Profile("local")`, or delete it and use a seeded row.
- [ ] ⚠️ **The registration and submission webhooks accept any caller.** `RegistrationWebhookController` checks `X-Webhook-Secret` **only when `app.webhook.secret` is non-blank**, and `application.properties` commits it as empty. Fix: require the secret, and treat a blank one as a startup failure the way `app.jwt.secret` already is.
- [ ] **The `auth/` package still has no test.** Unchanged since PR #32. It is the only code that decides who gets in, and CI compiles it without running it. **The frontend half was closed in #54**, so the asymmetry has now stood for 15 PRs.

> **The `security/` audit is not evidence about any of these.** `AI-CHECKLIST.md` drove a 17-category pass that marks 16 of 17 PASS; it does not mention `dev-login` or the blank webhook secret. Read those reports as "this category was reviewed at that commit", not "this area is safe now".

### Screening and auto-reject — not built

- [ ] **There is no auto-reject filter for registrations, and `event_settings.screening_enabled` has no consumer.** The column is settable from the admin Event Settings section and read back by `AdminBackendService`, and **nothing branches on it**. `admin-participants.ts` says so in a comment.
- [ ] **A blank resume imports today.** `tools/TeamRow` rejects a resume/LinkedIn/GitHub value that is *present but is not a URL*, and only **warns** when the field is left empty — `validateUrl` argues the case deliberately. Same for a missing phone.
- [ ] **The admin Participants eligibility control is a view filter, not a policy.** `eligibilityOf(studentAddress, emailVerified)` derives `eligible` / `unverified` / `not_student` from the email domain and `users.email_verified`. It stores nothing and gates nothing, and it does not look at `resume_url`.
- [ ] **There is no way to express "rejected".** No table carries a rejected state; a row that fails validation is simply not imported, and since `users` is the sign-in allowlist the person just cannot sign in and is never told why. `notifications_log` still has no writer, so there is no path to tell them.

> **Where the work goes if this is picked up.** `TeamRow.validateBlock` is the enforcement point, and the policy should be read from `event_settings` beside the size limits — the pattern V6 established, so tightening a rule stays an `UPDATE` rather than a recompile. Turning a warning into a rejection is one line per field. The two open questions are design, not code: **per-field flags or one `screening_enabled` switch**, and **does "rejected" mean not-imported or imported-and-flagged** — the second needs a column and a notification path that do not exist.

### The Sheets pipeline — works, but unguarded

- [ ] **Live sheet ids are committed** in `application.properties`, and both services poll on a 15-second fixed delay, so every checkout that starts the backend hits the team's real sheets four times a minute. The only off switch is blanking the id — there is no enable flag.
- [ ] **The registration scheduled sync logs its failures at `DEBUG`** and the submission one at `WARN`. At the default level a registration sync that has been failing all day is silent. Make them agree.
- [ ] **Neither importer's in-app path has a test.** `FormRegistrationImporterTest` and `FormSubmissionImporterTest` cover the CLI entry points; `RegistrationImportService`, `SubmissionImportService` and the scheduled polls are untested.

### Still open from before

- [ ] **Still no HTTP interceptor, and the cost has multiplied.** Every authenticated call attaches `Authorization: Bearer …` by hand from `AuthService.token()`. That was one call when #60 shipped; `core/admin/admin.ts` alone now does it in **thirteen** places. Writing the interceptor is now cleanup, not a design decision.
- [ ] **The demo sign-in still bypasses everything.** `signIn(role)` picks one of three hardcoded `DEMO_USERS` with no token, and the guards cannot tell that session from a real one. Guards gate *navigation*; only `SecurityConfig` gates data — and it now genuinely guards things people call.
- [ ] **The client id is configured in two places** — `GOOGLE_CLIENT_ID` on the frontend and `app.google.client-id` on the backend. They must match or login 401s on audience verification, and nothing checks that they do.
- [ ] **Six CHECK vocabularies remain unratified** — see [docs/README.md](README.md). `assignments.status` is now consumed by both the judge portal and the admin workspace and was never ratified; the two `notifications_log` vocabularies still have **no consumer at all**.
- [ ] **V7's seed is destructive if re-run.** `V7__seed_judging_criteria.sql` opens with `delete from scores; delete from judging_criteria;`. Safe as applied, and not a pattern to repeat — if the rubric changes mid-event, write an `update`.
- [ ] **`Technology Integration (TBC)` is a live placeholder criterion**, worth 15 of 100 points, pending sponsor alignment. Judges see it.
- [ ] **Nothing has been deployed.** Both `Dockerfile`s and `docs/GCP_DEPLOYMENT_GUIDE.md` exist; no environment does.
- [ ] **41 commits on `main` still carry a tooling `Co-authored-by:` trailer.** Weighed on 16 Aug and **declined** — clearing them would rewrite 94 of 126 commits and hand new SHAs to two teammates who never had one. #58 stops new ones. Unchanged.
- [ ] **Placeholder content remains in places.** `DEMO_USERS` still exists beside the real sign-in. Read the file header before treating a seed as a team decision.

### Closed since this file was last updated

- [x] ~~**One endpoint pair, and it is the auth one.**~~ Closed across #63/#65/#67/#69. Eight more controllers, ~40 endpoints, all three roles served.
- [x] ~~**Nothing persists in the UI.**~~ Closed. All seven core services are `HttpClient` callers; the in-memory stand-ins are gone.
- [x] ~~**The Google Forms pipeline stops at registration.**~~ Closed in #65/#67. `FormSubmissionImporter` plus `SubmissionImportService` populate `submissions.status` / `submitted_at`, and V5 added the columns the submission form collects.
- [x] ~~**Judging Progress is the last stub.**~~ Closed in #69. The admin workspace is ten of ten.
- [x] ~~**A stored session is never revalidated.**~~ Closed in #60.

### Closed earlier, kept for the record

- [x] ~~**The initial bundle is over budget.**~~ Resolved in #47 — the two judge routes went lazy and the initial bundle fell to 452.82 kB. **And #49 closed the mechanism that let it drift**: the error threshold moved from 1 MB to 500 kB, so a breach now fails the build and therefore CI, with a 480 kB warning as the early signal. The remaining eager routes are the public pages plus the four participant ones.
- [x] ~~**No linting.**~~ Resolved in #50 — angular-eslint 21 over TypeScript and templates, `npm run lint`, and a CI step that fails the job on a violation. #51 added the template **accessibility** preset on top. One thing remains deliberately outside it: type-aware rules, because the compiler already does that work under `strict`.
- [x] ~~**Formatting was checked by nobody.**~~ Closed in #57. Prettier had been installed since setup and run by hand, so `app.config.ts` and `sign-in.html` had sat unformatted without anything reporting it. `npm run format:check` now runs in CI beside the lint step and fails the job. **The two checks do not overlap** — `eslint-config-prettier` switches every layout rule off, so a green lint was never evidence of a formatted tree. `frontend/.prettierignore` is what makes the check usable: Prettier ignores `.gitignore`, so the gitignored `figma-draft/` export was drowning the two real violations under ~32 of its own.
- [x] ~~**Uneven test coverage — 22 files still have no spec.**~~ Closed in #52, which specced the remaining 21 source files: `core/results/results.ts`, `core/event/milestones.ts`, `event-content.ts` and `event-config.ts`, the whole layout kit, and every section component under `progress/`, `results/`, `judge-portal/`, `judge-review/` and `home/`. **Every file under `src/app/` now has a colocated spec except `app.config.ts`** (and `src/main.ts`), which are bootstrap wiring with nothing to assert. The count went 30 → 22 → 0 across #48 and #52. What is *not* closed by this is the auth gap below: coverage is now even across the frontend, and the backend `auth/` package still has none.
- [x] ~~**`assignments.status` has two label maps.**~~ Merged in #55. `ADMIN_ASSIGNMENT_STATUS_LABELS` and the `AdminAssignmentStatus` union beside it are gone; `core/admin/admin.ts` imports `AssignmentStatus` from `core/judge/judge.ts`, and the admin Assignments chips render `app-status-pill` instead of their own `.chip--<status>` treatment. **The wording and the vocabulary now each live in exactly one place**, so a relabelling cannot leave the judge and organiser views disagreeing about the same row.
- [x] ~~**Two homepage copy strings do not follow their config.**~~ Both fixed in #56. The hardcoded "one of three tracks" is gone — the blurb reads "Pick a track — A, B and C —", so the list carries the count instead of a second, separately-maintained statement of it. `trackList()` now special-cases one track (bare name, no orphan "and") and no tracks (''), which the template reads as "leave the aside out". The specs render one, two, four and zero tracks, so the shapes today's three-track config hides are now exercised rather than assumed.

---

## 5. Delivery log

| PR | Date | What landed |
| -- | ---- | ----------- |
| #1–#8 | 07-20 → 08-09 | Repo setup, templates, CI skeleton, **V1 baseline schema** |
| #9 | 08-10 | Homepage — hero, theme, sponsors, organisers, FAQ, contact, footer |
| #10 | 08-10 | Nav bar, account menu, mobile drawer, demo auth service, role guards |
| #11 | 08-10 | `User` / `Team` / `TeamMember` entities + JPA mapping tests |
| #12 | 08-11 | Event dates fixed, auth aligned with the schema |
| #13 | 08-11 | Event timeline page |
| #14 | 08-11 | My Team page |
| #15 | 08-11 | My Submission page; mock services reshaped `async` |
| #16 | 08-11 | **V2 migration** — hard delete, status cleanup, judge cascade |
| #17 | 08-12 | Organisers & information page |
| #18 | 08-12 | Participant Progress page |
| #19 | 08-12 | Results page |
| #20 | 08-12 | Remaining 8 entities mapped — schema fully covered |
| #21 | 08-12 | CLAUDE.md update |
| #22 | 08-12 | `TeamStatus` drift fixed — `'submitted'` dropped to match V2 |
| #23 | 08-12 | CI actually runs the frontend specs; no-op lint step dropped |
| #24 | 08-12 | **Judge portal** |
| #25 | 08-12 | **Judge review screen** |
| #26 | 08-12 | **Admin dashboard** |
| #27 | 08-12 | 404 page, roles land on their own pages, stale judge copy fixed |
| #28 | 08-12 | Docs brought current with V2; backend handover moved in-tree |
| #29 | 08-12 | **Admin dashboard rebuilt** as the ten-section workspace — sidebar, Overview, Teams, Submissions |
| #30 | 08-13 | This file added; `docs/BACKEND-STATUS.md` retired |
| #31 | 08-13 | **Participants section** — roster with derived eligibility; `memberCount` now counted from it |
| #32 | 08-13 | **Backend Google auth** — `auth/` package, `SecurityConfig`, JWT issue/verify, email-whitelist enforcement |
| #33 | 08-13 | **Assignments section** — assign/unassign judges, panel workload, coverage filters; `AdminJudge.isActive` removed |
| #34 | 08-13 | **Sign-in wired to the backend** — GIS button, `signInWithGoogle()`, `provideHttpClient()`, 401/403 error copy |
| #35 | 08-13 | CLAUDE.md brought back in line with the code |
| #36 | 08-13 | **V3 migration** — form registration: `users.google_sub` nullable, `phone` / `resume_url` / `linkedin_url` added, CSV importer |
| #38 | 08-13 | **V4 migration** — `users.github_url`, the fourth form-collected field |
| #39 | 08-13 | Importer hardening — per-member-block guards, duplicate column titles refused, exit codes 0/1/2 |
| #40 | 08-14 | **Registration and submission moved to Google Forms** — both participant pages become read-only status plus a form link; join codes removed; `form-link-card` added to the layout kit |
| #41 | 08-15 | **Audit Log section** — full log grouped by day and filterable; `AdminService`'s six mutations now write entries, and the seed grew from 7 rows to 41 |
| #42 | 08-15 | **Results & Publication section** — rankings read from `ResultsService` so they cannot disagree with the participant page; shortlist toggle, publish/unpublish, and per-row issue flags |
| #43 | 08-15 | **`EventSettingsService`** — `event_settings` becomes mutable state seeded from `EVENT_CONFIG`; all 19 consumers migrated to read it reactively. No UI change; unblocks the Event Settings section |
| #44 | 08-15 | **Event Settings section** — the row editable end to end, and publishing from Results now also sets `results_published_at`, so it actually opens the participant page |
| #45 | 08-15 | **Averis sponsor section** — the nine placeholder sponsors and their dead Clearbit logo lookups replaced by one confirmed sponsor on a self-hosted asset; tiers removed, `SPONSORS` is an array of one |
| #46 | 08-16 | Sponsor note reworded as a thank-you, and it now reads the event name from `EventSettingsService` instead of hardcoding it |
| #47 | 08-16 | **Judge routes lazy-loaded** — `JudgePortal` and `JudgeReview` behind `loadComponent`, taking the initial bundle from 505.35 kB to 452.82 kB and ending the budget warning that had stood since #34 |
| #48 | 08-16 | **Specs for the eight untested admin sections** — Assignments, Judges, Teams, Participants, Overview, Submissions, Sidebar and the workload panel. 425 → 499 tests; the cascade-confirm and constraint-refusal paths are now covered. No production code changed |
| #49 | 08-16 | **The bundle budget became a gate** — error threshold 1 MB → 500 kB with a 480 kB warning, so a breach fails CI instead of warning past it |
| #50 | 08-16 | **ESLint** — angular-eslint 21 over TypeScript and templates, `npm run lint`, and a real CI step. The first run found one thing: a `submit` output shadowing the native DOM event, renamed to `submitted` |
| #51 | 08-16 | **Template accessibility rules** — preset enabled, and with it a real fix: the admin drawer had no keyboard exit, so Escape now closes it as `NavBar`'s does. The scrim is `aria-hidden`; the confirm dialog's two rules are suppressed with the argument in the template |
| #52 | 08-16 | **Specs for the last 21 untested frontend files** — the layout kit, `core/results`, the three `core/event` data modules, and every `progress/`, `results/`, `judge-portal/`, `judge-review/` and `home/` section. 502 → 741 tests across 40 → 61 files; coverage is now even across `src/app/`. No production code changed, and two latent copy bugs in `home/theme/` were recorded in [§4](#4-what-is-not-done) rather than fixed here |

| #53 | 08-16 | **Four stale code comments corrected**, each of which described a state the code had moved past — the admin dashboard's "six sections", `publishResults`' "does not change what participants see yet", `Progress.nextAction`'s "waits for the results page to land", and `status-pill`'s prediction about the admin view. Two matching claims in CLAUDE.md fixed with them. Comments and docs only; no behaviour changed |

| #54 | 08-16 | **The frontend half of auth is now tested** — `signInWithGoogle`'s request shape, role fallback, initials derivation, JWT persistence and restore, all four error branches, plus the GIS script loading and the credential handler driven through the paste-a-token form. 741 → 778 tests. No production code changed; the backend `auth/` package remains untested |

| #55 | 08-16 | **The two `assignments.status` label maps merged into one** — `ADMIN_ASSIGNMENT_STATUS_LABELS` and the duplicate `AdminAssignmentStatus` union deleted, `core/admin/admin.ts` now importing both from `core/judge/judge.ts`, and the admin Assignments chips rendering `app-status-pill` in place of their own status classes. The chip keeps the judge's name and the × and goes neutral; the colour moves inside to the pill. 778 tests still pass; the bundle is unchanged at 452.82 kB |

| #56 | 08-16 | **The two `home/theme/` copy bugs fixed** — the blurb no longer hardcodes "one of three tracks" beside a list built from `site.tracks`, and `trackList()` no longer emits an orphan " and X" for a single track. Four new specs render one, two, four and zero tracks: the counts the shipped three-track config hides. 778 → 782 tests |

| #57 | 08-16 | **Prettier now runs in CI** — `npm run format:check` beside the lint step, failing the job on unformatted code, plus a `frontend/.prettierignore` without which the gitignored `figma-draft/` export contributes ~32 violations and hides the real ones. The two files that had drifted, `app.config.ts` and `sign-in.html`, are reformatted. Formatting only; no behaviour changed |

| #58 | 08-16 | **Commits no longer co-author themselves with tooling** — CONTRIBUTING.md now says not to add a `Co-authored-by:` trailer for an assistant, because GitHub resolves it to a real account and lists it in the repo's Contributors sidebar. Person-to-person co-authoring is untouched. Convention only; no code changed |

| #59 | 08-16 | Delivery log caught up with #58, and the co-author trailer question recorded as **weighed and declined** rather than left open — rewriting 94 of 126 commits to clear 41 trailers would hand new SHAs to two teammates who never had one. Docs only |

| #60 | 08-16 | **A reload now checks the session instead of trusting it** — `AuthService.revalidateSession()` GETs `/api/auth/me` with the stored JWT on construction and signs out on 401/403, so an expired token or a deleted user stops looking signed in. `GET /api/auth/me` had been written for exactly this and had sat with no caller since #32. Three cases are deliberately left alone: the tokenless demo session, an unreachable backend, and an answer that arrives after the token changed. Both sign-in paths now map the backend user through one `toAuthUser()` helper. 782 → 798 tests |

| #61 | 08-17 | Homepage "Register Now" CTA pointing at the live Google Form |
| #62 | 08-17 | CLAUDE.md aligned with the tree as of #61. **The last time the docs were current before this pass.** |
| #63 | 08-19 | **Google Sheets becomes a direct import source** — `tools/GoogleSheetsReader` reads the sheet through the Sheets API with a service-account key, so no CSV export is needed. With it: `POST /api/webhooks/forms/registration` and an Apps Script `onFormSubmit` guide, a **`@Scheduled` 15-second poll**, `docs/SHEETS-SETUP.md`, the first live admin endpoints (`AdminController` + `AdminBackendService`), `GET /api/teams/my` wired to My Team, admin accounts excluded from the participants roster, and imported teams set to `status = 'complete'` |
| #64 | 08-19 | The Averis event proposal added to `docs/` |
| #65 | 08-19 | **Project submissions sync from Sheets too** — `tools/FormSubmissionImporter`, `SubmissionImportService`, `POST /api/webhook/submissions`, and `GET /api/submissions/my` behind the live My Submission view. Fuzzy team matching on resubmission, audit entries written during sync, the submission date window dropped, GIS moved to FedCM, and COOP configured on the dev server |
| #66 | 08-20 | **Copy and typography from the Averis proposal** — real event dates, the problem statement and partners, the schedule at phase level with clock times dropped, eligibility opened to any university, titles in serif and body in sans |
| #67 | 08-21 | Live submission form URLs, the timeline subtab removed from Progress, and the team view streamlined |
| #68 | 08-22 | **Team size stated as 2–5 across the site**, solo-entry copy removed, admin API responses typed |
| #69 | 08-23 | **Judging end to end** — `JudgeController` + `JudgeBackendService`, the scoring rubric wired to the backend, **V7** seeding the criteria, **V8** adding `judges_per_team`, single and batch manual judge registration in the admin dashboard, results publication, and the Judging Progress section — the last admin stub. Also: the registered full name is no longer overwritten by the Google profile name |
| #70 | 08-24 | **UI revamp** — the floating Averis orb on spring physics, partner cards led by the logo, a plain-language copy pass, and eight pages plus the orb taken out of the initial bundle |
| #71 | 08-24 | Timeline arrives on scroll instead of scrolling horizontally; track stylesheet brought back inside budget |
| #72 | 08-25 | Homepage, sign-in and site-wide navigation modernised; initial SVG scene and copy visibility fixed on immediate mount |
| #73 | 08-25 | Pages fade in on tab change |
| #74 | 08-25 | The orb becomes a Gemini sparkle, rocking rather than turning |
| #75 | 08-25 | Scoring rubric made readable and self-consistent; the total bar returns with a colour per rank; the judging-criteria button points at a section that exists |
| #76 | 08-26 | **SEO and production packaging** — `robots.txt`, `sitemap.xml`, Schema.org JSON-LD, live database state enforced across all portal pages, production `Dockerfile`s for both halves, and `docs/GCP_DEPLOYMENT_GUIDE.md`. Plus the 17-category security audit under `security/` |
| — | 08-26 | **This pass** (`docs/align-current-state`) — CLAUDE.md, `docs/README.md` and this file realigned with the tree after 89 commits of drift. Docs only; no behaviour changed |

**In flight:** nothing.

---

## 6. What comes next

In order. Item 0 blocks verifying any of the rest; items 1–3 block exposing this to anyone.

0. **Get CI green.** `npm run lint` fails on `main` with 31 errors (24 `no-explicit-any`, 7 `no-unused-vars`). Nothing else on this list is verifiable while the gate is red. Most of the `any`s are in the API-response types added when the services were wired to the backend — typing them properly is the fix, not a suppression.
1. **Close `dev-login`.** `POST /api/auth/dev-login` returns a signed admin JWT to any anonymous caller. Gate it behind `@Profile("local")` or delete it. One line, highest severity in the tree.
2. **Require the webhook secret.** `app.webhook.secret` ships blank and the check is skipped when it is. Make a blank secret a startup failure the way `app.jwt.secret` already is, and set a real one wherever this runs.
3. **Test the `auth/` package.** It has been item 1 on this list since PR #59 and is still empty. A `@WebMvcTest` over `AuthController` with the verifier stubbed covers the branches that matter (valid + registered → 200, valid + unregistered → 403, unverified email → 401, and — once it is gated — `dev-login` refusing outside `local`); a `JwtService` round-trip covers the rest.
4. **Get the sheet ids and the poll out of committed config.** Move `app.sheets.*` into `application-local.properties` / environment variables so a fresh checkout does not poll the team's live sheets on startup, and make the registration service's scheduled-sync failure log a `warn` so a broken sync is visible.
5. **Write the HTTP interceptor.** Thirteen hand-written `Authorization` headers in `core/admin/admin.ts` alone, plus the ones in the other services and `revalidateSession()`. Pure cleanup now; the design question was settled when the second call landed.
6. **Decide the screening policy** — see [§4](#4-what-is-not-done). `event_settings.screening_enabled` is a toggle with nothing behind it and a blank resume imports today. The code change is small; the two decisions (per-field flags versus one switch, and what "rejected" means when there is no rejected state and no notification path) are not.
7. **Retire the demo sign-in.** `signIn(role)` picks a hardcoded user with no token, and the guards cannot tell it from a real session. It waits on everyone having a real `users` row, which the form import now provides — so this is unblocked and just needs doing.
8. **Ratify the remaining CHECK vocabularies.** `assignments.status` is now consumed by both the judge portal and the admin workspace and was never approved; `SecurityConfig`'s `hasAuthority("admin"/"judge")` is a third copy of the `users.role` literals. The two `notifications_log` vocabularies have no consumer at all — decide whether notifications are in scope before ratifying strings nothing writes.
9. **Replace `Technology Integration (TBC)`** once the sponsor position is settled. It is worth 15 of 100 points and judges see the "(TBC)" in its title.
10. **Deploy.** Both `Dockerfile`s and `docs/GCP_DEPLOYMENT_GUIDE.md` are written and nothing has been stood up. Items 1, 2 and 4 are prerequisites, not nice-to-haves.

---


## 7. Verification

> ⚠️ **Nothing in this section was re-run for the 2026-08-26 docs pass.** Every figure below was measured on or before PR #60 and describes a tree that is 89 commits behind `main`. The spec count is now **72 files** (was 61) and the backend has **22 test classes** (was 13), so the pass/fail figures are certainly wrong and possibly optimistic. **Re-run both suites before quoting any number here.**

```powershell
# frontend
cd frontend; npm ci; npm run lint; npm run format:check; npx ng test --watch=false; npm run build
# backend — needs the container up on 5433
docker start hackathon-pg16
cd backend; .\mvnw.cmd -B clean verify
```

### Carried forward from PR #60 (2026-08-16) — stale

| Suite | Command | Result | Run against |
| ----- | ------- | ------ | ----------- |
| Frontend | `npm run lint` | All files pass linting — exit 0 | `feature/revalidate-session-on-reload` |
| Frontend | `npm run format:check` | All matched files use Prettier code style — exit 0 | `feature/revalidate-session-on-reload` |
| Frontend | `npx ng test --watch=false` | 61 files, 798 tests passed | `feature/revalidate-session-on-reload` |
| Frontend | `npm run build` | 453.39 kB initial — exit 0, 27 kB below the 480 kB warning | `feature/revalidate-session-on-reload` |
| Backend | `./mvnw -B clean verify` | 44 tests, 0 failures, 0 errors | `98e50df` |

**What still holds regardless of the counts:**

- **The bundle budget is a gate, not a warning.** #49 set the error threshold to 500 kB with a 480 kB warning, verified by breaching it deliberately. A breach fails the build and therefore CI.
- **The linter and the formatter are both gating**, and they do not overlap — `eslint-config-prettier` switches every layout rule off, so a green lint was never evidence of a formatted tree.
- **Backend tests require a running Postgres.** H2 was removed from `pom.xml` entirely; the baseline schema uses `timestamptz`, `jsonb`, identity columns and cross-column CHECKs that no substitute engine can execute. A connection error means the container is not up.
- **`FlywayBaselineMigrationTests` refuses to run** unless the live JDBC connection metadata shows a database ending in `/hackathon_db_test`, read from the connection rather than a property. It now asserts **eight** migrations to target version `8` — adding a migration means updating it.

---


## 8. Where the detail lives

This file says *what state things are in*. It deliberately does not repeat the reasoning.

| For | Read |
| --- | ---- |
| Conventions, traps, commands, Boot 4 gotchas, Angular 21 notes | [CLAUDE.md](../CLAUDE.md) |
| Which schema decisions are ratified vs. still proposals | [docs/README.md](README.md) |
| The structural schema (11 tables, 3 slides) | `docs/databaseSchema.pdf` — **structural only, and predates V2** |
| The actual current schema | The live database, or V1 through V8 read together |
| Google Cloud service-account setup and the Apps Script webhook | [docs/SHEETS-SETUP.md](SHEETS-SETUP.md) |
| Cloud Run deployment and monitoring | [docs/GCP_DEPLOYMENT_GUIDE.md](GCP_DEPLOYMENT_GUIDE.md) |
| The event itself — format, tracks, prizes, dates | [docs/EVENT-PROPOSAL.md](EVENT-PROPOSAL.md) |
| The security audit, and what it does **not** cover | `security/reports/` — read with [§4](#4-what-is-not-done) |

**These go stale the same way everything else does.** This file, CLAUDE.md and docs/README.md describe the same system from different angles, and nothing checks them against each other. A migration that changes a CHECK vocabulary, a DEFAULT or an `ON DELETE` rule has to update all three, plus the frontend union that mirrors it. When in doubt, read the live constraint:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```
