# Hackathon Website

Official website for the Monash University Malaysia hackathon — participant registration, submissions, judging, and the admin dashboard.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21 (standalone components, Signals) |
| Backend | Spring Boot 3.x (Java 21) |
| Database | PostgreSQL 16 |
| Cache / live updates | Redis + Spring WebSocket (STOMP) |
| Auth | Google Sign-In via OAuth2/OIDC + Spring Security (JWT) |
| CI/CD | GitHub Actions |

## Project Structure

```
hackathon-website/
├── frontend/       # Angular app
├── backend/        # Spring Boot app
├── docs/           # Proposal, schema diagrams, meeting notes
└── .github/        # CI workflows, issue/PR templates
```

## Getting Started

### Prerequisites

- Node.js 20+
- Java 21
- PostgreSQL 16 (or run via Docker — see below)
- A Google Cloud OAuth2 client ID (ask the project lead)

> `application.properties` holds shared, non-secret defaults (already committed). `application-local.properties` (see Backend setup below) holds your personal DB/secret values and is never committed.

### Frontend

​```bash
cd frontend
npm install
npm start
​```

Runs at `http://localhost:4200`.

### Backend

**Prerequisite:** PostgreSQL running locally. Quickest way is Docker:

​```bash
docker run --name hackathon-postgres -e POSTGRES_DB=hackathon_db -e POSTGRES_PASSWORD=changeme -p 5432:5432 -d postgres:16
​```

Copy the config template and fill in your local values (Google OAuth client ID/secret, DB credentials if different from above):

​```bash
cd backend
cp src/main/resources/application-example.properties src/main/resources/application-local.properties
​```

`application-local.properties` is gitignored — never commit real secrets in it.

Run it:

- **Mac/Linux:**
  ​```bash
  ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
  ​```
- **Windows (PowerShell):**
  ​```powershell
  .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
  ​```

Runs at `http://localhost:8080`.

## Branching & Workflow

- `main` is always deployable. No direct pushes — every change goes through a PR.
- Branch naming: `feature/short-description`, `fix/short-description`.
- At least 1 approval required before merge. CI must pass.

## Team

| Name | Role | GitHub |
|---|---|---|
| Shariq | Project Lead / Backend | @your-github-username |
| | Frontend | |
| | Frontend | |
| | Backend | |
| | Backend / DB | |

## Docs

See [`/docs`](./docs) for the full project proposal, database schema, and meeting notes.
