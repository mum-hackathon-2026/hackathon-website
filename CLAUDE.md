# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git repository root is `hackathon-website/` (one level below the usual working directory `C:\Users\ASUS\SEM3\gdghackathon`). It is a two-app monorepo with no shared build tooling — `frontend/` and `backend/` are built, tested, and run independently, and CI treats them as two separate jobs.

### What exists today

**The two halves are connected at exactly one seam: sign-in.** `POST /api/auth/google` and `GET /api/auth/me` are the only endpoints that exist, and `AuthService.signInWithGoogle()` is the only network call the frontend makes. Everything else on both sides is unchanged: no controller serves teams, submissions or judging, and every page still reads in-memory stand-ins. Read "there is an API now" as true of authentication and nothing else.

- **Backend** — Flyway migrations V1 + V2 + V3 + V4, Postgres roles, CI service container, and **all 11 tables mapped**: `User`, `EventSettings`, `Team`, `TeamMember`, `Submission`, `JudgingCriteria`, `Assignment`, `Score`, `TeamResult`, `NotificationLog`, `AuditLog`. Each has a Spring Data repository and a JPA-slice test. Nothing above that layer exists.
- **Frontend** — twelve page components behind thirteen routes covering all three roles (home, timeline, organisers, my team, my submission, progress ×2, judge portal, judge review, admin dashboard, results, sign-in, 404), a shared layout kit, and in-memory stand-ins for the API. Zoneless Angular 21, standalone components, signals throughout.

Both halves lean on **placeholder data that is marked as such in the source** — `DEMO_USERS` and `DEFAULT_EVENT_CONFIG` dates in the frontend, the seeds in `TeamService`, `SubmissionService` and `ResultsService`. Read the file header before treating any of it as a decision the team made. `DEMO_USERS` in particular now sits **beside** a working Google sign-in rather than instead of it — see *Authentication*.

## Database

**Local Postgres 16 runs in Docker on port 5433** (container `hackathon-pg16`, volume `hackathon_pg16_data`). Port 5432 belongs to an unrelated native PostgreSQL 18 install on this machine — never point project config at 5432.

Two roles with a deliberate privilege split, created by `scripts/bootstrap.sql`:

| Role | Password (local dev only) | Rights |
| ---- | ------------------------- | ------ |
| `hackathon_migrator` | `dev_migrator_local` | Owns the schema. Used by Flyway. Has DDL. |
| `hackathon_app` | `dev_app_local` | The application. LOGIN + DML only. **No DDL** — `CREATE TABLE` is denied. |

Those passwords are container-local development values, documented in `scripts/bootstrap.sql`. They must never be reused for any deployed environment.

`spring.flyway.user` / `spring.flyway.password` are configured **separately** from `spring.datasource.*` for exactly this reason. If Flyway runs as `hackathon_app`, migrations fail with `permission denied for schema public`.

The container's `postgres` superuser password is chosen per-machine and is deliberately not recorded anywhere in the repo. It is only used for `scripts/bootstrap.sql`; no application config references it. README.md has connection settings and a troubleshooting table for connecting by hand.

### Schema source of truth

`docs/databaseSchema.pdf` defines the relational schema, and `V1__baseline_schema.sql` matches it column for column. It is **structural only** — it fixes tables, columns, primary keys, foreign keys and unique constraints, but specifies no data types, no `ON DELETE` behaviour, no CHECK vocabularies, and no team-size limits.

Most of that second list is still an unratified proposal. Don't treat the remaining enum-like CHECK values as settled — the frontend hardcodes those literal strings, and the team has not signed off on them. They divide by how much scrutiny they have had:

- `users.role`, `submissions.status`, `team_results.outcome` — used verbatim by the frontend, so at least read and exercised, but never formally approved.
- `assignments.status`, `notifications_log.type`, `notifications_log.status` — **never formally reviewed.** `assignments.status` is now consumed by the judge portal, which took V1's proposal verbatim rather than ratifying it; the two `notifications_log` vocabularies still have no consumer at all. Treat all three as a first draft.

`docs/README.md` tracks decided versus open in full, and is current as of V4.

V1's own conventions, held throughout: `bigint generated always as identity` (never `bigserial`), `timestamptz` everywhere, `text` + `CHECK` over `varchar(n)`, **no Postgres ENUM types**, `numeric` for scored values (never float), and every FK column index-backed.

**V2 ratified three decisions**, and the schema now differs from V1 in ways the PDF does not show:

