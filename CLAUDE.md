# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git repository root is `hackathon-website/` (one level below the usual working directory `C:\Users\ASUS\SEM3\gdghackathon`). It is a two-app monorepo with no shared build tooling — `frontend/` and `backend/` are built, tested, and run independently, and CI treats them as two separate jobs.

### What exists today

**The two halves are fully connected.** Every page now reads live data over HTTP — nine controllers serve roughly forty endpoints, and the frontend's seven core services are `HttpClient` callers rather than in-memory stand-ins. Read the older claim that "sign-in is the only seam" as historical: it was true through PR #61 and stopped being true across #63–#69.

- **Backend** — Flyway migrations **V1 through V8**, Postgres roles, CI service container, and **all 11 tables mapped**: `User`, `EventSettings`, `Team`, `TeamMember`, `Submission`, `JudgingCriteria`, `Assignment`, `Score`, `TeamResult`, `NotificationLog`, `AuditLog`. Each has a Spring Data repository and a JPA-slice test. Above that layer there are now nine `@RestController`s — `auth/`, `admin/`, `judging/`, `result/`, `submission/`, `team/`, `event/`, `webhook/` (registration) and the submission webhook on `SubmissionController` — plus `AdminBackendService` and `JudgeBackendService`, and a `GlobalExceptionHandler`.
- **Frontend** — twelve page components behind fifteen route entries covering all three roles (home, timeline, organisers, my team, my submission, progress, judge portal, judge review, admin dashboard, results, sign-in, 404). The counts differ for two separate reasons: `Progress` takes three paths (`/participant/progress`, `/participant/progress/team`, `/participant/progress/event`), and bare `/admin/dashboard` is a **redirect** entry onto `/admin/dashboard/:section` rather than a second component route, so a section is always named in the URL. The admin workspace has ten sections (overview, teams, participants, judges, assignments, submissions, judging, results, audit, settings). Zoneless Angular 21, standalone components, signals throughout.
- **Import pipeline** — `tools/` now holds **two** importers, not one: `FormRegistrationImporter` (registrations to `users`/`teams`/`team_members`) and `FormSubmissionImporter` (project submissions to `submissions`). Both read a CSV *or* the Google Sheets API. Both are also driven from inside Spring by `webhook/RegistrationImportService` and `webhook/SubmissionImportService`, each of which exposes a webhook endpoint **and polls the sheet on a `@Scheduled` fixed delay** (default 15 s). See *The Sheets sync pipeline*.
- **Ops and audit** — production `Dockerfile`s for both halves, `docs/GCP_DEPLOYMENT_GUIDE.md`, SEO assets (`robots.txt`, `sitemap.xml`, Schema.org JSON-LD), and a 17-category security audit under `security/reports/` and `security/plans/`.

**Placeholder data is mostly gone but not entirely.** `DEMO_USERS` still exists beside the real Google sign-in, and `SiteCopy`'s form URLs were live-updated in #67. Read the file header before treating any remaining seed as a decision the team made.

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

`docs/README.md` tracks decided versus open in full, and is current as of V8.

V1's own conventions, held throughout: `bigint generated always as identity` (never `bigserial`), `timestamptz` everywhere, `text` + `CHECK` over `varchar(n)`, **no Postgres ENUM types**, `numeric` for scored values (never float), and every FK column index-backed.

**V2 ratified three decisions**, and the schema now differs from V1 in ways the PDF does not show:

- **`users.status` is gone.** Deletion is a **hard delete**, not a soft delete — a deleted user is removed from `users`, not flagged. There is no `'active' / 'suspended' / 'deleted'` column to filter on, and no `status` field on the `User` entity.
- **`teams.status` no longer has `'submitted'`** — the vocabulary is `forming`, `complete`, `disqualified`, `withdrawn`. Submission state lives **only** on `submissions.status`, which keeps its full vocabulary (`draft`, `submitted`, `withdrawn`, `disqualified`). V1 recorded the same fact in both places with nothing keeping them in step. When you need to know whether a team submitted, join `submissions` — don't look at `teams.status`.
- **`assignments.judge_id` is `ON DELETE CASCADE`** (V1 had `RESTRICT`). Under hard delete, `RESTRICT` would stop a judge deleting their own account for as long as they held any assignment. `scores.assignment_id` already cascades, so deleting a judge removes their assignments and their scores with them.

**V3 moved registration off the site and onto a Google Form**, which changes who creates a user row and when:

