# Project status

**Repo:** `mum-hackathon-2026/hackathon-website` — this file is `docs/PROJECT-STATUS.md`; paths below are relative to the git root.
**As of:** `2749e91` (= `origin/main`) plus the Assignments section on `feature/admin-assignments`, 2026-08-13.
**Verified:** the frontend suite and a production build were run against the branch; the backend figures are carried forward from `98e50df` — see [§7](#7-verification). Everything else here is read from the source tree.

This is the **progress tracker**: what is built, what is not, and what comes next. It does not explain *how* anything works — [CLAUDE.md](../CLAUDE.md) holds the conventions and [docs/README.md](README.md) holds the schema decisions. When a fact here needs detail, this file points at one of those rather than repeating it. See [§8](#8-where-the-detail-lives).

---

## 1. At a glance

| Area | State | One line |
| ---- | ----- | -------- |
| **Database** | 🟢 Done | 11 tables across V1 + V2 + V3, live and migrating cleanly |
| **Backend persistence** | 🟢 Done | All 11 tables mapped, 11 repositories, 44 tests passing |
| **Backend API** | 🔴 Not started | Zero controllers, services, DTOs — no HTTP endpoint exists |
| **Backend security** | 🔴 Not started | Starter on the classpath, no `SecurityFilterChain` written |
| **Frontend pages** | 🟢 Done | 12 components behind 13 routes, all three roles covered |
| **Admin workspace** | 🟡 5 of 10 | Overview, Teams, Participants, Submissions, Assignments built; five still stubs |
| **Frontend data** | 🟡 Stand-ins | 7 in-memory services shaped like the API that will replace them |
| **Integration** | 🔴 Not started | The two halves have never spoken; no HTTP client is even provided |
| **CI** | 🟢 Done | Two jobs, both gating; a failing spec cannot reach `main` |
| **Docs** | 🟢 Current | This file, CLAUDE.md and docs/README.md all current as of `98e50df` |

**The single most important line:** the persistence layer is finished and the UI is finished, and **nothing connects them**. Every page runs on in-memory data that resets on reload. Wiring them together is the whole of the remaining work, and it starts with [§6](#6-what-comes-next).

---

## 2. Backend — what is done

### Schema and migrations

- [x] **V1 `V1__baseline_schema.sql`** — creates all 11 tables, seeds the `event_settings` singleton inert (registration windows null, judging closed, nothing published)
- [x] **V2 `V2__hard_delete_and_status_cleanup.sql`** — ratifies hard delete, the `teams.status` cleanup, and the judge cascade
- [x] **V3 `V3__form_registration.sql`** — registration moves to a Google Form: `users.google_sub` becomes nullable (NULL = registered, never signed in), and `phone` / `resume_url` / `linkedin_url` are added, all nullable because judges and admins are rows in `users` too
- [x] Conventions held throughout V1: `bigint generated always as identity`, `timestamptz`, `text` + `CHECK` over `varchar(n)`, no Postgres `ENUM` types, `numeric` for scored values, every FK index-backed
- [x] **Two Postgres roles with a privilege split** (`scripts/bootstrap.sql`) — `hackathon_migrator` owns the schema and runs Flyway; `hackathon_app` is DML-only with no DDL
- [x] Local Postgres 16 in Docker (`hackathon-pg16`) on **5433**

The 11 tables: `users`, `event_settings`, `teams`, `team_members`, `submissions`, `judging_criteria`, `assignments`, `scores`, `team_results`, `notifications_log`, `audit_log`.

### Entities and repositories

- [x] **11 `@Entity` classes**, one per table, in feature packages under `my.monash.hackathon.hackathon_website_backend` — `user/`, `team/`, `event/`, `submission/`, `judging/`, `result/`, `notification/`, `audit/`
- [x] **11 Spring Data repositories**, deliberately thin — `JpaRepository` plus derived queries only. **No `@Query` anywhere in the codebase.**
- [x] Schema rules encoded in the mappings rather than left to convention: `@MapsId` shared primary keys on `TeamMember` / `Submission` / `TeamResult`, the `EventSettings` singleton, `Score`'s criterion snapshot, `jsonb` on `AuditLog.details`, `@Version` on `Team` and `Submission`

> Each of those encodes a constraint that a naive entity would silently discard. Before editing one, read *Mappings that encode a schema rule* in [CLAUDE.md](../CLAUDE.md).

### Tests

- [x] **13 test classes / 44 tests** — 11 repository tests (JPA slice against real Postgres), `FlywayBaselineMigrationTests`, and the generated context-load test
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

- [x] Two paths onto one `Progress` component, distinguished by `data: { tab }`, so each view is linkable
- [x] `AdminDashboard` is the only lazy route — eagerly importing it pushed the initial bundle past its budget, and organisers are the rarest role. The next page added will face the same choice.
- [x] Wildcard `**` stays last

### Core services (`src/app/core/`)

- [x] `auth/` — `AuthService`, `roleGuard` factory (`participantGuard`, `judgeGuard`, `adminGuard`, `signedInGuard`), `SESSION_STORAGE` token
- [x] `event/` — `EVENT_CONFIG` token, `PhaseService`, `MilestoneService`, static site copy
- [x] `team/`, `submission/`, `results/` — participant-scoped stand-ins
- [x] `judge/` — assignments, scores, criteria; validation repeats the tables' CHECK constraints so the UI never accepts what the API would reject
- [x] `admin/` — event-wide read model (a join across `teams`, `team_members`, `submissions`, `assignments`), plus rename and settle mutations on a team

> **Nothing in `AdminService` is counted twice.** A team's member count comes from the roster, its completed reviews from the assignment rows, and a judge's workload from the same rows — none of them is seeded alongside the thing it counts. Two fields recording one fact can disagree with nothing to catch it, which is the shape of bug V2 undid on `teams.status`. Specs assert each pair agrees.

### The admin workspace

`admin/dashboard/:section` is ten sections, each its own URL. **Five are built:**

| Section | State | Note |
| ------- | ----- | ---- |
| Overview | ✅ Built | Six stat tiles, urgent actions, activity feed |
| Teams | ✅ Built | Filterable; rename, withdraw, disqualify |
| Participants | ✅ Built | Roster with derived eligibility; read-only |
| Submissions | ✅ Built | Filterable, with links |
| Assignments | ✅ Built | Assign/unassign judges, panel workload, coverage filters |
| Judges, Judging Progress, Results & Publication, Event Settings, Audit Log | ⬜ Stub | Placeholder rather than hidden, so the shape is visible |

**None of the five remaining is blocked on the schema.** Each was checked against V1 + V2 rather than against the design draft alone, and where the draft wants something the database cannot hold, the section ships reduced and says so in place:

- **Participants** — no student ID column and no eligibility column, so no Verify/Flag action. Eligibility is derived from the address and `users.email_verified` instead, screened against `site.studentEmailDomain`. `event_settings.screening_enabled` is surfaced but gates nothing.
- **Teams** — no `locked` status in `teams_status_check`, so no Lock action; Withdraw and Disqualify are the settled states that do exist.
- **Assignments** — supported as drawn. Two departures are constraints rather than choices: a repeat assignment is refused (`assignments_team_id_judge_id_key` is UNIQUE, where the draft ignores it silently), and removing a judge who has started asks first, because `scores.assignment_id` is `ON DELETE CASCADE` and their scores go with the row.

> **`AdminJudge.isActive` is gone.** It was documented as a `users` column and there has never been one — V1's `users.status` was dropped by V2 and nothing replaced it. Being a judge is holding `users.role = 'judge'`; there is no separate active flag, so the Overview's "Active judges" tile is now a plain judge count.
>
> **The draft's `pending` state, however, is now representable — V3 changed this.** While `users.google_sub` was NOT NULL a row could only appear once that person had signed in, so "invited but not yet joined" had nowhere to live. V3 dropped that NOT NULL: **a row with a NULL `google_sub` is exactly a person who is registered but has never signed in**, which is what the form importer creates for every participant. The same shape would represent a judge who has been added to the allowlist but has not yet logged in. Nothing in the admin UI reads it yet — this is a state the schema can now hold, not a feature that exists.

All seven mirror their tables field for field, and the three team-facing ones share seed data on purpose so they do not describe different universes.

### Layout kit and design system

- [x] 8 reusable components — `nav-bar`, `profile-menu`, `page-header`, `state-locked`, `confirm-dialog`, `event-timeline`, `faq-list`, `status-pill`
- [x] `styles.scss` holds the design system as CSS custom properties — brand accents with pre-darkened `-ink` variants, a neutral ramp, `--font-sans` / `--font-display`

### Tests

- [x] **27 spec files / 324 tests**, colocated, no database or dev server needed
- [x] Zoneless Angular 21 throughout — signals for state, `await fixture.whenStable()` in tests, vitest under jsdom (not Karma)

---

## 4. What is NOT done

### The gap between the halves

- [ ] **No controllers, services or DTOs.** Grepping for `@RestController`, `@Service` or `@Controller` returns zero hits. There is no HTTP endpoint of any kind.
- [ ] **No security configuration.** No `SecurityFilterChain`, no JWT wiring, no OAuth2 login flow.
- [ ] **No frontend HTTP client.** `app.config.ts` provides only `provideBrowserGlobalErrorListeners()` and `provideRouter(routes)` — no `provideHttpClient`, and nothing imports `HttpClient` or calls `fetch`.
- [ ] **Nothing persists.** Every page runs on in-memory stand-ins that reset on reload, by design.
- [ ] **Authentication is a demo, not a security boundary.** `signIn(role)` picks one of three hardcoded users and stores a role key in `localStorage`. The guards gate *navigation only* — there is no server enforcing anything behind them.

### Smaller gaps

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

**In flight:** `feature/admin-assignments` — the Assignments section, the assignment read model behind it, and the removal of `AdminJudge.isActive`.

---

## 6. What comes next

In order. The first item is not optional and is not first by preference.

1. **Write the `SecurityFilterChain` before or alongside the first controller.** `spring-boot-starter-security` is on the classpath with no configuration class, so Boot's default chain applies: every endpoint is behind HTTP Basic with user `user` and a random password logged at startup. **Your first controller will answer 401 and look broken.** This is the single most likely thing to cost an afternoon.
2. **First controller + DTOs**, following the packages-by-feature shape the entities already use.
3. **Wire the frontend** — add `provideHttpClient`, then replace one stand-in at a time. The stand-ins already return `Promise<{ok} | {ok:false, error}>`, so callers should not need reshaping; this is meant to be a change of data source.
4. **Real authentication** — Google OAuth2 client id/secret and `app.jwt.secret` already have slots in `application-example.properties`, but no code reads `app.jwt.*` and there is no Redis starter behind the `spring.data.redis.*` entries. Those properties are inert placeholders today.
5. **Ratify the remaining CHECK vocabularies** now that judge and admin pages consume them.
6. **Add ESLint**, and fill the coverage gaps listed in [§4](#4-what-is-not-done).

Running alongside, and not waiting on any of the above: **the five remaining workspace sections**. None is blocked on the schema — Judging Progress and Audit Log map onto their tables as designed, and Judges, Results and Event Settings ship reduced the way Participants, Teams and Assignments already do.

---

## 7. Verification

| Suite | Command | Result | Run against |
| ----- | ------- | ------ | ----------- |
| Frontend | `npx ng test --watch=false` | **27 files, 324 tests passed** | `feature/admin-assignments`, 2026-08-13 |
| Frontend | `npm run build` | **490.74 kB initial, no budget warning** | `feature/admin-assignments`, 2026-08-13 |
| Backend | `./mvnw -B clean verify` | **44 tests, 0 failures, 0 errors — BUILD SUCCESS** | `98e50df`, 2026-08-12 |

The initial bundle has not moved since #29: the admin route is lazy, so both new sections went into the `admin-dashboard` chunk (75.02 kB) rather than the initial one. Every other route is still eager, and the 500 kB figure is the **warning** threshold — the hard error is 1 MB.

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