- **`users.status` is gone.** Deletion is a **hard delete**, not a soft delete — a deleted user is removed from `users`, not flagged. There is no `'active' / 'suspended' / 'deleted'` column to filter on, and no `status` field on the `User` entity.
- **`teams.status` no longer has `'submitted'`** — the vocabulary is `forming`, `complete`, `disqualified`, `withdrawn`. Submission state lives **only** on `submissions.status`, which keeps its full vocabulary (`draft`, `submitted`, `withdrawn`, `disqualified`). V1 recorded the same fact in both places with nothing keeping them in step. When you need to know whether a team submitted, join `submissions` — don't look at `teams.status`.
- **`assignments.judge_id` is `ON DELETE CASCADE`** (V1 had `RESTRICT`). Under hard delete, `RESTRICT` would stop a judge deleting their own account for as long as they held any assignment. `scores.assignment_id` already cascades, so deleting a judge removes their assignments and their scores with them.

**V3 moved registration off the site and onto a Google Form**, which changes who creates a user row and when:

- **Registration is form-based.** A Google Form collects **one row per team** — a leader plus up to three more members, 1–4 total — with a name, email, phone, Google Drive resume link and LinkedIn URL per person. `tools/FormRegistrationImporter` imports the exported CSV. Nobody registers through the site.
- **`users.google_sub` is nullable, and a NULL means "registered but has never signed in".** Only a real OAuth sign-in yields a subject claim, so the form cannot produce one; `AuthController` fills it in on first sign-in by matching on email. **`users` is therefore the sign-in allowlist** — the row exists before the person ever authenticates, and its existence is what permits them to. The UNIQUE constraint survives untouched because Postgres does not collide NULLs in a unique index.
- **`users` gained `phone`, `resume_url` and `linkedin_url`, all nullable.** The form requires all three of every participant, but `users` is the accounts table, not the participants table: judges and admins are rows in it too and have no resume or LinkedIn. **Enforcement belongs to the form and the importer, not the database** — do not make these NOT NULL, and do not add a CHECK to the URL columns. V3 argues the case in a comment; read it before touching them.
- **V3 changed nothing else.** No `submitted` flag on `teams`, nothing on `submissions`, nothing on `teams.status`.
- **V4 added `users.github_url`**, the fourth form-collected field and nullable for the same reason. **There are now two `github_url` columns and they are unrelated:** `users.github_url` is *the person* — their own account, collected at registration for screening — and `submissions.github_url` is *the project* — the repo the team built. A join selecting both can hand you a profile where you wanted a repo with nothing to catch it, so always qualify which you mean. Both columns carry a `COMMENT ON COLUMN` saying so, and both entity fields carry a javadoc cross-reference.

**The `ON DELETE` rules are now live behaviour, not a theoretical annotation.** While users were soft-deleted nothing exercised them; now that a delete really removes the row, each rule fires for real. Deleting a user cascades away their `team_members` row and (as a judge) their `assignments` and `scores`, and nulls out `teams.created_by`, `event_settings.updated_by`, `notifications_log.user_id` and `audit_log.actor_user_id`. That last one means **deleting a user anonymises their audit trail rather than deleting it** — the entries survive with a null actor.

**Empty teams are retained deliberately.** `team_members.user_id` cascades, so a team whose last member leaves stays behind with no members. Nothing auto-deletes it — no trigger, no cascade, no sweep — and that is a decision, not an oversight. The team keeps its UNIQUE name and join code, so the name stays reserved and anyone with the code can rejoin and revive it. V2 says so in a comment; don't "fix" it.

### Migrations

Schema lives in `backend/src/main/resources/db/migration/`, managed by Flyway. `spring.jpa.hibernate.ddl-auto=validate` — Hibernate verifies that entity mappings match the migrated schema and never issues DDL of its own.

**Applied migrations are immutable.** Never edit a `V*.sql` file that has been merged — Flyway records a checksum per migration, and changing an applied file makes every teammate's database fail validation on next startup. Always add a new `V<n>__description.sql` instead.

### First-time setup

