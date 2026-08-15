# Project status

**Repo:** `mum-hackathon-2026/hackathon-website` — this file is `docs/PROJECT-STATUS.md`; paths below are relative to the git root.
**As of:** `ad72282` (= `origin/main`, through PR #36) plus the Judges section on `feature/admin-judges`, 2026-08-13.
**Verified:** the frontend suite and a production build were run against the branch; the backend sources were last compiled at `523911f` and the backend *test* figures are carried forward from `98e50df` because no Postgres was available for that pass — see [§7](#7-verification). Everything else here is read from the source tree.

This is the **progress tracker**: what is built, what is not, and what comes next. It does not explain *how* anything works — [CLAUDE.md](../CLAUDE.md) holds the conventions and [docs/README.md](README.md) holds the schema decisions. When a fact here needs detail, this file points at one of those rather than repeating it. See [§8](#8-where-the-detail-lives).

---

## 1. At a glance

| Area | State | One line |
| ---- | ----- | -------- |
| **Database** | 🟢 Done | 11 tables across V1 + V2 + V3 + V4, live and migrating cleanly |
| **Backend persistence** | 🟢 Done | All 11 tables mapped, 11 repositories, 48 tests passing |
| **Backend API** | 🟡 Auth only | 2 endpoints (`/api/auth/google`, `/api/auth/me`); nothing for teams, submissions or judging |
| **Backend security** | 🟢 Built | `SecurityConfig` + JWT filter + Google ID-token verification — **but zero tests** |
| **Frontend pages** | 🟢 Done | 12 components behind 13 routes, all three roles covered |
| **Admin workspace** | 🟡 8 of 10 | Everything but Judging Progress and Event Settings; those two are the last stubs |
| **Frontend data** | 🟡 Stand-ins | 7 in-memory services shaped like the API that will replace them |
| **Integration** | 🟡 One seam | Sign-in talks to the backend; every other page is still in-memory |
| **CI** | 🟢 Done | Two jobs, both gating; a failing spec cannot reach `main` |
| **Docs** | 🟢 Current | This file, CLAUDE.md and docs/README.md all current as of `ad72282` |

**The single most important line:** the two halves now speak, but only about **who you are**. Login is real — Google ID token in, JWT out, email checked against the `users` table — and every other page still runs on in-memory data that resets on reload. The pattern for connecting the rest exists; it just has one instance. [§6](#6-what-comes-next) is the order to do it in.

---

## 2. Backend — what is done

### Schema and migrations

- [x] **V1 `V1__baseline_schema.sql`** — creates all 11 tables, seeds the `event_settings` singleton inert (registration windows null, judging closed, nothing published)
- [x] **V2 `V2__hard_delete_and_status_cleanup.sql`** — ratifies hard delete, the `teams.status` cleanup, and the judge cascade
- [x] **V3 `V3__form_registration.sql`** — registration moves to a Google Form: `users.google_sub` becomes nullable (NULL = registered, never signed in), and `phone` / `resume_url` / `linkedin_url` are added, all nullable because judges and admins are rows in `users` too
- [x] **V4 `V4__add_user_github_url.sql`** — adds `users.github_url`, the third screening link the form collects and the one V3 missed. Nullable for the same reason. **Not the same column as `submissions.github_url`** — that is a team's project repo, this is a participant's own account; both are now commented in the database to keep them apart
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

The first and so far only HTTP surface. Eight classes in `auth/`, which owns no table.

- [x] **`POST /api/auth/google`** — verifies a Google ID token against Google's keys, requires a verified email, looks the address up in `users`, backfills `google_sub` / `email_verified` / `last_login_at` / display name, and returns a JWT plus the user
- [x] **Access is by pre-existing row.** An unregistered email gets **403**; there is no self-registration endpoint. This is the whole of the admissions policy
- [x] **`GET /api/auth/me`** — returns the caller's profile from the JWT. Written for session restore; **nothing calls it yet**
- [x] **`SecurityConfig`** — stateless, CSRF off, CORS for `http://localhost:4200`, `JwtAuthenticationFilter` ahead of `UsernamePasswordAuthenticationFilter`. Matchers: `/api/auth/**` open, `/api/admin/**` needs authority `admin`, `/api/judge/**` needs `judge`, everything else authenticated
- [x] **`JwtService`** — HS256, claims `sub`/`email`/`role`/`name`, expiry from `app.jwt.expiration-ms`
- [x] **Config validated at startup** — `app.jwt.secret` (≥32 chars) and `app.google.client-id` are `@NotBlank`, so a missing value fails the boot rather than a request

> **Zero tests on the backend side.** The `auth/` package has no test class: CI compiles it and never executes it, making it the least-verified code in the repo. The frontend has one wiring test (the client id comes from the token) and otherwise covers the demo path only. See [§4](#4-what-is-not-done).

### Tests

- [x] **13 test classes / 48 tests** — 11 repository tests (JPA slice against real Postgres), `FlywayBaselineMigrationTests`, and the generated context-load test
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

**12 page components behind 13 routes.** All three roles now have a landing page, and `ROLE_HOME` sends each one there on sign-in.

| Route | Component | Guard |
| ----- | --------- | ----- |
| `/` | `Home` (hero, theme, timeline, sponsors, organisers, FAQ, contact, footer) | — |
| `/timeline` | `Timeline` | — |
| `/organizers` | `Organizers` | — |
| `/participant/team` | `MyTeam` | `participantGuard` |
| `/participant/submission` | `MySubmission` | `participantGuard` |
| `/participant/progress/team` | `Progress` (`tab: 'team'`) | `participantGuard` |
| `/participant/progress/event` | `Progress` (`tab: 'event'`) | `participantGuard` |
| `/judge/portal` | `JudgePortal` | `judgeGuard` |
| `/judge/reviews/:assignmentId` | `JudgeReview` | `judgeGuard` |
| `/admin/dashboard` | `AdminDashboard` — **lazy-loaded** | `adminGuard` |
| `/results` | `Results` | `signedInGuard` (any role) |
| `/sign-in` | `SignIn` | — |
| `**` | `NotFound` | — |

> **The two participant write-flows are gone from the site (PR #40).** Team registration and project submission both happen on a Google Form now, so `MyTeam` and `MySubmission` are read-only status views plus a link out. There is no create/join/rename/leave, no draft editor, and **no join code anywhere** — the registration form collects one row per team, leader plus up to three members, so a team arrives whole and there is nothing to join. The URLs live on `SiteCopy` as `teamRegistrationFormUrl` / `projectSubmissionFormUrl` and are **placeholders** until the real links land.

- [x] Two paths onto one `Progress` component, distinguished by `data: { tab }`, so each view is linkable
- [x] `AdminDashboard` is the only lazy route — eagerly importing it pushed the initial bundle past its budget, and organisers are the rarest role. The next page added will face the same choice.
- [x] Wildcard `**` stays last

### Core services (`src/app/core/`)

- [x] `auth/` — `AuthService` with **two sign-in paths**: `signInWithGoogle()` (real, POSTs to the backend, stores the JWT under `hackathon.jwt-token`) and `signIn(role)` (the original demo path, no network, still what the specs and role buttons use). Both feed one `currentUser` signal, so nothing downstream can tell them apart. Plus the `roleGuard` factory (`participantGuard`, `judgeGuard`, `adminGuard`, `signedInGuard`) and three injection tokens — `SESSION_STORAGE`, `API_BASE_URL`, `GOOGLE_CLIENT_ID`
- [x] `event/` — `EVENT_CONFIG` token (now the **seed**, not the live copy), `EventSettingsService` owning the `event_settings` singleton as mutable state, `PhaseService`, `MilestoneService`, static site copy
- [x] `team/`, `submission/`, `results/` — participant-scoped stand-ins. **`TeamService` and `SubmissionService` keep their mutations but no page calls them any more** — the two participant pages only read. They are kept because the progress and results specs seed fixtures through `createTeam` / `joinTeam` / `submit`, and because the submission validation is the written-down copy of the table's CHECK constraints. Do not build a page on them.
- [x] `judge/` — assignments, scores, criteria; validation repeats the tables' CHECK constraints so the UI never accepts what the API would reject
- [x] `admin/` — event-wide read model (a join across `teams`, `team_members`, `submissions`, `assignments`), plus rename and settle mutations on a team

> **Nothing in `AdminService` is counted twice.** A team's member count comes from the roster, its completed reviews from the assignment rows, and a judge's workload from the same rows — none of them is seeded alongside the thing it counts. Two fields recording one fact can disagree with nothing to catch it, which is the shape of bug V2 undid on `teams.status`. Specs assert each pair agrees.

### The admin workspace

`admin/dashboard/:section` is ten sections, each its own URL. **Eight are built:**

| Section | State | Note |
| ------- | ----- | ---- |
| Overview | ✅ Built | Six stat tiles, urgent actions, activity feed |
| Teams | ✅ Built | Filterable; rename, withdraw, disqualify |
| Participants | ✅ Built | Roster with derived eligibility; read-only |
| Submissions | ✅ Built | Filterable, with links |
| Judges | ✅ Built | The panel with counted workloads; add and remove by `users.role` |
| Assignments | ✅ Built | Assign/unassign judges, panel workload, coverage filters |
| Audit Log | ✅ Built | Full log, grouped by day, filterable by kind; **and the dashboard's own actions now land in it** |
| Results & Publication | ✅ Built | Rankings read from `ResultsService`, shortlist toggle, publish/unpublish stamping `team_results.published_at` |
| Judging Progress, Event Settings | ⬜ Stub | Placeholder rather than hidden, so the shape is visible |

**Neither of the two remaining is blocked on the schema.** Each was checked against V1 + V2 rather than against the design draft alone, and where the draft wants something the database cannot hold, the section ships reduced and says so in place:

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

- [x] **31 spec files / 406 tests**, colocated, no database or dev server needed
- [x] Zoneless Angular 21 throughout — signals for state, `await fixture.whenStable()` in tests, vitest under jsdom (not Karma)

---

## 4. What is NOT done

### The gap between the halves

- [ ] **One endpoint pair, and it is the auth one.** Nothing serves teams, submissions, judging, results or event settings — no controllers, services or DTOs outside `auth/`. Every repository is still called only by tests.
- [ ] **Nothing persists in the UI.** Apart from the signed-in user, every page runs on in-memory stand-ins that reset on reload, by design.
- [ ] **The Google Forms pipeline stops at registration.** `tools/FormRegistrationImporter` loads the registration CSV into `users` / `teams` / `team_members`, and that is the whole of it. **There is no submission form schema and no submission importer** — [docs/README.md](README.md) still records submission-by-form as undecided, and nothing populates `submissions.status` / `submitted_at`. The site now links participants to both forms, so `MySubmission` displays a status that nothing can currently set.
- [ ] **No HTTP interceptor.** The JWT is stored and exposed as `AuthService.token()`, but nothing attaches it to a request — there are no authenticated requests yet. The first non-auth call needs one written alongside it.
- [ ] **The demo sign-in still bypasses everything.** `signIn(role)` picks one of three hardcoded users with no token, and the guards cannot tell that session from a real one. Guards gate *navigation*; only `SecurityConfig` gates data, and today it guards nothing anyone calls.
- [ ] **A stored session is never revalidated.** Reload restores the user from `localStorage` without checking the token; `GET /api/auth/me` exists for this and has no caller. An expired or revoked token still looks signed-in.
- [ ] **No tests on any of the above.** The backend `auth/` package has no test class; `auth.spec.ts` and `sign-in.spec.ts` predate the Google flow and exercise the demo path only.

### Smaller gaps

- [ ] **The initial bundle is over budget.** 506.68 kB against a 500 kB warning threshold (it was 490.74 kB before the HTTP layer, and 517.29 kB before the Google Forms change dropped `FormsModule` from the two participant pages). `npm run build` warns and still exits 0, so **CI does not catch this** — only the 1 MB error threshold fails a build. Lazy-loading another route is the way back under.
- [ ] **The client id is configured in two places** — `GOOGLE_CLIENT_ID` on the frontend and `app.google.client-id` on the backend. They must match or login 401s on audience verification, and nothing checks that they do.
- [ ] **No linting.** No ESLint config and no lint script; Prettier is the only tool configured and it only formats. CI marks where the step goes.
- [ ] **Uneven test coverage.** Every routed page has a spec, but `core/results/results.ts`, `core/event/milestones.ts`, `event-content.ts` and `event-config.ts` have none, and most presentational pieces are untested — `page-header`, `profile-menu`, `state-locked`, `event-timeline`, `status-pill`, and the section components under `progress/`, `results/`, `judge-portal/`, `judge-review/`, `admin-dashboard/` and parts of `home/`.
- [ ] **Six CHECK vocabularies remain unratified** — see [docs/README.md](README.md). Three are at least exercised by the frontend; three (`assignments.status`, `notifications_log.type`, `notifications_log.status`) had never been reviewed until the judge pages started consuming the first of them.
- [ ] **Placeholder content.** `DEMO_USERS`, `DEFAULT_EVENT_CONFIG` dates and the service seeds are marked as placeholders in the source. Read the file header before treating any of it as a team decision.

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

**In flight:** nothing. `feature/admin-judges` (PR #37) merged as `86cb516`.

---

## 6. What comes next

In order. The first item is not first by preference.

1. **Test the auth package.** It is the only code that decides who gets in, it is the only code with no test, and CI cannot catch a break in it. A `@WebMvcTest` over `AuthController` with the verifier stubbed covers the three branches that matter (valid + registered → 200, valid + unregistered → 403, unverified email → 401); a `JwtService` round-trip test covers the rest. Do this before the endpoints multiply.
2. **First non-auth controller + DTOs**, following the packages-by-feature shape the entities already use. Expect a 401 on the first call — `anyRequest().authenticated()` is the rule, and that is deliberate now rather than accidental.
3. **An HTTP interceptor**, in the same change as that controller, to attach `AuthService.token()` as `Authorization: Bearer …`. Nothing does this today.
4. **Replace the stand-ins one at a time.** They already return `Promise<{ok} | {ok:false, error}>`, so callers should not need reshaping — this is meant to be a change of data source. `signInWithGoogle()` is the worked example of the shape.
5. **Close the auth loopholes** — call `GET /api/auth/me` on reload so a stale token cannot look signed-in, and decide when the demo `signIn(role)` path comes out.
6. **Get back under the bundle budget** (§4) — the next eager route added will push it further.
7. **Ratify the remaining CHECK vocabularies** now that judge and admin pages consume them, and note that `SecurityConfig`'s `hasAuthority("admin"/"judge")` is a third copy of the `users.role` literals.
8. **Add ESLint**, and fill the coverage gaps listed in [§4](#4-what-is-not-done).

Running alongside, and not waiting on any of the above: **the two remaining workspace sections**. Neither is blocked on the schema — Judging Progress maps onto its tables as designed, and Event Settings ships reduced the way the others already do. Judging Progress is parked pending a decision on how judging is run, not on anything technical.

**That dependency is now cleared.** `EventSettingsService` (#43) owns `event_settings` as state and every consumer reads it reactively, so the Event Settings section is a form over `update()` rather than a refactor. The one thing still outstanding is wiring `ResultsService.published` to the publication state the Results section sets, instead of to the phase.

---

## 7. Verification

| Suite | Command | Result | Run against |
| ----- | ------- | ------ | ----------- |
| Frontend | `npx ng test --watch=false` | **27 files, 343 tests passed** | `feature/admin-judges`, 2026-08-13 |
| Frontend | `npm run build` | **517.29 kB initial — ⚠️ budget warning, exit 0** | `feature/admin-judges`, 2026-08-13 |
| Backend | `./mvnw -B clean test-compile` | **BUILD SUCCESS** (compiles; no tests run) | `523911f`, 2026-08-13 |
| Backend | `./mvnw -B clean verify` | **44 tests, 0 failures, 0 errors — BUILD SUCCESS** | `98e50df`, 2026-08-12 |

**The backend suite was not re-run for this pass** — no Postgres was reachable, so only compilation was verified. The 44-test figure is carried forward from `98e50df` and predates the `auth/` package; since `auth/` has no tests of its own, the count is expected to be unchanged, but nobody has confirmed the context still loads against a real database with the new validated properties in play. Run `./mvnw -B clean verify` with the container up before relying on it.

**The bundle warning is not this branch's.** It arrived with the HTTP layer in #34 (490.74 kB → 517.29 kB) and the figure has not moved since: the admin route is the only lazy one, so the Judges section went into its chunk (75.02 kB → 89.32 kB) and left the initial total alone. Everything else is eager, which is where the 17.29 kB overrun lives. The hard error is 1 MB, which is why CI is still green — see [§4](#4-what-is-not-done).

The spec count is 343, up from 325: the Judges section added 18 (10 on `AdminService`, 8 on the dashboard). Before it, neither the Assignments section nor the auth work had added a spec.

The backend run was a real one against the container on 5433, not a skip: `UserRepositoryTest` trips `users_email_lowercase_check` deliberately, and the log shows the constraint firing. It also means V1 + V2 apply cleanly and every entity mapping passes `ddl-auto=validate` against the live schema.

**Backend tests require a running Postgres.** A connection error means the container is not up — start it with `docker start hackathon-pg16`.

---

## 8. Where the detail lives

This file says *what state things are in*. It deliberately does not repeat the reasoning.

| For | Read |
| --- | ---- |
| Conventions, traps, commands, Boot 4 gotchas, Angular 21 notes | [CLAUDE.md](../CLAUDE.md) |
| Which schema decisions are ratified vs. still proposals | [docs/README.md](README.md) |
| The structural schema (11 tables, 3 slides) | `docs/databaseSchema.pdf` — **structural only, and predates V2** |
| The actual current schema | The live database, or V1 + V2 read together |

**These go stale the same way everything else does.** This file, CLAUDE.md and docs/README.md describe the same system from different angles, and nothing checks them against each other. A migration that changes a CHECK vocabulary, a DEFAULT or an `ON DELETE` rule has to update all three, plus the frontend union that mirrors it. When in doubt, read the live constraint:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```
