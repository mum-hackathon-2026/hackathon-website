# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git repository root is `hackathon-website/` (one level below the usual working directory `C:\Users\ASUS\SEM3\gdghackathon`). It is a two-app monorepo with no shared build tooling — `frontend/` and `backend/` are built, tested, and run independently, and CI treats them as two separate jobs.

### What exists today

**The two halves are not connected.** There is no HTTP API: the backend stops at the persistence layer (no controllers, services, DTOs, or security config — grep for `@RestController`/`@Service` returns nothing), and the frontend makes no network call — `app.config.ts` provides only `provideBrowserGlobalErrorListeners()` and `provideRouter(routes)`, with no `provideHttpClient`, and nothing imports `HttpClient` or calls `fetch`. Wiring them together is still ahead.

- **Backend** — Flyway migrations V1 + V2, Postgres roles, CI service container, and **all 11 tables mapped**: `User`, `EventSettings`, `Team`, `TeamMember`, `Submission`, `JudgingCriteria`, `Assignment`, `Score`, `TeamResult`, `NotificationLog`, `AuditLog`. Each has a Spring Data repository and a JPA-slice test. Nothing above that layer exists.
- **Frontend** — eight page components behind nine routes (home, timeline, organisers, my team, my submission, progress ×2, results, sign-in), a shared layout kit, and in-memory stand-ins for the API. Zoneless Angular 21, standalone components, signals throughout.

Both halves lean on **placeholder data that is marked as such in the source** — `DEMO_USERS` and `DEFAULT_EVENT_CONFIG` dates in the frontend, the seeds in `TeamService`, `SubmissionService` and `ResultsService`. Read the file header before treating any of it as a decision the team made.

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

Most of that second list is still an unratified proposal. Don't treat the remaining enum-like CHECK values (`users.role`, `submissions.status`, `assignments.status`, `team_results.outcome`, `notifications_log.type`, `notifications_log.status`) as settled — the frontend hardcodes those literal strings, and the team has not signed off on them. `docs/README.md` tracks what is decided versus open, but it predates V2 and still lists `users.status` and `teams.status` as open; V2 settled both.

V1's own conventions, held throughout: `bigint generated always as identity` (never `bigserial`), `timestamptz` everywhere, `text` + `CHECK` over `varchar(n)`, **no Postgres ENUM types**, `numeric` for scored values (never float), and every FK column index-backed.

**V2 ratified three decisions**, and the schema now differs from V1 in ways the PDF does not show:

- **`users.status` is gone.** Deletion is a **hard delete**, not a soft delete — a deleted user is removed from `users`, not flagged. There is no `'active' / 'suspended' / 'deleted'` column to filter on, and no `status` field on the `User` entity.
- **`teams.status` no longer has `'submitted'`** — the vocabulary is `forming`, `complete`, `disqualified`, `withdrawn`. Submission state lives **only** on `submissions.status`, which keeps its full vocabulary (`draft`, `submitted`, `withdrawn`, `disqualified`). V1 recorded the same fact in both places with nothing keeping them in step. When you need to know whether a team submitted, join `submissions` — don't look at `teams.status`.
- **`assignments.judge_id` is `ON DELETE CASCADE`** (V1 had `RESTRICT`). Under hard delete, `RESTRICT` would stop a judge deleting their own account for as long as they held any assignment. `scores.assignment_id` already cascades, so deleting a judge removes their assignments and their scores with them.

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

Packages are by feature, not by layer, under `my.monash.hackathon.hackathon_website_backend`: `user/`, `team/` (`Team` + `TeamMember`), `event/`, `submission/`, `judging/` (`JudgingCriteria`, `Assignment`, `Score`), `result/`, `notification/`, `audit/`. Keep that shape.

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

## Frontend code

```
src/app/
  core/            singleton services, no templates
    auth/          AuthService, role guards, SESSION_STORAGE token
    event/         EVENT_CONFIG token, PhaseService, MilestoneService, static copy
    results/       ResultsService
    submission/    SubmissionService
    team/          TeamService
  layout/          reusable chrome: nav-bar, profile-menu, page-header,
                   state-locked, confirm-dialog, event-timeline, faq-list
  pages/           one folder per route; home/, progress/ and results/ have
                   their own section components
```

Components are standalone, `ChangeDetectionStrategy.OnPush`, and take inputs via the signal `input()` / `input.required()` API. Services expose `signal`/`computed` state, never subjects.

Routing lives in `app.routes.ts`. Note `/participant/progress/team` and `/participant/progress/event` are **two paths onto one `Progress` component**, distinguished by `data: { tab }` so each view is linkable.

**The frontend is written against the database's column names and CHECK literals verbatim.** `Role`, `TeamStatus`, `SubmissionStatus`, `ResultOutcome`, `EventSettings` and the `Team`/`TeamMember`/`Submission` interfaces each mirror a table field for field, so swapping the demo services for HTTP calls is a change of data source rather than a reshape. The flip side: changing a CHECK vocabulary in a migration breaks these types, and only the comments connect the two.

**That has already happened once and is not yet fixed.** `TeamStatus` in `core/team/team.ts:19` still lists `'submitted'`, which V2 removed from `teams.status`. Nothing catches it — the literal is declared in the union but never used as a value, so the build and the specs both stay green while the type permits a status the database will reject.

### Core services