```powershell
docker start hackathon-pg16          # or docker run, see README
docker exec -i hackathon-pg16 psql -U postgres < scripts/bootstrap.sql
cd backend
copy src\main\resources\application-example.properties src\main\resources\application-local.properties
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

## Backend code

Packages are by feature, not by layer, under `my.monash.hackathon.hackathon_website_backend`: `user/`, `team/` (`Team` + `TeamMember`), `event/`, `submission/`, `judging/` (`JudgingCriteria`, `Assignment`, `Score`), `result/`, `notification/`, `audit/`. Keep that shape. `auth/` holds the Google sign-in slice; `tools/` holds standalone operator programs — currently the form-registration importer — which are plain `main` classes on raw JDBC and are the one place in the backend that is not Spring-managed.

Repositories are deliberately thin — `JpaRepository` plus a handful of derived query methods (`findByEmail`, `findByJoinCode`, `findByJudgeId`, `findByIsActiveTrueOrderByDisplayOrder`, …). **There is no `@Query` anywhere in the codebase**; keep it that way until a query genuinely cannot be expressed derivationally.

### Conventions that hold across every entity

Each exists for a reason that is easy to undo by accident:

- **`role` and `status` are `String`, not Java enums.** The remaining CHECK vocabularies are unratified proposals (see *Schema source of truth*). An enum would freeze them early and risks failing `ddl-auto=validate` against a text column. `User` has no `status` field at all — V2 dropped the column.
- **Column DEFAULTs are duplicated as Java field initialisers** (`role = "participant"`, `status = "forming"` / `"draft"` / `"pending"`, `shortlisted = false`, `weight = 1.00`, `maxTeamSize = 4`, …). This is deliberate: those columns are `NOT NULL` and Hibernate always names them in the INSERT, so the database DEFAULT never gets a chance to apply — a null field fails the insert rather than falling back. **Nothing enforces the correspondence**, and no test can catch a mismatch since both sides stay individually valid. A migration that changes a DEFAULT must change the initialiser too.
- **`created_at` / `joined_at` / `assigned_at` are database-owned**: `insertable = false, updatable = false` plus Hibernate's `@Generated(event = EventType.INSERT)` so the in-memory entity is refreshed after insert instead of holding a stale null. There is no setter for them.
- **Every association is `FetchType.LAZY`.** `open-in-view` is false, so an untraversed proxy fails loudly instead of quietly opening a connection during response rendering.
- **Entities have a `protected` no-arg constructor for Hibernate** and a public constructor taking the non-null columns. Optional columns are set afterwards.
- **`numeric(p, s)` columns carry explicit `precision`/`scale` on `@Column`** and are `BigDecimal`, never `double`. `ddl-auto=validate` checks these, so `numeric(5, 2)` must be `precision = 5, scale = 2` (`numeric(6, 2)` for `team_results.final_score`).

### Mappings that encode a schema rule

A naive entity would discard each of these:

- **Three entities share their primary key with a parent via `@MapsId`** — `TeamMember` (on `users`), `Submission` (on `teams`) and `TeamResult` (on `teams`). In each case the FK column *is* the primary key, and that is what enforces the cardinality: one team per person, one submission per team, one result per team. Adding a `@GeneratedValue` surrogate id would silently drop the constraint. The pattern is a `@Id @Column` scalar field plus `@MapsId` on the `@OneToOne`.
- **`EventSettings` is a singleton row.** `id` is assigned, not generated (`EventSettings.SINGLETON_ID = 1L`), because V1 constrains it with `check (id = 1)`. Reach it via `EventSettingsRepository.findSingleton()` rather than `findAll().get(0)`.
- **`Score` snapshots its criterion.** The constructor copies `criteria.getMaxScore()` and `getWeight()` into `criteriaMaxScoreSnapshot` / `criteriaWeightSnapshot`, and V1's `check (score >= 0 and score <= criteria_max_score_snapshot)` validates against the snapshot. Editing a criterion later therefore cannot retroactively invalidate scores already given. Never set the snapshots by hand.
- **`AuditLog.details` is `jsonb` carried as a `String`** via `@JdbcTypeCode(SqlTypes.JSON)` — no JSON format mapper, no extra dependency. Nothing checks the structure or even that the string is JSON; malformed input surfaces as a database error at flush time. Build the string with a serialiser, not concatenation.
- **`Team` and `Submission` have `@Version` columns**, giving optimistic locking on concurrent edits. The other entities do not.

## Authentication

The one place the two halves meet. Eight classes in `backend/.../auth/` plus `core/auth/auth.ts` on the frontend.

**The flow.** Google Identity Services renders the sign-in button in `sign-in.ts` and hands back an ID token → `AuthService.signInWithGoogle()` POSTs it to `/api/auth/google` → `GoogleTokenVerifier` checks it against Google's public keys with our client id as the audience → `AuthController` looks the email up in `users` → `JwtService` issues an HS256 JWT carrying `sub` (the user id), `email`, `role` and `name` → the frontend stores it and puts the user in a signal.

**Registration is by pre-existing row, not by signing up.** A valid Google account whose email is not already in `users` gets **403**, and that is the whole of the access control: there is no self-registration endpoint. `AuthController` also refuses an unverified Google email with 401, lowercases the address before looking it up (V1 enforces `email = lower(email)`), and on success backfills `google_sub`, `email_verified`, `last_login_at` and the display name from the Google profile. **A successful login therefore writes to `users`** — it is not a read-only path.

**`SecurityConfig` is the chain, and its matchers are ahead of the code.** Stateless, CSRF disabled, CORS allowing `http://localhost:4200` only, `JwtAuthenticationFilter` before `UsernamePasswordAuthenticationFilter`. The rules are `/api/auth/**` permitted, `/api/admin/**` requiring authority `admin`, `/api/judge/**` requiring `judge`, and **`anyRequest().authenticated()`**. The last line is the one to remember: nothing but `/api/auth/**` exists yet, so the first endpoint added anywhere else answers 401 until a caller sends a bearer token. The authority strings come straight from `users.role` via `SimpleGrantedAuthority`, with no `ROLE_` prefix and no mapping table — a change to the `users_role_check` vocabulary silently changes who can reach `/api/admin/**`.

