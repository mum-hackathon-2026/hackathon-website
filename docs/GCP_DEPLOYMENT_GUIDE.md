# Google Cloud Platform (GCP) & Cloud Run Production Deployment Guide

This guide provides a comprehensive, ground-zero roadmap for deploying and operating the **Monash Hackathon 2026** platform on Google Cloud Platform with high availability, security, auto-scaling, and continuous monitoring.

---

## 🏛️ Architecture Overview

```
                          [ Custom Domain: hackathon.monash.edu.my ]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [ Google Cloud Run: Frontend ]              [ Google Cloud Run: Backend ]
             (Angular 21 Nginx / Firebase)               (Spring Boot 4 / Java 21)
                       │                                           │
                       │                                           ▼
                       │                                [ Google Cloud Secret Manager ]
                       │                                (JWT, DB passwords, OAuth keys)
                       │                                           │
                       │                                           ▼
                       └──────────────────────────────────► [ Google Cloud SQL: PostgreSQL 16 ]
                                                            (Private IP via VPC Connector)
```

---

## 📋 Table of Contents
1. [Prerequisites & Initial Setup](#1-prerequisites--initial-setup)
2. [Database: Cloud SQL for PostgreSQL 16](#2-database-cloud-sql-for-postgresql-16)
3. [Secrets Management: Google Secret Manager](#3-secrets-management-google-secret-manager)
4. [Containerization & Artifact Registry](#4-containerization--artifact-registry)
5. [Backend Deployment on Cloud Run](#5-backend-deployment-on-cloud-run)
6. [Frontend Deployment (Cloud Run / Firebase Hosting)](#6-frontend-deployment)
7. [Custom Domain & SSL Mapping](#7-custom-domain--ssl-mapping)
8. [Automated CI/CD Pipeline (GitHub Actions)](#8-automated-cicd-pipeline)
9. [Continuous Monitoring & Observability](#9-continuous-monitoring--observability)

---

## 1. Prerequisites & Initial Setup

### 1.1 Install the Google Cloud SDK (`gcloud`)
```bash
# Verify installation
gcloud --version
```

### 1.2 Authenticate & Select Project
```bash
# Login to Google Cloud
gcloud auth login

# Set your GCP Project ID
export PROJECT_ID="monash-hackathon-2026"
export REGION="asia-southeast1" # Singapore (low latency for Malaysia)

gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION
```

### 1.3 Enable Required GCP Services
```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  vpcaccess.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com
```

---

## 2. Database: Cloud SQL for PostgreSQL 16

### 2.1 Create Cloud SQL Instance
```bash
gcloud sql instances create hackathon-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-7680 \
  --region=$REGION \
  --storage-auto-increase \
  --availability-type=zonal \
  --backup-start-time=02:00 \
  --enable-bin-log
```

### 2.2 Create Database & Users
```bash
# Create application database
gcloud sql databases create hackathon_db --instance=hackathon-postgres

# Set root postgres password
gcloud sql users set-password postgres \
  --instance=hackathon-postgres \
  --password="GENERATE_STRONG_ADMIN_PASSWORD"
```

### 2.3 Run Database Bootstrap (Role Separation)
Connect via Cloud SQL Auth Proxy:
```bash
# Download and start Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
./cloud-sql-proxy $PROJECT_ID:$REGION:hackathon-postgres --port 5433 &

# Execute bootstrap script
PGPASSWORD="GENERATE_STRONG_ADMIN_PASSWORD" psql -h 127.0.0.1 -p 5433 -U postgres -f scripts/bootstrap.sql
```

---

## 3. Secrets Management: Google Secret Manager

Store sensitive credentials securely without putting them in code:

```bash
# 1. JWT Secret (Generate random 256-bit key)
openssl rand -hex 32 | gcloud secrets create app-jwt-secret --data-file=-

# 2. Database Password
echo -n "YOUR_PROD_APP_DB_PASSWORD" | gcloud secrets create db-app-password --data-file=-
echo -n "YOUR_PROD_MIGRATOR_DB_PASSWORD" | gcloud secrets create db-migrator-password --data-file=-

# 3. Google OAuth Client ID
echo -n "YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com" | gcloud secrets create google-client-id --data-file=-

# 4. Webhook Secret (for Google Forms sync)
openssl rand -hex 24 | gcloud secrets create webhook-secret --data-file=-
```

Grant Cloud Run runtime service account access to read secrets:
```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in app-jwt-secret db-app-password db-migrator-password google-client-id webhook-secret; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 4. Containerization & Artifact Registry

### 4.1 Create Docker Repository
```bash
gcloud artifacts repositories create hackathon-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="Monash Hackathon Container Images"
```

### 4.2 Configure Docker Auth
```bash
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

---

## 5. Backend Deployment on Cloud Run

### 5.1 Build & Push Backend Container Image
```bash
export BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/hackathon-repo/backend:v1"

# Build using Google Cloud Build (or local docker)
gcloud builds submit backend/ --tag $BACKEND_IMAGE
```

### 5.2 Deploy Backend Service
```bash
gcloud run deploy hackathon-backend \
  --image=$BACKEND_IMAGE \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=1 \
  --max-instances=10 \
  --add-cloudsql-instances="${PROJECT_ID}:${REGION}:hackathon-postgres" \
  --set-env-vars="SPRING_PROFILES_ACTIVE=prod,SPRING_DATASOURCE_URL=jdbc:postgresql:///${PROJECT_ID}:${REGION}:hackathon-postgres/hackathon_db?socketFactory=com.google.cloud.sql.postgres.SocketFactory,SPRING_FLYWAY_URL=jdbc:postgresql:///${PROJECT_ID}:${REGION}:hackathon-postgres/hackathon_db?socketFactory=com.google.cloud.sql.postgres.SocketFactory,SPRING_DATASOURCE_USERNAME=hackathon_app,SPRING_FLYWAY_USER=hackathon_migrator" \
  --set-secrets="SPRING_DATASOURCE_PASSWORD=db-app-password:latest,SPRING_FLYWAY_PASSWORD=db-migrator-password:latest,APP_JWT_SECRET=app-jwt-secret:latest,APP_GOOGLE_CLIENT_ID=google-client-id:latest,APP_WEBHOOK_SECRET=webhook-secret:latest"
```

---

## 6. Frontend Deployment

### Option A: Deploy on Cloud Run (with Nginx)
```bash
export FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/hackathon-repo/frontend:v1"

# Build and deploy
gcloud builds submit frontend/ --tag $FRONTEND_IMAGE

gcloud run deploy hackathon-frontend \
  --image=$FRONTEND_IMAGE \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=1 \
  --max-instances=20
```

### Option B: Deploy on Firebase Hosting (Recommended for Global CDN)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select dist/hackathon-website-frontend/browser as public directory, single-page app = Yes
firebase deploy --only hosting
```

---

## 7. Custom Domain & SSL Mapping

1. In the **Cloud Run Console**, navigate to **Custom Domains** -> **Add Mapping**.
2. Select `hackathon-frontend` -> enter `hackathon.monash.edu.my`.
3. Add the provided DNS `A` and `AAAA` records in your University / DNS registrar.
4. Google automatically provisions and renews managed SSL/TLS certificates for free.

---

## 8. Automated CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Production CI/CD Pipeline

on:
  push:
    branches: [ main ]

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 1. Frontend Test & Build
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: cd frontend && npm ci && npm test -- --watch=false && npm run build

      # 2. Backend Test & Build
      - name: Setup Java 21
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'
      - run: cd backend && ./mvnw test

      # 3. Google Auth
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      # 4. Deploy Backend
      - name: Build & Deploy Backend
        run: |
          gcloud builds submit backend/ --tag asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/hackathon-repo/backend:${{ github.sha }}
          gcloud run deploy hackathon-backend --image asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/hackathon-repo/backend:${{ github.sha }} --region asia-southeast1

      # 5. Deploy Frontend
      - name: Build & Deploy Frontend
        run: |
          gcloud builds submit frontend/ --tag asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/hackathon-repo/frontend:${{ github.sha }}
          gcloud run deploy hackathon-frontend --image asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/hackathon-repo/frontend:${{ github.sha }} --region asia-southeast1
```

---

## 9. Continuous Monitoring & Observability

### 9.1 Uptime Checks (24/7 Availability Monitoring)
Create an automated global uptime check with alerts:
```bash
gcloud monitoring uptime create "Hackathon Frontend Health" \
  --uri="https://hackathon.monash.edu.my/" \
  --period=1m \
  --timeout=10s \
  --regions=asia-southeast1,asia-east1,europe-west1,us-central1
```

### 9.2 Real-Time Alert Policies
1. **HTTP 5xx Server Error Spike**:
   - Condition: `run.googleapis.com/request_count` with `response_code_class = 5xx` > 5 in 1 minute.
   - Notification: Send immediate email/Slack alerts to the Organizing Lead.
2. **High Latency Alert**:
   - Condition: 95th percentile latency > 2,000ms over a 5-minute window.
3. **Database Connection / CPU Utilization**:
   - Alert when Cloud SQL CPU exceeds 80% or connection pool hits 90% capacity.

### 9.3 Live Log Streams & Trace Explorer
* Access live server logs in real time:
  ```bash
  gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=hackathon-backend"
  ```
* Use **Google Cloud Trace** to trace request latency breakdowns between the Angular frontend, Spring Boot API, and PostgreSQL queries.
