# Backend status report

**Repo:** `mum-hackathon-2026/hackathon-website` — this file is `docs/BACKEND-STATUS.md`; paths below are relative to the git root, where the backend lives in `backend/`.
**As of:** commit `a8499ad` (= `origin/main`), 2026-08-12.
**Basis:** read from source, plus the live schema queried out of the local Postgres container. Nothing was benchmarked; test *existence* below is read from the tree, not a claim that a run was green on the day you read this.

---

## 1. Stack

| | |
|---|---|
| Framework | Spring Boot **4.1.0** on **Java 21**, Maven wrapper (`mvnw` / `mvnw.cmd`) |
| Group / artifact | `my.monash.hackathon` / `hackathon-website-backend` `0.0.1-SNAPSHOT` |
| Database | PostgreSQL 16, schema managed by **Flyway** |
| On classpath | data-jpa, security, security-oauth2-client, validation, **webmvc**, websocket, flyway, postgresql driver |

⚠️ **Boot 4, not Boot 3.** Two consequences that break copy-pasted Boot 3 code:

- Starters renamed: `spring-boot-starter-webmvc` (**not** `-web`), and per-module test starters (`-data-jpa-test`, `-webmvc-test`, `-security-test`, …) instead of one `spring-boot-starter-test`.
- Autoconfiguration is split per technology. Adding a library is **not** enough to get its beans — `flyway-core` alone gave `NoSuchBeanDefinitionException` for `Flyway` until `org.springframework.boot:spring-boot-flyway` was added. Expect the same for any new integration.

That split also **moved classes into per-technology packages**, so Boot 3 imports in tutorials do not resolve. The test annotations are where you meet this first:

| Class | Boot 4.1.0 package | Old Boot 3 package (gone) |
| ----- | ------------------ | ------------------------- |
| `@DataJpaTest` | `org.springframework.boot.data.jpa.test.autoconfigure` | `org.springframework.boot.test.autoconfigure.orm.jpa` |
| `@AutoConfigureTestDatabase` | `org.springframework.boot.jdbc.test.autoconfigure` | `org.springframework.boot.test.autoconfigure.jdbc` |
| `TestEntityManager` | `org.springframework.boot.jpa.test.autoconfigure` | `org.springframework.boot.test.autoconfigure.orm.jpa` |

**Verify a package against the classpath before importing it.** `.\mvnw.cmd -B dependency:build-classpath "-Dmdep.outputFile=target\tcp.txt" "-Dmdep.includeScope=test"`, then `jar tf` the jar you expect it in. A wrong import costs a full compile cycle to discover.

## 2. What exists

**The persistence layer, complete — and nothing above it.**

- **Two migrations.** `V1__baseline_schema.sql` creates 11 tables: `users`, `event_settings`, `teams`, `team_members`, `submissions`, `judging_criteria`, `assignments`, `scores`, `team_results`, `notifications_log`, `audit_log`. It seeds the `event_settings` singleton (`id = 1`) with everything inert — registration windows null, judging closed, nothing published. `V2__hard_delete_and_status_cleanup.sql` applies three ratified decisions (§6).
- **All 11 tables are mapped.** One `@Entity` per table, in feature packages under `my.monash.hackathon.hackathon_website_backend`: `user/`, `team/` (`Team` + `TeamMember`), `event/`, `submission/`, `judging/` (`JudgingCriteria`, `Assignment`, `Score`), `result/`, `notification/`, `audit/`. **Keep that shape** — packages are by feature, not by layer.
- **11 Spring Data repositories**, one per entity, deliberately thin: `JpaRepository` plus a few derived queries (`findByEmail`, `findByJoinCode`, `findByJudgeId`, `findByIsActiveTrueOrderByDisplayOrder`, …). **There is no `@Query` anywhere.** Keep it that way until something genuinely cannot be expressed derivationally.
- **13 test classes** — 11 repository tests (one per entity, JPA slice), `FlywayBaselineMigrationTests`, and the generated context-load test.
- Two DB roles with a deliberate privilege split (`scripts/bootstrap.sql`): `hackathon_migrator` owns the schema and runs Flyway; `hackathon_app` is the application, **DML only, no DDL**.
- CI (`.github/workflows/ci.yml`) — two independent jobs. Backend runs `./mvnw -B clean verify` against a `postgres:16` service container with a `pg_isready` health gate. Frontend runs `npm ci`, `npx ng test --watch=false`, `npm run build`; **a failing frontend spec now fails the job**, which was not true until recently.