**Config is validated at startup, so a missing value is a boot failure, not a 500 later.** `JwtProperties` (`app.jwt.secret`, `app.jwt.expiration-ms`) and `GoogleAuthProperties` (`app.google.client-id`) are `@Validated` records enabled by `SecurityConfig`; `@NotBlank`/`@Positive` mean the context refuses to start without them. `secret` must be at least 32 characters — `Keys.hmacShaKeyFor` throws below that. This is why `src/test/resources/application.properties` carries test-safe values for all three: it *shadows* the main file, so anything the context needs has to be repeated there or every test that loads a context fails.

**What is deliberately not built yet:**

- **No HTTP interceptor.** The JWT is stored under `hackathon.jwt-token` and exposed as `AuthService.token()`, but nothing attaches it to an outgoing request — there are no authenticated requests to attach it to. The first non-auth endpoint the frontend calls needs an interceptor written alongside it.
- **`GET /api/auth/me` has no caller.** It exists so a reload can restore auth state from the token; the frontend restores from `localStorage` instead and never validates the stored session against the server. A revoked or expired token still looks signed-in to the UI.
- **The demo path is still live.** `signIn(role)` picks a `DEMO_USERS` entry with no network call and no token, and the sign-in page still renders one button per role. Guards do not distinguish the two, so a demo session passes every `canActivate` in the app — they gate navigation, and only the backend chain gates data.
- **No test covers any of it.** The backend `auth/` package has no test class, and the frontend specs exercise the demo path only. CI compiles this code but never runs it.

**The client id exists twice and the two copies must agree.** `GOOGLE_CLIENT_ID` in `core/auth/auth.ts` (a token, defaulting to the configured id) is what the browser sends to Google; `app.google.client-id` is what `GoogleTokenVerifier` sets as the expected audience. A mismatch fails audience verification, so login answers 401 while both halves look correctly configured in isolation. Change them together.

## Frontend code

```
src/app/
  core/            singleton services, no templates
    admin/         AdminService — event-wide read model for organisers
    auth/          AuthService, role guards, SESSION_STORAGE token
    event/         EVENT_CONFIG token, PhaseService, MilestoneService, static copy
    judge/         JudgeService — assignments, scores, criteria
    results/       ResultsService
    submission/    SubmissionService
    team/          TeamService
  layout/          reusable chrome: nav-bar, profile-menu, page-header,
                   state-locked, confirm-dialog, event-timeline, faq-list,
                   status-pill
  pages/           one folder per route; home/, progress/, results/,
                   judge-portal/, judge-review/ and admin-dashboard/ have
                   their own section components
```

Components are standalone, `ChangeDetectionStrategy.OnPush`, and take inputs via the signal `input()` / `input.required()` API. Services expose `signal`/`computed` state, never subjects.

Routing lives in `app.routes.ts`. Note `/participant/progress/team` and `/participant/progress/event` are **two paths onto one `Progress` component**, distinguished by `data: { tab }` so each view is linkable.

