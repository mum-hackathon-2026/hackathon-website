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

### Frontend

```bash
cd frontend
npm install
npm start
```

Runs at `http://localhost:4200`.

### Backend

```bash
cd backend
./mvnw spring-boot:run
```

Runs at `http://localhost:8080`. Copy `backend/src/main/resources/application-example.yml` to `application-local.yml` and fill in your local DB credentials and Google OAuth client ID/secret (this file is gitignored — never commit real secrets).

## Branching & Workflow

- `main` is always deployable. No direct pushes — every change goes through a PR.
- Branch naming: `feature/short-description`, `fix/short-description`.
- At least 1 approval required before merge. CI must pass.

## Team

| Name | Role | GitHub |
|---|---|---|
| Shariq | TBD | @ShariqNauman |
| Shamle | TBD | @Shamle-T |
| Jess | TBD | @Jess777-hub |
| Darren | TBD | @Darren772 |
| Timur | TBD | @tmurz |

## Docs

See [`/docs`](./docs) for the full project proposal, database schema, and meeting notes.