- `core/auth/auth.ts` — **demo authentication, not a security boundary.** No login endpoint, no token; `signIn(role)` picks one of three hardcoded users. The session is a role key in `localStorage`, behind a `SESSION_STORAGE` injection token so tests can substitute an in-memory store (jsdom serves from an opaque origin where `localStorage` throws). `ROLE_HOME` still points every role at `/` — repoint each entry as its landing page lands.
- `core/auth/role-guard.ts` — `roleGuard(role)` builds `participantGuard`, `judgeGuard` and `adminGuard`; only `participantGuard` is used so far. `signedInGuard` gates `/results` on being signed in with *any* role, because results go to participants, judges and admins alike. All of them guard **navigation only**; there is no server enforcing anything behind them.
- `core/event/event-config.ts` — `EVENT_CONFIG` is an `InjectionToken` so tests can stand up a config in whichever phase they need. Its dates are **placeholders chosen to sit in the future**, not the real schedule. `MYT_OFFSET` (`+0800`) is passed to `DatePipe` so dates render in Malaysian time regardless of the reader's locale. `SiteCopy` holds wording that has no column yet.
- `core/event/phase.ts` — derives `EventPhase` from those dates against a shared 1s clock signal, and exposes `nextMilestone` / `remainingMs` for countdowns. Pages must reuse `PhaseService.now()` rather than starting a second interval. `judgingOpen` is exposed separately because V1 models it as an admin-flipped boolean, not a date window.
- `core/team/team.ts`, `core/submission/submission.ts`, `core/results/results.ts` — in-memory stand-ins, reset on reload by design. They mirror the constraints the database would apply (unique team name, unique join code, `maxTeamSize`, `submissions_submitted_at_check`) so error paths are real. **Mutations are deliberately `async` and return `Promise<{ok} | {ok:false,error}>`** even though nothing awaits I/O: the async boundary is the part callers must cope with when a real endpoint replaces them, so it exists from the start.

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

**Tests require a running Postgres.** H2 has been removed from `pom.xml` entirely — the baseline schema uses Postgres-specific DDL (`timestamptz`, `jsonb`, identity columns, cross-column CHECKs) that no substitute engine can execute. If a test fails with a connection error, the container is not running.

`FlywayBaselineMigrationTests` cleans `hackathon_db_test`, re-applies every migration, and asserts that two migrations ran to target version `2`, that `flyway_schema_history` records V1 and V2 as successful, and that the expected tables exist. Because `flyway.clean()` drops everything and `DB_TEST_URL` is overridable, it **refuses to run** unless the live JDBC connection metadata shows a database ending in `/hackathon_db_test` — read from the connection, not from a property, so it cannot be fooled by config. It proves the migrations work **from empty**; it does not prove V2 applies on top of an existing V1 database, which is how teammates will meet it — start the app against the local database for that.

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

Coverage is uneven and thinner than it looks. Every routed page has a spec, but four `core/` files have none — `results/results.ts`, `event/milestones.ts`, `event/event-content.ts`, `event/event-config.ts` — and most presentational pieces are untested (`page-header`, `state-locked`, `profile-menu`, `event-timeline`, `stage-list`, `rankings-table`, `judge-reviews`, and several `home/` sections).

There is no lint script and no ESLint config. CI's `npm run lint --if-present` is currently a no-op — don't assume linting catches anything.

## Configuration and profiles

- `src/main/resources/application.properties` is committed and holds profile-independent defaults: `ddl-auto=validate`, `open-in-view=false`, Flyway enabled and pointed at `classpath:db/migration`. It deliberately carries **no credentials**.
- `application-example.properties` is the template; copy it to `application-local.properties` (gitignored via `backend/.gitignore`) and add the Google OAuth client id/secret and `app.jwt.secret`.
- `src/test/resources/application.properties` **shadows** the main file rather than merging with it — both sit at the classpath root under the same name and the test classpath wins. Any setting tests need must be repeated there.
- The template declares `spring.data.redis.*` and `app.jwt.*`, but there is no Redis starter in `pom.xml` and no code reads `app.jwt.*`, so those properties are inert.

**`spring-boot-starter-security` is on the classpath with no `SecurityConfig` written yet.** Spring Security's default auto-configuration therefore applies: every request needs HTTP Basic with user `user` and a random password printed to the log at startup. That is why a freshly added endpoint answers 401 rather than serving. The OAuth2 client and WebSocket starters are likewise present but unconfigured.

## CI

`.github/workflows/ci.yml` runs two independent jobs.

- **Frontend** — `npm ci`, `npm run lint --if-present` (a no-op), `npm run build`. **It does not run the frontend tests.** A broken spec reaches `main` unless someone runs `npm test` locally.
- **Backend** — `./mvnw -B clean verify` against a **`postgres:16` service container** with a `pg_isready` health check, exposed on the runner's `localhost:5432`, with `DB_TEST_URL`/`DB_TEST_USER`/`DB_TEST_PASSWORD` set on the build step. Local development stays on 5433; only CI uses 5432.

## Spring Boot 4 gotchas

- `pom.xml` targets **Spring Boot 4.1.0** on Java 21. Boot 4 renamed the starters: use `spring-boot-starter-webmvc` (not `-web`), and per-module test starters (`spring-boot-starter-data-jpa-test`, `-webmvc-test`, `-security-test`, …) instead of the single `spring-boot-starter-test`.
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

`main` is protected: branch as `feature/<short-description>` or `fix/<short-description>`, open a PR against `main` (link the issue with `Closes #123`), get 1 approval with CI green, then squash-merge and delete the branch. Commit messages are prefixed by area — `frontend:`, `backend:`, `db:`. See `CONTRIBUTING.md`.

## Stale documents

Two files in and around the repo have fallen behind the code. Trust this file and the source over them:

- `docs/README.md` still lists `users.status` and `teams.status` among the unratified CHECK vocabularies. V2 settled both — `users.status` no longer exists.
- `../BACKEND-STATUS.md` (outside the git root) is a point-in-time report pinned to commit `89f06ba` and says `src/main/java` contains exactly one file with no entities or repositories. That has not been true since the entity work landed.