**The frontend is written against the database's column names and CHECK literals verbatim.** `Role`, `TeamStatus`, `SubmissionStatus`, `ResultOutcome`, `EventSettings` and the `Team`/`TeamMember`/`Submission` interfaces each mirror a table field for field, so swapping the demo services for HTTP calls is a change of data source rather than a reshape. The flip side: changing a CHECK vocabulary in a migration breaks these types, and only the comments connect the two.

**That has already happened once, and it is worth knowing how quietly it went.** V2 removed `'submitted'` from `teams.status`; `TeamStatus` in `core/team/team.ts` went on declaring it, so the type permitted a value the database would reject. Nothing caught it. The literal was declared in the union but never constructed as a value, so there was no type error to raise and no assertion to fail — the build and all 169 specs stayed green throughout. It was found by reading the migration against the type, not by tooling, and fixed in `338a982`.

Expect the next one to be equally silent, and note that the usual safety nets barely apply. A stale literal only becomes an error when something sends it to Postgres, and almost nothing does: the sole live write path is login, which touches `users.role` only by reading it. The union comments naming their constraints are the whole of the enforcement. **When a migration changes a CHECK vocabulary, grep the frontend for the old literals in the same change** — and now also `SecurityConfig`, whose `hasAuthority("admin")` / `hasAuthority("judge")` are the same `users.role` literals written a third time.

### Core services

- `core/auth/auth.ts` — **two sign-in paths in one service.** `signInWithGoogle(idToken)` is real: it POSTs to the backend and stores the returned JWT (see *Authentication*). `signIn(role)` is the original demo path — one of three hardcoded `DEMO_USERS`, no network, no token — and is still what the specs and the role buttons use. Both end in the same `currentUser` signal, so **nothing downstream can tell a demo session from a real one.** The session is persisted as JSON in `localStorage` behind a `SESSION_STORAGE` injection token so tests can substitute an in-memory store (jsdom serves from an opaque origin where `localStorage` throws); the backend URL is behind `API_BASE_URL`, defaulting to `http://localhost:8080`. `ROLE_HOME` sends each role to its own landing page — `/participant/team`, `/judge/portal`, `/admin/dashboard`.
- `core/auth/role-guard.ts` — `roleGuard(role)` builds `participantGuard`, `judgeGuard` and `adminGuard`, and all three are now in use. `signedInGuard` gates `/results` on being signed in with *any* role, because results go to participants, judges and admins alike. All of them guard **navigation only** — they read a signal, not a token. The server-side equivalent is `SecurityConfig`'s matchers, and the two are written independently: a guard passing says nothing about whether the API would answer.
- `core/event/event-config.ts` — `EVENT_CONFIG` is an `InjectionToken` so tests can stand up a config in whichever phase they need. Its dates are **placeholders chosen to sit in the future**, not the real schedule. `MYT_OFFSET` (`+0800`) is passed to `DatePipe` so dates render in Malaysian time regardless of the reader's locale. `SiteCopy` holds wording that has no column yet.
- `core/event/phase.ts` — derives `EventPhase` from those dates against a shared 1s clock signal, and exposes `nextMilestone` / `remainingMs` for countdowns. Pages must reuse `PhaseService.now()` rather than starting a second interval. `judgingOpen` is exposed separately because V1 models it as an admin-flipped boolean, not a date window.
- `core/team/team.ts`, `core/submission/submission.ts`, `core/results/results.ts`, `core/judge/judge.ts`, `core/admin/admin.ts` — in-memory stand-ins, reset on reload by design. `JudgeService` and `AdminService` are the newest; `AdminService` is read-only (the dashboard reports, it does not edit) so it alone has no async mutations, and its seeds match the `JudgeService` and `ResultsService` team ids on purpose so the three do not describe different universes. They mirror the constraints the database would apply (unique team name, unique join code, `maxTeamSize`, `submissions_submitted_at_check`) so error paths are real. **Mutations are deliberately `async` and return `Promise<{ok} | {ok:false,error}>`** even though nothing awaits I/O: the async boundary is the part callers must cope with when a real endpoint replaces them, so it exists from the start.

`styles.scss` holds the whole design system as CSS custom properties on `:root` — Google-palette brand accents with pre-darkened `-ink` variants for contrast-safe text on `-tint` backgrounds, a neutral ramp, and `--font-sans` / `--font-display`. **Prefer the tokens over raw hex in component styles.** A handful of literals have crept in anyway (`nav-bar`, `profile-menu`, `hero`, `sponsors`, `organizers`, `contact`, `footer`); some are genuine one-offs with no token (the Discord brand blue, a gradient stop), but several duplicate an existing `-tint` value and should be replaced when those files are next touched. Token values mirror `frontend/figma-draft`, which is gitignored and not in the repo.