### Entity conventions that are easy to undo by accident

Each of these encodes a rule. A naive entity discards it.

- **`role` and `status` are `String`, not Java enums.** Those CHECK vocabularies are still unratified (§6); an enum freezes them early and risks failing `ddl-auto=validate` against a text column. `User` has **no** `status` field — V2 dropped the column.
- **Column DEFAULTs are duplicated as Java field initialisers** (`role = "participant"`, `status = "forming"` / `"draft"` / `"pending"`, `shortlisted = false`, `weight = 1.00`, `maxTeamSize = 4`, …). Deliberate: those columns are `NOT NULL` and Hibernate always names them in the INSERT, so the database DEFAULT never gets a chance to apply — a null field fails the insert rather than falling back. **Nothing enforces the correspondence and no test can catch a mismatch**, since both sides stay individually valid. A migration that changes a DEFAULT must change the initialiser in the same commit.
- **`created_at` / `joined_at` / `assigned_at` are database-owned** — `insertable = false, updatable = false` plus `@Generated(event = EventType.INSERT)`, so the entity refreshes after insert instead of holding a stale null. No setters.
- **Every association is `FetchType.LAZY`**, and `open-in-view` is false, so an untraversed proxy fails loudly instead of quietly opening a connection during response rendering.
- **Protected no-arg constructor for Hibernate**, public constructor taking the non-null columns; optional columns set afterwards.
- **`numeric(p, s)` columns carry explicit `precision`/`scale`** and are `BigDecimal`, never `double`. `ddl-auto=validate` checks these — `numeric(5, 2)` must be `precision = 5, scale = 2`, and `team_results.final_score` is `numeric(6, 2)`.
- **Three entities share their primary key with a parent via `@MapsId`** — `TeamMember` (on `users`), `Submission` (on `teams`), `TeamResult` (on `teams`). The FK column *is* the PK, and that is what enforces one team per person, one submission per team, one result per team. Adding a `@GeneratedValue` surrogate id silently drops the constraint. The pattern is a `@Id @Column` scalar plus `@MapsId` on the `@OneToOne`.
- **`EventSettings` is a singleton row** — `id` assigned, not generated (`EventSettings.SINGLETON_ID = 1L`), because V1 constrains it with `check (id = 1)`. Reach it via `EventSettingsRepository.findSingleton()`, never `findAll().get(0)`.
- **`Score` snapshots its criterion.** The constructor copies `criteria.getMaxScore()` and `getWeight()` into `criteriaMaxScoreSnapshot` / `criteriaWeightSnapshot`, and V1's `check (score >= 0 and score <= criteria_max_score_snapshot)` validates against the snapshot — so editing a criterion later cannot retroactively invalidate scores already given. Never set the snapshots by hand.
- **`AuditLog.details` is `jsonb` carried as a `String`** via `@JdbcTypeCode(SqlTypes.JSON)` — no JSON format mapper, no extra dependency. Nothing validates the structure or even that it is JSON; malformed input surfaces as a database error at flush time. Build it with a serialiser, not concatenation.
- **`Team` and `Submission` have `@Version` columns** (optimistic locking). No other entity does.

## 3. What does NOT exist yet

Everything above persistence. Grepping for `@RestController`, `@Service` or `@Controller` returns **zero hits**.

