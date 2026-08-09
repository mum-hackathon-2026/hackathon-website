# Hackathon Website

Official website for the Monash University Malaysia hackathon — participant registration, submissions, judging, and the admin dashboard.

## Tech Stack

| Layer                | Technology                                             |
| -------------------- | ------------------------------------------------------ |
| Frontend             | Angular 21 (standalone components, Signals)            |
| Backend              | Spring Boot 4.1 (Java 21)                              |
| Database             | PostgreSQL 16, schema managed by Flyway                |
| Cache / live updates | Redis + Spring WebSocket (STOMP)                       |
| Auth                 | Google Sign-In via OAuth2/OIDC + Spring Security (JWT) |
| CI/CD                | GitHub Actions                                         |

## Project Structure

```
hackathon-website/
├── frontend/       # Angular app
├── backend/        # Spring Boot app
├── scripts/        # Database bootstrap
├── docs/           # Proposal, schema diagrams, meeting notes
└── .github/        # CI workflows, issue/PR templates
```

## Getting Started

### Prerequisites

- Node.js 20+
- Java 21
- Docker (for PostgreSQL 16)
- A Google Cloud OAuth2 client ID (ask the project lead)

> `application.properties` holds shared, non-secret defaults (already committed). `application-local.properties` (see Backend setup below) holds your personal secrets and is never committed.

### Frontend

```bash
cd frontend
npm install
npm start
```

Runs at `http://localhost:4200`.

### Backend

Three commands from a clean machine.

**1. Start PostgreSQL 16.** It runs on port **5433**, not 5432 — 5432 is commonly taken by an existing native Postgres install, and pointing this project at the wrong server is the most common setup mistake.

```bash
docker run --name hackathon-pg16 \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  -v hackathon_pg16_data:/var/lib/postgresql/data \
  -d postgres:16
```

Already created it once? Just `docker start hackathon-pg16`.

**2. Create the roles and databases.** This is idempotent for roles and only needs running once.

```bash
docker exec -i hackathon-pg16 psql -U postgres < scripts/bootstrap.sql
```

It creates `hackathon_db` and `hackathon_db_test`, plus two roles with different privileges: `hackathon_migrator` owns the schema and runs migrations, while `hackathon_app` — the role the application itself uses — can only read and write rows, never change the schema. The passwords are local-development-only values documented in the script.

> `scripts/bootstrap.sql` only works through `psql`. It uses `\c` (a psql meta-command) and `CREATE DATABASE` (which cannot run inside a transaction), so pasting it into a GUI SQL editor will not work.

**3. Configure and run.** Copy the template, then add your Google OAuth client ID/secret and a JWT secret — the database settings are already correct.

```bash
cd backend
cp src/main/resources/application-example.properties src/main/resources/application-local.properties
```

- **Mac/Linux:**
  ```bash
  ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
  ```
- **Windows (PowerShell):**
  ```powershell
  .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
  ```

Runs at `http://localhost:8080`. Flyway applies any pending migrations on startup.

### Database migrations

Schema changes live in `backend/src/main/resources/db/migration/` as `V<n>__description.sql` and are applied by Flyway.

**Never edit a migration that has been merged.** Flyway stores a checksum for every applied file; changing one makes every teammate's database fail validation at startup. Add a new `V<n>` file instead.

Tests run against `hackathon_db_test` and wipe it on every run, so don't keep anything you care about there.

## Branching & Workflow

- `main` is always deployable. No direct pushes — every change goes through a PR.
- Branch naming: `feature/short-description`, `fix/short-description`.
- At least 1 approval required before merge. CI must pass.

## Team

| Name   | Role | GitHub        |
| ------ | ---- | ------------- |
| Shariq | TBD  | @ShariqNauman |
| Shamle | TBD  | @Shamle-T     |
| Jess   | TBD  | @Jess777-hub  |
| Darren | TBD  | @Darren772    |
| Timur  | TBD  | @tmurz        |

## Docs

See [`/docs`](./docs) for the full project proposal, database schema, and meeting notes.