## Commands

### Backend (`backend/`)

Windows/PowerShell needs `.\mvnw.cmd` and quoted `-D` args; Mac/Linux uses `./mvnw`.

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"   # → http://localhost:8080
.\mvnw.cmd test
.\mvnw.cmd test "-Dtest=FlywayBaselineMigrationTests"           # single test class
.\mvnw.cmd -B clean verify                                      # what CI runs
```

### Importing Google Form registrations

`tools/FormRegistrationImporter` reads a CSV exported from the registration form's Google Sheet into `users`, `teams` and `team_members`. It is a plain `main` on raw JDBC — not a Spring bean — so it neither boots the context nor needs the Google client id, and it controls its own transactions. `exec-maven-plugin` is declared in `pom.xml` with the main class preconfigured; it has no `<executions>`, so it never runs as part of a build.

```powershell
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/registrations.csv"
```

Headers are matched case- and punctuation-insensitively (`Team Name`, `Member 1 Name`, `Member 1 Email`, `Member 1 Phone`, `Member 1 Resume`, `Member 1 LinkedIn`, `Member 1 GitHub`, and the same six for members 2–4); unknown columns such as Google's `Timestamp` are ignored. The tool prints the column mapping it derived and **refuses to run if the leader's block did not map**, because silently importing null resumes is the worst failure available to it.

**It is idempotent** — the form keeps collecting, so it gets re-run. A team already present with exactly the CSV's members is skipped; a team whose name is taken but whose members differ is rejected rather than merged. **Each team is one transaction**, so nothing is ever half-written. `--dry-run` performs the real inserts and rolls back, so the constraints genuinely fire rather than being approximated.

Rejections (duplicate email, a person on two teams, duplicate team name, size outside 1–4, malformed email, non-URL resume/LinkedIn/GitHub) are reported per row with a readable reason and do **not** fail the command — a human reads the report and chases them. The final line is machine-readable with stable keys — `RESULT mode=live rows=8 imported=2 skipped=0 rejected=6` — so an unattended caller can detect rejects by parsing `rejected=` rather than the exit status; `mode` is included so a dry run can never be mistaken for a live one. Connection defaults are the local container as `hackathon_app`; override with `IMPORT_DB_URL` / `IMPORT_DB_USER` / `IMPORT_DB_PASSWORD` in preference to `--password`.

`scripts/sample-form-registration.csv` is a worked example covering one valid 4-member team, a valid solo team, and one of each rejection.

**Tests require a running Postgres.** H2 has been removed from `pom.xml` entirely — the baseline schema uses Postgres-specific DDL (`timestamptz`, `jsonb`, identity columns, cross-column CHECKs) that no substitute engine can execute. If a test fails with a connection error, the container is not running.

`FlywayBaselineMigrationTests` cleans `hackathon_db_test`, re-applies every migration, and asserts that four migrations ran to target version `4`, that `flyway_schema_history` records V1 through V4 as successful, and that the expected tables exist. **Adding a migration means updating this test** — the executed count and target version are asserted exactly. Because `flyway.clean()` drops everything and `DB_TEST_URL` is overridable, it **refuses to run** unless the live JDBC connection metadata shows a database ending in `/hackathon_db_test` — read from the connection, not from a property, so it cannot be fooled by config. It proves the migrations work **from empty**; it does not prove a new migration applies on top of a database at the previous version, which is how teammates will meet it — start the app against the local database for that.

Test connection settings are environment-overridable so CI can supply its own: `DB_TEST_URL`, `DB_TEST_USER`, `DB_TEST_PASSWORD`, each defaulting to the local 5433 container.

### Persistence tests

Entity/repository tests use the JPA slice pinned to the real database:

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
```

`Replace.NONE` is what stops the slice swapping in an embedded database. Without it the test would run against an engine that cannot execute V1, proving nothing about the schema the application actually uses. The slice is transactional and rolls back per test, so tests do not leak rows into `hackathon_db_test`.