- **No controllers, services or DTOs** — zero HTTP endpoints.
- **No security configuration**, and no JWT or OAuth2 login wiring.
- **No connection to the frontend.** The frontend makes no network call at all: `app.config.ts` provides only `provideBrowserGlobalErrorListeners()` and `provideRouter(routes)`, with no `provideHttpClient`, and nothing imports `HttpClient` or calls `fetch`. It runs on in-memory stand-in services. Wiring the two halves together is the next real piece of work.

⚠️ **Live trap:** `spring-boot-starter-security` is on the classpath with **no configuration class**. Boot's default chain therefore applies — every endpoint you add is secured out of the box behind HTTP Basic with user `user` and a random password logged at startup. **Your first controller will answer 401 and look broken** until a `SecurityFilterChain` exists. This is the single most likely thing to cost you an afternoon.

⚠️ `application-example.properties` declares `spring.data.redis.*` and `app.jwt.*`, but there is **no Redis starter in `pom.xml`** and no code reads `app.jwt.*`. Those properties are inert placeholders, not working config.

## 4. Config and profiles

- `application.properties` (committed) holds profile-independent defaults only: `ddl-auto=validate`, `open-in-view=false`, Flyway on and pointed at `classpath:db/migration`. **Carries no credentials, by design.**
- `application-example.properties` is the template → copy to `application-local.properties` (gitignored), then add Google OAuth client id/secret and `app.jwt.secret`.
- Flyway credentials are configured **separately** from `spring.datasource.*` on purpose. If Flyway runs as `hackathon_app`, migrations fail with `permission denied for schema public`.
- `src/test/resources/application.properties` **shadows** the main file rather than merging — same name at classpath root, test classpath wins. Any setting the tests need must be repeated there.
- **Ports:** local Postgres is Docker container `hackathon-pg16` on **5433**. Port 5432 on the original author's machine is an unrelated native PostgreSQL 18 install — never point project config at it. CI is the exception and uses 5432 for its own container.
- The container's `postgres` superuser password is chosen per-machine and deliberately recorded nowhere in the repo. It is only needed for `scripts/bootstrap.sql`.

## 5. Commands (PowerShell — needs `.\mvnw.cmd` and quoted `-D` args)

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"   # → http://localhost:8080
.\mvnw.cmd test
.\mvnw.cmd test "-Dtest=FlywayBaselineMigrationTests"
.\mvnw.cmd -B clean verify                                      # what CI runs
```

First-time setup:

```powershell
docker start hackathon-pg16          # or docker run, see README
docker exec -i hackathon-pg16 psql -U postgres < scripts/bootstrap.sql
cd backend
copy src\main\resources\application-example.properties src\main\resources\application-local.properties
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

**Tests require a running Postgres.** H2 was deliberately removed from `pom.xml` — V1 uses `timestamptz`, `jsonb`, identity columns and cross-column CHECKs that no substitute engine executes. A connection error means the container isn't up. Overridable via `DB_TEST_URL` / `DB_TEST_USER` / `DB_TEST_PASSWORD`.

### How the tests are built, and two traps in them

