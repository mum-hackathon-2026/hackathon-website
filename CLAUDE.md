# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git repository root is `hackathon-website/` (one level below the usual working directory `C:\Users\ASUS\SEM3\gdghackathon`). It is a two-app monorepo with no shared build tooling — `frontend/` and `backend/` are built, tested, and run independently, and CI treats them as two separate jobs.

The backend has a database layer (Flyway migrations, roles, CI service container) but no JPA entities, repositories, controllers, or security configuration yet. The frontend is still stock generator output — `app.routes.ts` is an empty array. Most architecture described in `README.md` is planned, not implemented.

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

Everything in that second list is currently an unratified proposal in V1. Don't treat the enum-like CHECK values (`users.role`, `teams.status`, `notifications_log.type`, and five others) as settled — the frontend will hardcode those literal strings, and the team has not signed off on them. `docs/README.md` tracks what is decided versus open.

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

## Commands

### Backend (`backend/`)

Windows/PowerShell needs `.\mvnw.cmd` and quoted `-D` args; Mac/Linux uses `./mvnw`.

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"   # → http://localhost:8080
.\mvnw.cmd test
.\mvnw.cmd test "-Dtest=FlywayBaselineMigrationTests"           # single test class
.\mvnw.cmd -B clean verify                                      # what CI runs
```

**Tests require a running Postgres.** H2 has been removed from `pom.xml` entirely — the baseline schema uses Postgres-specific DDL (`timestamptz`, `jsonb`, identity columns, cross-column CHECKs) that no substitute engine can execute. `FlywayBaselineMigrationTests` cleans `hackathon_db_test`, re-applies every migration, and asserts `flyway_schema_history` records V1 as successful. If it fails with a connection error, the container is not running.

Test connection settings are environment-overridable so CI can supply its own: `DB_TEST_URL`, `DB_TEST_USER`, `DB_TEST_PASSWORD`, each defaulting to the local 5433 container.

### Frontend (`frontend/`)

```bash
npm install
npm start                  # ng serve → http://localhost:4200
npm run build              # production config; enforces bundle budgets (1MB initial, 8kB per component style)
npm test                   # vitest via the @angular/build:unit-test builder (jsdom)
npx ng test --include src/app/app.spec.ts    # single spec file
npx prettier --write .     # only formatting tool configured
```

There is no lint script and no ESLint config. CI's `npm run lint --if-present` is currently a no-op — don't assume linting catches anything.

## Configuration and profiles

- `src/main/resources/application.properties` is committed and holds profile-independent defaults: `ddl-auto=validate`, `open-in-view=false`, Flyway enabled and pointed at `classpath:db/migration`. It deliberately carries **no credentials**.
- `application-example.properties` is the template; copy it to `application-local.properties` (gitignored via `backend/.gitignore`) and add the Google OAuth client id/secret and `app.jwt.secret`.
- `src/test/resources/application.properties` **shadows** the main file rather than merging with it — both sit at the classpath root under the same name and the test classpath wins. Any setting tests need must be repeated there.
- The template declares `spring.data.redis.*`, but there is no Redis starter in `pom.xml` yet, so those properties are inert.

## CI

`.github/workflows/ci.yml` runs two independent jobs. The backend job has a **`postgres:16` service container** with a `pg_isready` health check, exposed on the runner's `localhost:5432`, and sets `DB_TEST_URL`/`DB_TEST_USER`/`DB_TEST_PASSWORD` on the build step. Local development stays on 5433; only CI uses 5432.

## Stack notes that differ from the README

- `pom.xml` targets **Spring Boot 4.1.0** on Java 21, not "3.x" as the README says. Boot 4 renamed the starters: use `spring-boot-starter-webmvc` (not `-web`), and per-module test starters (`spring-boot-starter-data-jpa-test`, `-webmvc-test`, `-security-test`, …) instead of the single `spring-boot-starter-test`.
- Boot 4 also **split autoconfiguration into per-technology modules**. Adding a library alone is not enough to get its beans — `flyway-core` without `org.springframework.boot:spring-boot-flyway` gives you `NoSuchBeanDefinitionException: No qualifying bean of type 'org.flywaydb.core.Flyway'`. Expect the same pattern for other integrations.
- Angular 21 with standalone components and **no `zone.js` dependency** — the app is zoneless. Use signals for state; in tests `await fixture.whenStable()` rather than relying on automatic change detection.
- Angular files use the flat naming convention (`app.ts`, `app.html`, `app.scss`, `app.spec.ts`), not `app.component.ts`. New components default to SCSS via `angular.json` schematics.

## Workflow

`main` is protected: branch as `feature/<short-description>` or `fix/<short-description>`, open a PR against `main` (link the issue with `Closes #123`), get 1 approval with CI green, then squash-merge. Commit messages are prefixed by area — `frontend:`, `backend:`, `db:`. See `CONTRIBUTING.md`.