**Asserting on a constraint violation? Flush through the repository, not `TestEntityManager`.** Spring translates driver errors into its own `DataAccessException` hierarchy *at the repository proxy boundary*. `TestEntityManager.flush()` bypasses that proxy, so the constraint still fires but surfaces as Hibernate's raw `org.hibernate.exception.ConstraintViolationException` and an assertion expecting `DataIntegrityViolationException` fails. Use `repository.saveAndFlush(entity)`, which is also what application code will do:

```java
assertThatThrownBy(() -> teamMemberRepository.saveAndFlush(duplicate))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("team_members_pkey");
```

### Frontend (`frontend/`)

```bash
npm install
npm start                                    # ng serve → http://localhost:4200
npm run build                                # production config; enforces bundle budgets
npm test                                     # vitest via @angular/build:unit-test (jsdom)
npx ng test --watch=false                    # one-shot run, for scripted checks
npx ng test --watch=false --include src/app/core/team/team.spec.ts   # single spec
npx prettier --write .                       # only formatting tool configured
```

Production budgets are 500 kB warning / 1 MB error on the initial bundle and 4 kB / 8 kB per component stylesheet. Specs are colocated (`team.ts` → `team.spec.ts`) and need no database or dev server.

**The initial bundle is currently over the warning threshold — 517.29 kB against a 500 kB budget.** It was 490.74 kB before the auth work; `provideHttpClient()` and the `rxjs` behind it are eager, and the admin dashboard is the only lazy route, so the +26 kB landed in the initial chunk. `npm run build` prints a `WARNING` and still exits 0, so **CI stays green while the budget is breached** — only the 1 MB error threshold fails a build. Lazy-loading another route is the way back under.

Coverage is uneven and thinner than it looks. Every routed page has a spec, but four `core/` files have none — `results/results.ts`, `event/milestones.ts`, `event/event-content.ts`, `event/event-config.ts` — and most presentational pieces are untested (`page-header`, `state-locked`, `profile-menu`, `event-timeline`, `stage-list`, `rankings-table`, `judge-reviews`, and several `home/` sections). `auth.spec.ts` and `sign-in.spec.ts` cover the demo path plus one GIS test (that the client id comes from `GOOGLE_CLIENT_ID`); `signInWithGoogle` itself, the script loading and the 401/403 error branches are untested, as is the whole backend `auth/` package.

There is no lint script and no ESLint config — nothing lints this code. Prettier is the only tool configured, and it only formats. CI no longer has a lint step at all; the workflow marks where one goes once ESLint is configured.

## Configuration and profiles

- `src/main/resources/application.properties` is committed and holds profile-independent defaults: `ddl-auto=validate`, `open-in-view=false`, Flyway enabled and pointed at `classpath:db/migration`. It deliberately carries **no credentials**.
- `application-example.properties` is the template; copy it to `application-local.properties` (gitignored via `backend/.gitignore`) and fill in `app.google.client-id` and `app.jwt.secret`. **The app will not start without those two** — they are `@Validated @NotBlank` properties, so a missing value is a startup failure with a binding error, not a runtime 500.
- `src/test/resources/application.properties` **shadows** the main file rather than merging with it — both sit at the classpath root under the same name and the test classpath wins. Any setting tests need must be repeated there. It now carries `app.jwt.*` and `app.google.client-id` for exactly this reason: without them every context-loading test fails on validation.
- **Not everything in the template is wired.** `app.jwt.*` and `app.google.client-id` are read (`JwtProperties`, `GoogleAuthProperties`). `spring.data.redis.*` is still inert — no Redis starter in `pom.xml`. The `spring.security.oauth2.client.registration.google.*` block is commented out on purpose: the server-side redirect flow is unused because the frontend obtains the ID token itself and the backend only verifies it. The starter stays for a possible future integration.

**`SecurityConfig` now defines the chain**, so Spring Security's default auto-configuration no longer applies and the old "every endpoint is behind HTTP Basic with a random logged password" trap is gone. The replacement trap is `anyRequest().authenticated()`: a new endpoint outside `/api/auth/**` answers 401 to an anonymous caller by design. See *Authentication* for the matchers. The WebSocket starter is present and still unconfigured.

## CI

`.github/workflows/ci.yml` runs two independent jobs.