- **Registration is form-based.** A Google Form collects **one row per team** — a leader plus up to four more members, **2–5 total** — with a name, email, phone, Google Drive resume link and LinkedIn URL per person. `tools/FormRegistrationImporter` imports the exported CSV. Nobody registers through the site. **Solo entries are not accepted**: V6 moved the limits from 1–4 to 2–5.
- **Project submission moved to a Google Form too**, in the same frontend change (#40) — but only registration has an importer. `SiteCopy` carries both links (`teamRegistrationFormUrl`, `projectSubmissionFormUrl`, both still `PLACEHOLDER` URLs), and `MyTeam` / `MySubmission` render each through `layout/form-link-card`. **The registration URL now exists twice and the copies disagree**: #61 gave the homepage hero a "Register Now" CTA with a real `docs.google.com/forms/...` address written straight into `hero.html`, while `teamRegistrationFormUrl` — what `MyTeam` shows a signed-in participant — is still the placeholder. Whoever fills in the config value should pull the hero onto it rather than editing the literal, and should check the hero's link while they are there: it points at the form's `formResponse` submit endpoint, not its `viewform` page. **That gap is now closed**: `tools/FormSubmissionImporter` exists and `webhook/SubmissionImportService` runs it on a webhook and a 15-second poll, so `submissions.status` / `submitted_at` do get populated. V5 added the columns the submission form collects (`slide_deck_url`, `video_demo_url`, and the three `representative_*` fields). Treat the older "no submission importer" claim in `docs/README.md` as superseded.
- **`users.google_sub` is nullable, and a NULL means "registered but has never signed in".** Only a real OAuth sign-in yields a subject claim, so the form cannot produce one; `AuthController` fills it in on first sign-in by matching on email. **`users` is therefore the sign-in allowlist** — the row exists before the person ever authenticates, and its existence is what permits them to. The UNIQUE constraint survives untouched because Postgres does not collide NULLs in a unique index.
- **`users` gained `phone`, `resume_url` and `linkedin_url`, all nullable.** The form requires all three of every participant, but `users` is the accounts table, not the participants table: judges and admins are rows in it too and have no resume or LinkedIn. **Enforcement belongs to the form and the importer, not the database** — do not make these NOT NULL, and do not add a CHECK to the URL columns. V3 argues the case in a comment; read it before touching them.
- **V3 changed nothing else.** No `submitted` flag on `teams`, nothing on `submissions`, nothing on `teams.status`.
- **V4 added `users.github_url`**, the fourth form-collected field and nullable for the same reason. **There are now two `github_url` columns and they are unrelated:** `users.github_url` is *the person* — their own account, collected at registration for screening — and `submissions.github_url` is *the project* — the repo the team built. A join selecting both can hand you a profile where you wanted a repo with nothing to catch it, so always qualify which you mean. Both columns carry a `COMMENT ON COLUMN` saying so, and both entity fields carry a javadoc cross-reference.

**V5 through V8 landed after the docs were last aligned**, and none of them is described by the PDF either:

- **V5 widened `submissions`** with `slide_deck_url`, `video_demo_url`, `representative_name`, `representative_phone` and `representative_email`, all nullable. The two URL columns carry `~ '^https?://'` CHECKs; the three representative columns do not — they are free text collected by the submission form.
- **V6 moved the team size to 2–5** on the `event_settings` singleton row. It updates the *seeded row only*, not the column DEFAULTs, which stay `1` and `4`. See *Importing Google Form registrations*.
- **V7 seeds the judging criteria** for the Averis 2026 preliminary round — seven active rows totalling 100 points, split 70 technical / 30 product. **It `delete from scores` and `delete from judging_criteria` first**, so applying it against a database that already holds scores destroys them. That is safe on a fresh database and is not safe mid-event; if the criteria ever change again, write a migration that updates rather than one that truncates.
- **V8 added `event_settings.judges_per_team`** — `integer not null default 3`, CHECKed to 1–10. It is what the admin Assignments section divides work by. Note this is a **column DEFAULT that the entity initialiser must mirror**; see *Conventions that hold across every entity*.

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

Packages are by feature, not by layer, under `my.monash.hackathon.hackathon_website_backend`: `user/`, `team/` (`Team` + `TeamMember`), `event/`, `submission/`, `judging/` (`JudgingCriteria`, `Assignment`, `Score`), `result/`, `notification/`, `audit/`. Keep that shape. `auth/` holds the Google sign-in slice; `admin/` and `webhook/` were added after this list was first written — `admin/` carries `AdminController` + `AdminBackendService` + a `dto/` package of sixteen records, and `webhook/` carries the two Sheets sync services and the registration webhook. `tools/` holds standalone operator programs — **now two importers plus `CsvReader` and `GoogleSheetsReader`** — which are plain `main` classes on raw JDBC and are the one place in the backend that is not Spring-managed. Note that `webhook/` calls straight into `tools/`, so those `main` classes are on the request path of a live endpoint as well as the command line; they are not operator-only any more.

Repositories are deliberately thin — `JpaRepository` plus a handful of derived query methods (`findByEmail`, `findByJoinCode`, `findByJudgeId`, `findByIsActiveTrueOrderByDisplayOrder`, …). **There is no `@Query` anywhere in the codebase**; keep it that way until a query genuinely cannot be expressed derivationally. The two importers are the exception that proves the rule — they hold raw SQL string constants because they run outside Spring Data entirely.

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

The one place the two halves meet. Nine classes in `backend/.../auth/` plus `core/auth/auth.ts` on the frontend.

**The flow.** Google Identity Services renders the sign-in button in `sign-in.ts` and hands back an ID token → `AuthService.signInWithGoogle()` POSTs it to `/api/auth/google` → `GoogleTokenVerifier` checks it against Google's public keys with our client id as the audience → `AuthController` looks the email up in `users` → `JwtService` issues an HS256 JWT carrying `sub` (the user id), `email`, `role` and `name` → the frontend stores it and puts the user in a signal.

**On reload the session is checked rather than trusted.** `AuthService`'s constructor calls `revalidateSession()`, which GETs `/api/auth/me` with the stored JWT and signs out on **401 or 403 only** — those are the server rejecting the token or the user, whereas a network failure or a 5xx is the backend being unreachable and no evidence at all about the session. Two things it deliberately skips: a **tokenless** session, which is the demo `signIn(role)` path and would otherwise be signed straight back out, and any answer that arrives after the token it was checking has changed, which would clobber a sign-in that landed while the check was in flight. It is **not** a navigation gate — it settles a tick or two after bootstrap, so a guard can wave a stale session through once before the answer lands; `sessionCheck` is the promise a route resolver would await if that window ever needs closing. Until an interceptor exists this is the one request that sets its own `Authorization` header.

**Registration is by pre-existing row, not by signing up.** A valid Google account whose email is not already in `users` gets **403**, and that is the whole of the access control: there is no self-registration endpoint. `AuthController` also refuses an unverified Google email with 401, lowercases the address before looking it up (V1 enforces `email = lower(email)`), and on success backfills `google_sub`, `email_verified`, `last_login_at` and the display name from the Google profile. **A successful login therefore writes to `users`** — it is not a read-only path.

**`SecurityConfig` is the chain, and the code has now caught up with its matchers.** Stateless, CSRF disabled, CORS allowing `http://localhost:4200` only, `JwtAuthenticationFilter` before `UsernamePasswordAuthenticationFilter`. The rules, in order: `/api/auth/**` permitted, `/api/event/**` permitted, `/api/results` permitted, `/api/webhooks/**` and `/api/webhook/**` permitted, `/api/admin/**` requiring authority `admin`, `/api/judge/**` requiring `judge`, and **`anyRequest().authenticated()`**. Note what `permitAll` on `/api/auth/**` means for `/api/auth/me`: **the chain does not gate it, so the endpoint gates itself** — the filter populates the context when the bearer token is good, and `me()` returns 401 by hand when `@AuthenticationPrincipal` comes back null. That hand-written 401 is what the frontend's `revalidateSession()` signs out on, so moving `/me` behind a matcher or dropping the null check changes session handling on the other side. **The same `permitAll` covers `/api/auth/dev-login`, and that one is not gated by anything at all** — see the warning below. The authority strings come straight from `users.role` via `SimpleGrantedAuthority`, with no `ROLE_` prefix and no mapping table — a change to the `users_role_check` vocabulary silently changes who can reach `/api/admin/**`. The three `permitAll` webhook/results/event matchers are the other thing to keep in mind: they are the only endpoints an anonymous caller can reach, so anything added under those prefixes is public by default.

**Config is validated at startup, so a missing value is a boot failure, not a 500 later.** `JwtProperties` (`app.jwt.secret`, `app.jwt.expiration-ms`) and `GoogleAuthProperties` (`app.google.client-id`) are `@Validated` records enabled by `SecurityConfig`; `@NotBlank`/`@Positive` mean the context refuses to start without them. `secret` must be at least 32 characters — `Keys.hmacShaKeyFor` throws below that. This is why `src/test/resources/application.properties` carries test-safe values for all three: it *shadows* the main file, so anything the context needs has to be repeated there or every test that loads a context fails.

**Two live holes in the auth surface. Neither is deliberate.**

- **`POST /api/auth/dev-login` mints a JWT for anyone who asks.** It takes `{"role": "admin"}`, looks up the first user with that role (or, failing that, *any* user), and returns a signed token for them. It sits under `/api/auth/**`, so `SecurityConfig` permits it, and it carries **no `@Profile` guard, no secret and no environment check** — it is reachable in production exactly as it is in development. This is the single highest-severity item in the tree. Gate it behind `@Profile("local")` (or delete it) before anything is deployed. **The 17-category security audit under `security/` does not mention it**, so a green report there is not evidence about this endpoint.
- **The registration and submission webhooks are permitted, and their secret is optional.** `RegistrationWebhookController` checks `X-Webhook-Secret` **only when `app.webhook.secret` is set to a non-blank value**; and the committed `application.properties` sets it to the **empty string** (`app.webhook.secret=`), which skips the check entirely. As shipped, any caller can trigger a full sheet import. Set the secret in every deployed environment and treat a blank one as a misconfiguration, not a default.

**What is genuinely not built yet:**

- **Still no HTTP interceptor, and the cost has multiplied.** The JWT is exposed as `AuthService.token()` and every authenticated call attaches `Authorization: Bearer …` by hand. That was one call when it was written; `core/admin/admin.ts` alone now does it in **thirteen** places. Writing the interceptor is now a cleanup rather than a design decision, and it should absorb `revalidateSession()` when it lands.
- **The demo path is still live.** `signIn(role)` picks a `DEMO_USERS` entry with no network call and no token, and the sign-in page still renders one button per role. Guards do not distinguish the two, so a demo session passes every `canActivate` in the app — they gate navigation, and only the backend chain gates data.
- **The backend half still has no test.** The `auth/` package has no test class at all — CI compiles `GoogleTokenVerifier`, `JwtService`, `AuthController` and the filter, and never runs them. **The frontend half is covered** as of #54. So a break in the client shows up in CI and the same break in the server does not. This has been item 1 on *what comes next* since PR #59 and is still open.

**The client id exists twice and the two copies must agree.** `GOOGLE_CLIENT_ID` in `core/auth/auth.ts` (a token, defaulting to the configured id) is what the browser sends to Google; `app.google.client-id` is what `GoogleTokenVerifier` sets as the expected audience. A mismatch fails audience verification, so login answers 401 while both halves look correctly configured in isolation. Change them together.

## Frontend code

```
src/app/
  core/            singleton services, no templates
    admin/         AdminService — event-wide read/write model for organisers
    auth/          AuthService, role guards, SESSION_STORAGE token
    event/         EVENT_CONFIG token, EventSettingsService, PhaseService,
                   MilestoneService, static copy
    judge/         JudgeService — assignments, scores, criteria
    results/       ResultsService
    seo/           SeoService — title, meta and Schema.org JSON-LD per route
    submission/    SubmissionService
    team/          TeamService
  layout/          reusable chrome: nav-bar, profile-menu, page-header,
                   state-locked, confirm-dialog, event-timeline, faq-list,
                   status-pill, form-link-card
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

- `core/auth/auth.ts` — **two sign-in paths in one service.** `signInWithGoogle(idToken)` is real: it POSTs to the backend and stores the returned JWT (see *Authentication*). `signIn(role)` is the original demo path — one of three hardcoded `DEMO_USERS`, no network, no token — and is still what the specs and the role buttons use. Both end in the same `currentUser` signal, so **nothing downstream can tell a demo session from a real one** *within the app* — but the backend now can, because `revalidateSession()` runs on construction and the tokenless demo session is the one it skips. Both paths map the backend user through the same `toAuthUser()` helper, so the name, initials and role fallback cannot be derived two ways from one row. The session is persisted as JSON in `localStorage` behind a `SESSION_STORAGE` injection token so tests can substitute an in-memory store (jsdom serves from an opaque origin where `localStorage` throws). **Two keys are written and only one is read**: the session JSON under `hackathon.demo-auth` carries the JWT inside it and is the only thing `restoreSession()` consults, while `hackathon.jwt-token` is written beside it for any other reader and is never read back. Clearing only the second key does not sign anybody out; the backend URL is behind `API_BASE_URL`, defaulting to `http://localhost:8080`. `ROLE_HOME` sends each role to its own landing page — `/participant/team`, `/judge/portal`, `/admin/dashboard`.
- `core/auth/role-guard.ts` — `roleGuard(role)` builds `participantGuard`, `judgeGuard` and `adminGuard`, and all three are now in use. `signedInGuard` gates `/results` on being signed in with *any* role, because results go to participants, judges and admins alike. All of them guard **navigation only** — they read a signal, not a token. The server-side equivalent is `SecurityConfig`'s matchers, and the two are written independently: a guard passing says nothing about whether the API would answer.
- `core/event/event-config.ts` — `EVENT_CONFIG` is an `InjectionToken` so tests can stand up a config in whichever phase they need. **It is now the *seed* for `event_settings`, not the live copy** — see `event-settings.ts`. Its dates are **placeholders chosen to sit in the future**, not the real schedule. `MYT_OFFSET` (`+0800`) is passed to `DatePipe` so dates render in Malaysian time regardless of the reader's locale. `SiteCopy` holds wording that has no column yet.
- `core/event/event-settings.ts` — **`EventSettingsService` owns the `event_settings` singleton as state.** Every date, limit and flag the site reads comes from here as a signal; `EVENT_CONFIG` supplies the initial value and nothing else. Seeding from the token is load-bearing: ~20 specs provide a config to choose a phase and then read `PhaseService`, and they keep working precisely because this service copies that token at construction. **Never snapshot these into a plain field** — `readonly name = this.settings.eventName()` samples once and never updates; keep the call in the template or wrap it in a `computed`. `update(patch)` validates against the *merged* result, because V1 constrains the `min`/`max` pair rather than either field alone.
- `core/event/phase.ts` — derives `EventPhase` from those dates against a shared 1s clock signal, and exposes `nextMilestone` / `remainingMs` for countdowns. Pages must reuse `PhaseService.now()` rather than starting a second interval. `judgingOpen` is exposed separately because V1 models it as an admin-flipped boolean, not a date window.
- `core/team/team.ts`, `core/submission/submission.ts`, `core/results/results.ts`, `core/judge/judge.ts`, `core/admin/admin.ts` — **all five are now real `HttpClient` callers**, not in-memory stand-ins. They kept the `Promise<{ok} | {ok:false, error}>` shape the stand-ins had, which is why swapping them over did not reshape any caller. Each attaches `Authorization: Bearer …` by hand from `AuthService.token()`; there is still no interceptor. `AdminService` is the largest by a wide margin — roughly 2,000 lines covering the ten workspace sections and every organiser mutation (team renames and status, judge registration and removal, assignment create/delete, shortlisting, results publish/unpublish, and the settings row). `MyTeam` and `MySubmission` remain **read-only status views plus a link out** to the Google Forms, so `TeamService`'s and `SubmissionService`'s write methods still have no UI caller — grepping for one finds only specs.

`styles.scss` holds the whole design system as CSS custom properties on `:root` — Google-palette brand accents with pre-darkened `-ink` variants for contrast-safe text on `-tint` backgrounds, a neutral ramp, and the three type roles below. **Prefer the tokens over raw hex in component styles.** A handful of literals have crept in anyway — ten component stylesheets carry one, `sign-in` (5) and `home/organizers` (4) most of all, then `hero` and `admin-overview` and `contact` (2 each) and `nav-bar`, `profile-menu`, `footer`, `not-found` and `home/theme` (1 each). Some are genuine one-offs with no token (the Discord brand blue, a gradient stop), but several duplicate an existing `-tint` value and should be replaced when those files are next touched. Token values mirror `frontend/figma-draft`, which is gitignored and not in the repo.

### Typography: titles are serif, everything else is sans

**Three type roles, and the split is the rule — not a default to drift from.** `--font-serif` (Roboto Serif) is for **titles only**; `--font-sans` (Roboto) is for **everything a reader reads through** — body copy, labels, eyebrows, form controls, table cells; `--font-numeric` is an alias of `--font-sans` naming the third case explicitly, so a numeric readout is never mistaken for a title at a glance. `--font-display` **no longer exists** — it used to mean 'Google Sans' falling back to Roboto, and it did double duty for titles *and* stat values, which is exactly the distinction the serif/sans split now has to keep. A stylesheet still naming it is stale.

**`h1`–`h6` get the serif globally**, so a heading element needs no opt-in and most components carry no `font-family` at all. Two categories do have to name a face themselves, and both are already done — match them rather than inventing a third pattern:

- **Titles that are not heading elements** name `--font-serif`. Eight selectors, ten rules: `.nav__brand-name`, `.rail__title`, `.sponsors__wordmark`, `.theme__pillar-name`, `.organizers__name` (the home-page card; the standalone organisers page uses an `<h3>`), `.state-locked__heading`, `.stub__heading` and the three copies of `.empty__heading`. They are `<p>`/`<span>` for page-outline reasons, not because they are not titles.
- **Numeric readouts** name `--font-numeric`: `.kpi__value`, `.tiles__value`, `.done__score`, `.criterion__mark-value`, `.actions__total strong`, `.headline__rank-value` / `.headline__score-value`, `.missing__code`. All carry `font-variant-numeric: tabular-nums`; a serif at weight 800 breaks column alignment in the admin tables, and a score is content rather than a title.

**Controls name `--font-sans` outright instead of inheriting**, because a control nested inside a heading would otherwise turn serif — `.button`, `.input`, `.link-button` and `.field-label` in `styles.scss`, plus the six component buttons (`.nav__avatar-button`, `.tabs__tab` ×2, `.back`, and the menu/account buttons in `profile-menu` and `sign-in`). **`.faq__trigger` is the one deliberate exception**: it is the text of its `<h3>` question, so it keeps `font-family: inherit` and picks the serif up. The comment there says so; do not "fix" it to sans.

**Two smaller things that carry the pairing.** `.section-eyebrow` stays sans on purpose — the tracked uppercase sans kicker above a serif heading is what makes the split read as deliberate rather than accidental. And large titles had their negative tracking halved (`-0.02em` → `-0.01em` on `.hero__title` and `.my-team__team-name`, `-0.01em` → `0` on `.sponsors__wordmark`): serif counters close up under tracking tuned for a sans.

### Type scale: every size comes from the ramp

**No stylesheet sets a literal `font-size` any more.** Twelve steps live on `:root` in `styles.scss` — `--text-3xs` (10px), `--text-2xs` (11px), `--text-xs` (12px), `--text-sm` (13px), `--text-md` (15px), `--text-lg` (18px), `--text-xl` (22px), `--text-2xl` (26px), `--text-3xl` (32px), then `--text-4xl`/`--text-5xl`/`--text-6xl` (40/48/60px) for display. Steps widen as they climb, roughly 1.1x at the interface end and 1.25x at the display end: small sizes need fine gradations to separate a label from a table cell, large ones need daylight to read as a hierarchy at all.

This replaced **34 distinct literal sizes** spread across the component stylesheets, including six half-pixel values (`9.5px`, `10.5px`, `11.5px`, `12.5px`, `13.5px`, `14.5px`) that made two panels meaning the same thing land a half-pixel apart. **Pick a step by the job it does, not by which number matches the mock** — each token carries a comment in `styles.scss` naming its role (eyebrows and table headers, pills and badges, captions, default interface text, body copy, and so on up).

**`clamp()` takes tokens on both ends** rather than raw px: `clamp(var(--text-3xl), 7vw, var(--text-6xl))` on the hero title, and the same pattern on `.page-header__title`, `.theme__title`, `.judge-review` title, `.sponsors__wordmark` and the hero countdown. The `vw` middle term is the only literal left in a font-size anywhere.

**Adding a step is a last resort.** If a size feels wrong, the usual answer is that the element wants a different existing step, not a new rung between two of them — that is exactly how the previous 34 accumulated.

**Roboto Serif is loaded from Google Fonts in `src/index.html`**, in the same request as Roboto, as a variable font on the optical-size and weight axes (`opsz,wght@8..144,400..800`). The `opsz` axis is why one face covers a 13px panel title and a 60px hero; `font-optical-sizing: auto` is set on the heading rule. **Adding a weight means editing that URL** — the range currently stops at 800, and a heading set to 900 silently synthesises.

## Commands

### Backend (`backend/`)

Windows/PowerShell needs `.\mvnw.cmd` and quoted `-D` args; Mac/Linux uses `./mvnw`.

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"   # → http://localhost:8080
.\mvnw.cmd test
.\mvnw.cmd test "-Dtest=FlywayBaselineMigrationTests"           # single test class
.\mvnw.cmd -B clean verify                                      # what CI runs
```

### Importing Google Form registrations (CLI)

`tools/FormRegistrationImporter` reads registrations from a CSV or directly from Google Sheets API into `users`, `teams` and `team_members`. It is a plain `main` on raw JDBC — not a Spring bean — so it neither boots the context nor needs the Google OAuth web client id, and it controls its own transactions. `exec-maven-plugin` is declared in `pom.xml` with the main class preconfigured; it has no `<executions>`, so it never runs as part of a build.

```powershell
# CSV mode
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/sample-form-registration.csv --dry-run"
.\mvnw.cmd compile exec:java "-Dexec.args=--file=../scripts/registrations.csv"

# Google Sheets direct mode (via service account in backend/credentials/sheets-key.json)
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4 --dry-run"
.\mvnw.cmd compile exec:java "-Dexec.args=--sheet-id=1kdANBJLmrnc8s5enGOohfW7X80bnqKaM_Dr_uwxEOV4"
```

For Google Cloud service account setup and sheet sharing permissions, see `docs/SHEETS-SETUP.md`.

Headers are matched case- and punctuation-insensitively (`Team Name`, `Member 1 Name`, `Member 1 Email`, `Member 1 Phone`, `Member 1 Major`, `Member 1 Resume`, `Member 1 LinkedIn`, `Member 1 GitHub`, and the same seven for members 2–5); unknown columns such as Google's `Timestamp`, primary contact info, and consent checkboxes are ignored. The tool prints the column mapping it derived and **refuses to run unless every member block that appears at all appears whole** — all seven columns or none — because silently importing null resumes is the worst failure available to it. `Member N Major` feeds the IT course check (see *Screening: the third outcome*), is stored in no column, and its total absence aborts the run with its own message. Member 1 is always required; later member blocks may be absent entirely (a form that only collects pairs), but a block with *some* of its columns is a mis-titled question rather than a smaller team and halts the run. **Two columns with the same title halt it too** for mapped columns. Additionally, any GitHub question titled with "Repository" or "repo" aborts with a message directing the admin to rename the question to `Member N: GitHub Profile URL`.

**It is idempotent** — the form keeps collecting, so it gets re-run. A team already present with exactly the sheet's members is skipped; a team whose name is taken but whose members differ is rejected rather than merged. **Each team is one transaction**, so nothing is ever half-written. `--dry-run` performs the real inserts and rolls back, so the constraints genuinely fire rather than being approximated.

Rejections (duplicate email, a person on two teams, duplicate team name, size outside the permitted range, malformed email, non-URL resume/LinkedIn/GitHub) are reported per row with a readable reason and never stop the run — every other row still imports and a human chases the rest. **Teams held by screening are reported the same way but on their own list**, printed separately from the rejections at the end of the run, because the two need different work: a pending team needs the spreadsheet corrected, a rejected one needs a new registration. The final line is machine-readable with stable keys — `RESULT mode=live rows=8 imported=2 skipped=0 rejected=5 pending=1` — and `mode` is included so a dry run can never be mistaken for a live one. **The first four keys keep their names, meanings and order; `pending=` was appended, not inserted.**

**Exit codes are `0` clean, `1` completed with rows needing a human, `2` aborted before importing anything** (bad arguments, missing/invalid credentials or unreachable sheet, an incomplete member block, no `Major` column at all, duplicate column titles, no data rows, unreachable database). **`1` covers pending as well as rejected** — the question an unattended caller is asking is "does somebody have to look at this?", and the answer is yes either way; `rejected=` and `pending=` say which. A `RESULT` line is printed for `0` and `1` and never for `2`, so an unattended caller can branch on the exit code alone. The `1`/`2` split is the one that matters: after a `1` the database has changed, after a `2` nothing happened. Connection defaults are the local container as `hackathon_app`; override with `IMPORT_DB_URL` / `IMPORT_DB_USER` / `IMPORT_DB_PASSWORD` in preference to `--password`.

**The permitted team size lives in `event_settings` and the importer reads it at import time.** `min_team_size` / `max_team_size` on the singleton row are the only copy — there is no constant in the code and no fallback. The run header prints what it read (`team size   : 2-5 (from event_settings)`) so the operator can see which limits were actually enforced, and the value decides two separate things: which team sizes are accepted, and how many `Member N` blocks the column-mapping guard expects. **If the row is missing, or either value is null, the importer aborts with exit `2` and imports nothing** — importing a season's registrations against guessed limits is worse than not importing them.

**Changing the limits again is an `UPDATE` plus a form change, not a code change.** Update `event_settings`, then add or remove the matching `Member N: ...` question block on the Google Form. Nothing in Java needs recompiling — that is the whole point of V6 removing the constant. Note that the *column DEFAULTs* stay `1` and `4`: V6 updates the seeded row, not the DEFAULT, so `EventSettings`'s `minTeamSize = 1` / `maxTeamSize = 4` field initialisers still correctly mirror the DEFAULT and must not be "fixed" to 2/5.

`scripts/sample-form-registration.csv` is a worked example covering one valid 4-member team, one valid 5-member team, a solo team rejected for being under the minimum, one of each other rejection, and three teams held by screening — no IT major, a GitHub URL in the LinkedIn box beside a blank resume, and a Dropbox resume beside an unreadable phone number.

**Tests require a running Postgres.** H2 has been removed from `pom.xml` entirely — the baseline schema uses Postgres-specific DDL (`timestamptz`, `jsonb`, identity columns, cross-column CHECKs) that no substitute engine can execute. If a test fails with a connection error, the container is not running.

`FlywayBaselineMigrationTests` cleans `hackathon_db_test`, re-applies every migration, and asserts that **eight** migrations ran to target version `8`, that `flyway_schema_history` records V1 through V8 as successful, that the expected tables exist, and that `event_settings` ends at the **migrated** team size of 2 / 5 rather than V1's seeded 1 / 4. **Adding a migration means updating this test** — the executed count and target version are asserted exactly. Because `flyway.clean()` drops everything and `DB_TEST_URL` is overridable, it **refuses to run** unless the live JDBC connection metadata shows a database ending in `/hackathon_db_test` — read from the connection, not from a property, so it cannot be fooled by config. It proves the migrations work **from empty**; it does not prove a new migration applies on top of a database at the previous version, which is how teammates will meet it — start the app against the local database for that.

Test connection settings are environment-overridable so CI can supply its own: `DB_TEST_URL`, `DB_TEST_USER`, `DB_TEST_PASSWORD`, each defaulting to the local 5433 container.


### The Sheets sync pipeline (in-app)

**The CLI importer is no longer the only way registrations get in, and this is the part nothing else documents.** `webhook/` wraps both importers in Spring beans and gives each two triggers:

| | Registration | Submission |
| - | ------------ | ---------- |
| Service | `RegistrationImportService` | `SubmissionImportService` |
| Importer | `tools/FormRegistrationImporter` | `tools/FormSubmissionImporter` |
| Webhook | `POST /api/webhooks/forms/registration` | `POST /api/webhook/submissions` |
| Sheet id property | `app.sheets.sheet-id` | `app.sheets.submission-sheet-id` (falls back to `sheet-id`) |
| Tab property | `app.sheets.tab` | `app.sheets.submission-tab` |

Three things about it are easy to get wrong:

- **Both services poll on a timer, not only on the webhook.** Each carries `@Scheduled(fixedDelayString = "${app.sheets.poll-interval-ms:15000}")`, so a running backend re-reads its sheet **every 15 seconds** whether or not anything submitted. The sheet ids are **committed in `application.properties`**, which means anyone who starts the backend locally polls the team's live Google Sheets four times a minute against the Sheets API quota. The poll is a no-op when the sheet id is blank — that is the only off switch, and there is no separate enable flag.
- **The scheduled registration sync swallows its failures at `DEBUG`.** `RegistrationImportService.scheduledSync` catches every exception and logs `log.debug(...)`, so at the default level a sync that has been failing all day is completely silent. `SubmissionImportService` uses `log.warn` for the same case. Make them agree before relying on either.
- **The webhook secret is optional and ships blank.** See *Authentication*.

`resolveCredentialsPath` looks for the service-account key in four places in order: the configured `app.sheets.credentials-path`, `$GOOGLE_APPLICATION_CREDENTIALS`, `backend/credentials/sheets-key.json`, then `credentials/sheets-key.json`. `backend/credentials/` is gitignored at both levels and no key has ever been committed — `git log --diff-filter=A` over the path is empty. Keep it that way.

### Screening: the third outcome

**Eligibility screening now runs on every import**, in `tools/EligibilityScreening`. It adds a third outcome beside IMPORTED and REJECTED:

| Outcome | Written to the database? | What it means |
| ------- | ------------------------ | ------------- |
| IMPORTED | Yes | Clean. |
| PENDING | **No** | A human has to judge it. Re-screened from the sheet on every run. |
| REJECTED | No | Structurally wrong; unfixable without a new registration. Unchanged behaviour. |

**A PENDING team holds no rows and no flag anywhere.** That is deliberate and it is what makes the state self-clearing: nothing is written, so the next run reads the sheet again and screens it again, and correcting the spreadsheet is the entire fix. There is no `pending` column, no notification path and nothing to reconcile if a human decides the team is fine — which is exactly the design question the older version of this section left open. It was answered by *not imported, not recorded*, because `users` is the sign-in allowlist and a held team must not be able to sign in.

**Screening holds a team when:**

- **No member's major contains an IT keyword.** Case-, space- and punctuation-insensitive **substring** match, so "Computer Science in Data Science" matches `computer science`. One IT member carries the whole team — mixed teams are intended. The message lists every member's major verbatim so a person can judge it.
- **A resume, LinkedIn or GitHub link is blank**, or is on the **wrong domain** — LinkedIn must be `linkedin.com`, GitHub `github.com`, resume `drive.google.com` or `docs.google.com` (subdomains count). A wrong domain is a paste error, not grounds for refusal; the real registration data contains a GitHub URL in the LinkedIn box.
- **A phone number is present but is not 8–15 digits** once spaces, `+`, `-` and brackets are stripped. A *blank* phone stays a note and still imports.

**The keyword list is one constant, `EligibilityScreening.IT_COURSE_KEYWORDS`**, carrying a comment that says it must be reviewed before registration opens. It is **printed in full in every run header**, so a report saying "no clear IT-related course" can be read against the terms that actually decided it. Adding a term is cheap; three terms are deliberately excluded and the comment says which and why.

**`Member N Major` is a required column and its absence is fatal.** It is part of the all-or-none block rule like the other six, and if *no* block has one the run aborts with exit `2` and its own message rather than the generic incomplete-block one. Importing a season of registrations unscreened because a form question was renamed is the worst outcome available to this tool, so it is not reachable. The major itself is **stored nowhere** — there is no `users.major` column; it is read for the check and discarded with the row.

**The checks are offline and the docs say so.** Shape and domain only — nothing calls the network, so a clean run is *not* evidence that a link resolves, that a Drive file is shared, or that a profile belongs to the person who typed it.

**Two related things are still not this**, and get confused for it:

1. **`AdminParticipants`' eligibility filter** (frontend) is a **view filter over already-imported rows**. `eligibilityOf(studentAddress, emailVerified)` derives `eligible` / `unverified` / `not_student` from the email domain and `users.email_verified`. It stores nothing, gates nothing, and does not look at `resume_url`.
2. **`event_settings.screening_enabled` still has no consumer.** The importer does **not** read it: screening always runs. A safety check that defaults to off is not a safety check, and a stale `false` would silently admit everybody. If that column is ever meant to gate something, decide what and wire it deliberately — do not assume this feature is behind it.

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
npm run format                               # prettier --write .
npm run format:check                         # what CI runs; fails on unformatted code
```

Production budgets are 480 kB warning / **500 kB error** on the initial bundle and 4 kB / 8 kB per component stylesheet. Specs are colocated (`team.ts` → `team.spec.ts`) and need no database or dev server.

**The initial bundle is 454.55 kB against a 500 kB budget, and the headroom is recent.** It sat over the threshold from the auth work (490.74 kB → 517.29 kB, `provideHttpClient()` and the `rxjs` behind it being eager) until the judge routes went lazy. **The three role-gated pages are the lazy routes** — `AdminDashboard`, `JudgePortal`, `JudgeReview` — and everything reachable without a role guard is eager. Put a new role-gated page behind `loadComponent`; that is the pattern.

**Breaching 500 kB now fails the build**, and therefore CI. The error threshold used to sit at 1 MB, so a breach only warned and `npm run build` still exited 0 — which is how the bundle stayed over budget for thirteen PRs with nothing catching it. The 480 kB warning is the early signal: it fires with 20 kB still in hand, so the first PR to approach the limit hears about it while there is room to fix it rather than at the point of being blocked.

**Every file under `src/app/` has a colocated spec** except `app.config.ts` (and `src/main.ts`), which are bootstrap wiring. That became true in one pass, so the newest specs are the ones least worn in. Two conventions came out of it and are worth following:

- **Assert against the exported map or service, not a transcription of it.** `status-pill.spec.ts` walks `ASSIGNMENT_STATUS_LABELS` rather than listing four strings; `organizers.spec.ts` reads `ORGANIZERS`. A vocabulary change then surfaces as a component that stopped reading the map, instead of as a stale literal that has to be found by hand — which is exactly how the `TeamStatus` drift above went unnoticed.
- **A type-only file gets a spec that holds the agreement.** `progress-stage.ts` declares no runtime values, so `progress-stage.spec.ts` pins `ProgressStageId` with an exhaustive `Record` (a compile error if an id is added or renamed) and renders `Progress` to check it emits exactly as many stages as the union declares. `Progress.completion` is a hand-written six-element array indexed by position; a seventh stage added in one place and not the other slips the indices silently.

**One coverage gap remains, and it is not on this side.** `auth.spec.ts` and `sign-in.spec.ts` now cover the real Google path as well as the demo one — the request shape, the role fallback, the initials derivation, JWT persistence and restore, every error branch, and the GIS script loading. The **backend `auth/` package still has no test at all**. Frontend auth specs use `provideHttpClient()` + `provideHttpClientTesting()` and drive the credential handler through the paste-a-token form, because jsdom cannot run Google Identity Services.

**`npm run lint` runs angular-eslint over `src/**/*.ts` and `src/**/*.html`, and CI fails on a violation.** Config is `frontend/eslint.config.js` (flat config): `recommended` from eslint, typescript-eslint and angular-eslint, plus the template rules, with `eslint-config-prettier` last so formatting stays Prettier's job.

**`npm run format:check` is the other half of that split, and CI fails on it too.** Because `eslint-config-prettier` switches every layout rule off, **a green lint says nothing about formatting** — the two checks do not overlap and neither substitutes for the other. Prettier runs on bare defaults; there is no config file, only `frontend/.prettierignore`. **That ignore file is load-bearing**: Prettier does not read `.gitignore`, so without it the gitignored `figma-draft/` export contributes ~32 violations on any machine that has it, and the real ones are lost in the noise. Both checks are scoped to `frontend/` — the workflow sets `working-directory`, so root-level Markdown and `docs/` are formatted by nothing.

**The template accessibility preset is on**, so a click handler on a non-interactive element fails the build. Two patterns already resolved under it, worth knowing before writing a third:

- **A presentational backdrop takes `aria-hidden="true"`** — that satisfies the rules honestly, because a scrim should be neither announced nor tabbed to, and the keyboard path belongs elsewhere. `admin-sidebar` pairs it with `(document:keydown.escape)`, the same host binding `nav-bar` uses for its drawer. **A dismissible overlay needs that Escape handler**; without one the scrim is a pointer-only exit.
- **`confirm-dialog` disables the two rules inline, with the reasoning in the template.** Native `<dialog>` + `showModal()` already gives Escape-to-close, which the rules cannot see; making the element focusable would add a tab stop on the backdrop and help nobody. That comment is the precedent for suppressing these rules — a suppression needs an argument, not just a disable.

One further omission: the config is **not type-aware** — `recommended`, not `recommendedTypeChecked` — because `tsconfig.json` is already strict and `npm run build` enforces that in CI.

**Pin angular-eslint to the 21 line.** Its peer range is `@angular/cli >= 21.0.0 < 22.0.0`; `latest` is the 22 line and will not install against this CLI.

## Configuration and profiles

- `src/main/resources/application.properties` is committed and holds profile-independent defaults: `ddl-auto=validate`, `open-in-view=false`, Flyway enabled and pointed at `classpath:db/migration`. It carries **no credentials**, but it is no longer credential-free in spirit: it now also pins `app.sheets.sheet-id`, `app.sheets.submission-sheet-id`, both tab names, `app.sheets.credentials-path` and `app.webhook.secret=` (blank). The two sheet ids point at the team's **live** Google Sheets, so every checkout polls them on startup — see *The Sheets sync pipeline*. Move these to `application-local.properties` / environment variables before deploying, and set a real webhook secret.
- `application-example.properties` is the template; copy it to `application-local.properties` (gitignored via `backend/.gitignore`) and fill in `app.google.client-id` and `app.jwt.secret`. **The app will not start without those two** — they are `@Validated @NotBlank` properties, so a missing value is a startup failure with a binding error, not a runtime 500.
- `src/test/resources/application.properties` **shadows** the main file rather than merging with it — both sit at the classpath root under the same name and the test classpath wins. Any setting tests need must be repeated there. It now carries `app.jwt.*` and `app.google.client-id` for exactly this reason: without them every context-loading test fails on validation.
- **Not everything in the template is wired.** `app.jwt.*` and `app.google.client-id` are read (`JwtProperties`, `GoogleAuthProperties`), and `app.sheets.*` / `app.webhook.secret` are read by `SheetsProperties` / `WebhookProperties`. `spring.data.redis.*` is still inert — no Redis starter in `pom.xml`. The `spring.security.oauth2.client.registration.google.*` block is commented out on purpose: the server-side redirect flow is unused because the frontend obtains the ID token itself and the backend only verifies it. The starter stays for a possible future integration.

**`SecurityConfig` now defines the chain**, so Spring Security's default auto-configuration no longer applies and the old "every endpoint is behind HTTP Basic with a random logged password" trap is gone. The replacement trap is `anyRequest().authenticated()`: a new endpoint outside `/api/auth/**` answers 401 to an anonymous caller by design. See *Authentication* for the matchers. The WebSocket starter is present and still unconfigured.

## CI

`.github/workflows/ci.yml` runs two independent jobs.

- **Frontend** — `npm ci`, `npm run lint`, `npm run format:check`, `npx ng test --watch=false`, `npm run build`. ⚠️ **`npm run lint` currently fails on `main`** — 31 errors, 24 `@typescript-eslint/no-explicit-any` and 7 `@typescript-eslint/no-unused-vars`, mostly in the API-response types added when the services were wired to the backend. The job is therefore red; fix the types rather than suppressing the rule. Note also that **`npm run format:check` is meaningless on a Windows checkout**: `core.autocrlf=true` with no `.gitattributes` gives the tree CRLF and Prettier's `endOfLine: "lf"` flags ~148 untouched files. Trust CI, not the local run, until a `.gitattributes` lands. **A failing spec, a lint violation or unformatted code fails the job**: no step carries `continue-on-error` or `--if-present`, so none of them can reach `main`. The missing `--if-present` on lint is deliberate — an earlier version had it, and the step silently did nothing while reading as though the code was linted. `--watch=false` is passed explicitly rather than left to the builder's CI detection — a runner with no TTY that fell into watch mode would hang until the job timeout, which reports as a hang rather than as a test failure. The build step also gates the bundle budget, which errors at 500 kB.
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

**Do not add a `Co-authored-by:` trailer for an assistant or any other tool.** GitHub resolves one to a real account, so it becomes a second author avatar on the commit and the PR and lands the tooling in the repo's Contributors sidebar as though it were a teammate. Credit the people; leave the tooling out of the log. Co-authoring with another **person** on the team is still fine and is what the trailer is for. #59 weighed rewriting the 41 existing trailers and **declined** — it would rewrite 94 of 126 commits and hand new SHAs to two teammates who never had one — so the old ones stay and only new commits follow this.

## Supporting documents

- `docs/README.md` — the record of which schema decisions are ratified and which are still proposals, plus how to run the form-registration importer and the column names it expects. Current as of V8.
- `docs/PROJECT-STATUS.md` — the progress tracker: what is built across both halves, what is not, and what comes next, with a per-PR delivery log. It defers to this file for conventions rather than repeating them.
- `docs/SHEETS-SETUP.md` — Google Cloud service-account setup, sheet sharing, and the Apps Script `onFormSubmit` webhook. Read it with *The Sheets sync pipeline* above, which covers the half that runs inside Spring.
- `docs/GCP_DEPLOYMENT_GUIDE.md` — Cloud Run deployment and monitoring, alongside the two production `Dockerfile`s.
- `docs/EVENT-PROPOSAL.md` and `docs/[G-06] Averis Hackathon Event Proposal.docx.pdf` — the event itself: format, tracks, prizes, timeline. The source of truth for anything the site *says* rather than does.
- `docs/databaseSchema.pdf` — the structural schema. See *Schema source of truth* for what it does and does not decide.
- `security/reports/` and `security/plans/` — a 17-category audit run from `AI-CHECKLIST.md`. **Read the reports as a snapshot, not a guarantee.** Sixteen of the seventeen are marked PASS, and the audit does not mention `POST /api/auth/dev-login` or the blank webhook secret at all — both of which are live in the tree. A PASS there means "this category was reviewed at that commit", not "this area is safe now".
- `AGENTS.md` — security rules for generated code. **They are written for a Next.js + Supabase/Firebase stack this project does not use** (`NEXT_PUBLIC_`, RLS policies, `dangerouslySetInnerHTML`, `pickle.loads`). The *principles* transfer; the specifics do not. Where a rule names a technology we do not have, map it onto the equivalent here — RLS onto the `hackathon_migrator` / `hackathon_app` privilege split, `NEXT_PUBLIC_` onto anything reachable from `frontend/src/`, and "auth middleware before the handler" onto `SecurityConfig`'s matcher chain rather than in-handler checks.
- `CONTRIBUTING.md` — commit prefixes and the branch/PR workflow.

**These go stale the same way everything else here does — and they have.** This file, `docs/README.md` and `docs/PROJECT-STATUS.md` all describe the same system from different angles, and nothing checks them against each other or against the database. Between PR #62 and PR #76 the code moved from "one auth endpoint" to a fully wired application and the docs did not move with it; this pass is the correction. A migration that changes a CHECK vocabulary, a DEFAULT or an `ON DELETE` rule has to update all three, plus the frontend union that mirrors it. When in doubt, read the live constraint rather than any of these:

```powershell
docker exec hackathon-pg16 psql -U postgres -d hackathon_db -c "\d+ teams"
```