Entity/repository tests use the JPA slice pinned to the real database:

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
```

`Replace.NONE` is what stops the slice swapping in an embedded database. Without it the test runs against an engine that cannot execute V1, proving nothing about the real schema. The slice is transactional and rolls back per test, so tests do not leak rows.

⚠️ **Asserting on a constraint violation? Flush through the repository, not `TestEntityManager`.** Spring translates driver errors into its own `DataAccessException` hierarchy *at the repository proxy boundary*. `TestEntityManager.flush()` bypasses that proxy, so the constraint still fires but arrives as Hibernate's raw `ConstraintViolationException` and an assertion expecting `DataIntegrityViolationException` fails. Use `repository.saveAndFlush(entity)` — which is also what application code will do.

`FlywayBaselineMigrationTests` cleans `hackathon_db_test`, re-applies every migration, and asserts that **two** migrations ran to target version `2`, that `flyway_schema_history` records V1 and V2 as successful, that all 11 tables exist, and that the seeded singleton is inert. Because `flyway.clean()` drops everything and `DB_TEST_URL` is overridable, it **refuses to run** unless live JDBC connection metadata shows a database ending in `/hackathon_db_test` — read from the connection, not from a property, so config cannot fool it.

⚠️ It proves the migrations work **from empty**. It does **not** prove V2 applies on top of an existing V1 database, which is how teammates will actually meet it. Start the app against your local database to check that.

## 6. Schema decisions — read before writing anything that touches the database

`docs/databaseSchema.pdf` is the structural source of truth and V1 matches it column for column — but it is **structural only** (tables, columns, PKs, FKs, unique constraints) and **V2 has since changed things the diagram still shows the old way**. Read V1 and V2, or read the live database.

### Ratified by V2 — settled

- **`users.status` is gone.** Deletion is a **hard delete**, not a soft delete. No status column to filter on, no `status` field on `User`. The PDF still shows this column; it does not exist.
- **`teams.status` is `forming`, `complete`, `disqualified`, `withdrawn`** — `'submitted'` was removed. Submission state lives **only** on `submissions.status`, which keeps its full vocabulary. To know whether a team submitted, **join `submissions`** — don't read `teams.status`.
- **`assignments.judge_id` is `ON DELETE CASCADE`** (V1 had `RESTRICT`), so a judge can delete their own account while holding assignments.
- **Empty teams are retained deliberately** — no trigger, no sweep. The team keeps its UNIQUE name and join code so the name stays reserved and the code still works. V2 says so in a comment with no DDL. Don't "fix" it.

Because deletion is real now, **the `ON DELETE` rules are live behaviour rather than annotation.** Deleting a user cascades away their `team_members` row and, as a judge, their `assignments` and `scores`, and nulls out `teams.created_by`, `event_settings.updated_by`, `notifications_log.user_id` and `audit_log.actor_user_id`. That last one means deleting a user **anonymises their audit trail rather than deleting it**.

### Still unratified — proposals

- **CHECK vocabularies.** `users.role`, `submissions.status` and `team_results.outcome` are used verbatim by the frontend but were never formally approved. `assignments.status`, `notifications_log.type` and `notifications_log.status` have **never been reviewed at all** — no judge or admin page exists, so nothing has pushed back on them. **The frontend hardcodes these strings**, so changing one breaks a TypeScript union with only a comment connecting the two.
- **Column data types** — e.g. `audit_log.details` is `jsonb`; the diagram only says `details`.
- **`ON DELETE` behaviour beyond what V2 settled.**
- **Team size limits** — seeded 1 and 4, confirmed by no document.

`docs/README.md` tracks decided vs. open in full, and is current as of this report.

## 7. Rules for whoever works here next

1. **Applied migrations are immutable.** Never edit a merged `V*.sql` — Flyway checksums each one, and a change makes every teammate's DB fail validation at startup. Always add `V<n>__description.sql`.
2. **Hibernate must never issue DDL.** `ddl-auto=validate` is deliberate; the schema belongs to Flyway.
3. **A migration that changes a CHECK vocabulary must change the frontend union in the same commit** — and a migration that changes a column DEFAULT must change the Java field initialiser. Nothing enforces either correspondence, and both have already drifted once. Grep for the old literals before you finish.
4. **Never commit real secrets.** Credentials belong in gitignored `application-local.properties` or CI env vars. The `dev_*_local` passwords are container-local dev values and must not be reused anywhere deployed.
5. **Workflow:** `main` is protected. Branch `feature/<desc>` or `fix/<desc>`, PR into `main` with `Closes #123`, 1 approval + green CI, squash-merge and delete the branch. Commit messages are area-prefixed: `backend:`, `db:`, `frontend:`, `ci:`, `docs:`.

## 8. Where to start

The persistence layer is finished and the frontend is waiting on an API. The first controller is the natural next task — and **write the `SecurityFilterChain` before or alongside it**, or you will spend the afternoon debugging a 401 that is Boot's default chain rather than anything you wrote (§3).