- **Frontend** — `npm ci`, `npx ng test --watch=false`, `npm run build`. **A failing spec fails the job**: the test step carries no `continue-on-error` and no `--if-present`, so a broken spec cannot reach `main`. `--watch=false` is passed explicitly rather than left to the builder's CI detection — a runner with no TTY that fell into watch mode would hang until the job timeout, which reports as a hang rather than as a test failure. There is no lint step; the workflow comments where one goes once ESLint is configured.
- **Backend** — `./mvnw -B clean verify` against a **`postgres:16` service container** with a `pg_isready` health check, exposed on the runner's `localhost:5432`, with `DB_TEST_URL`/`DB_TEST_USER`/`DB_TEST_PASSWORD` set on the build step. Local development stays on 5433; only CI uses 5432.

## Spring Boot 4 gotchas

- `pom.xml` targets **Spring Boot 4.1.0** on Java 21. Boot 4 renamed the starters: use `spring-boot-starter-webmvc` (not `-web`), and per-module test starters (`spring-boot-starter-data-jpa-test`, `-webmvc-test`, `-security-test`, …) instead of the single `spring-boot-starter-test`.
- **The three auth libraries carry explicit `<version>` tags** — `google-api-client` 2.9.0 and `jjwt-api`/`-impl`/`-jackson` 0.12.6 — because Boot's BOM does not manage them. Every other dependency deliberately omits a version; if you add one that the parent already manages, leave the version off. Note also that jjwt 0.12's API is not the 0.11 one most examples show: it is `Jwts.builder().subject(…).signWith(key)` and `Jwts.parser().verifyWith(key).build()`, not `setSubject`/`setSigningKey`.
- Boot 4 also **split autoconfiguration into per-technology modules**. Adding a library alone is not enough to get its beans — `flyway-core` without `org.springframework.boot:spring-boot-flyway` gives `NoSuchBeanDefinitionException: No qualifying bean of type 'org.flywaydb.core.Flyway'`. Expect the same pattern for other integrations.
- That same split **moved classes into per-technology packages**, so the Boot 3 imports in most tutorials and generated snippets simply do not exist in 4.1.0. The test annotations are the ones you hit first:

  | Class | Boot 4.1.0 package | Old Boot 3 package (gone) |
  | ----- | ------------------ | ------------------------- |
  | `@DataJpaTest` | `org.springframework.boot.data.jpa.test.autoconfigure` | `org.springframework.boot.test.autoconfigure.orm.jpa` |
  | `@AutoConfigureTestDatabase` | `org.springframework.boot.jdbc.test.autoconfigure` | `org.springframework.boot.test.autoconfigure.jdbc` |
  | `TestEntityManager` | `org.springframework.boot.jpa.test.autoconfigure` | `org.springframework.boot.test.autoconfigure.orm.jpa` |

  **General rule: verify a package against the classpath before importing it, rather than trusting a Boot 3 example.** `.\mvnw.cmd -B dependency:build-classpath "-Dmdep.outputFile=target\tcp.txt" "-Dmdep.includeScope=test"` then `jar tf` the jar you expect it in. A wrong import costs a full compile cycle to discover.

## Angular 21 notes

- **No `zone.js` dependency — the app is zoneless.** Use signals for state; in tests `await fixture.whenStable()` rather than relying on automatic change detection.
- Angular files use the flat naming convention (`app.ts`, `app.html`, `app.scss`, `app.spec.ts`), not `app.component.ts`. New components default to SCSS via `angular.json` schematics.
- The test builder is `@angular/build:unit-test`, which runs **vitest** under jsdom — not Karma. Vitest globals and matchers apply.

## Workflow

`main` is protected: branch as `feature/<short-description>` or `fix/<short-description>`, open a PR against `main` (link the issue with `Closes #123`), get 1 approval with CI green, then squash-merge and delete the branch. Commit messages are prefixed by area — `CONTRIBUTING.md` lists the prefixes in use.

## Supporting documents

Both of these were stale and have been brought current — they no longer need to be read against a correction:

- `docs/README.md` — the record of which schema decisions are ratified and which are still proposals, plus how to run the form-registration importer and the column names it expects. Current as of V4.
- `docs/PROJECT-STATUS.md` — the progress tracker: what is built across both halves, what is not, and what comes next, with a per-PR delivery log. It replaced the backend-only handover report. It defers to this file for conventions rather than repeating them.

**These go stale the same way everything else here does.** This file, `docs/README.md` and `docs/PROJECT-STATUS.md` all describe the same system from different angles, and nothing checks them against each other or against the database. A migration that changes a CHECK vocabulary, a DEFAULT or an `ON DELETE` rule has to update all three, plus the frontend union that mirrors it. When in doubt, read the live constraint rather than any of these:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```
