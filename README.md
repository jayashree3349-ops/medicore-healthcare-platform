# MediCore – Enterprise Healthcare Cloud Platform

**Assignment:** MediCore – Enterprise Healthcare Cloud Platform
**Author:** Jaya Sree

## 1. Problem Statement

Healthcare organizations need secure digital systems to manage patient records, appointments, clinical information, and operational analytics. MediCore demonstrates an integrated cloud-oriented platform for these workflows.

## 2. Solution

MediCore is a healthcare platform prototype featuring:
- React and TypeScript dashboard.
- Node.js and Express REST API.
- PostgreSQL database.
- Redis and MinIO infrastructure.
- JWT authentication and TOTP multi-factor authentication.
- Role-based access control.
- Patient and clinical record management.
- Appointment workflow.
- Healthcare analytics.
- FHIR R4-oriented API endpoints.
- Audit logging and Kubernetes infrastructure manifests.

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Object storage | MinIO |
| Orchestration | Kubernetes |
| Package manager | npm |

## 4. Repository Structure

- `apps/frontend` – React dashboard.
- `services/api` – Backend API, routes, middleware and database migration.
- `infrastructure/kubernetes` – Database, cache, object storage and storage manifests.

## 5. Setup and Execution

Requirements: Node.js compatible with the root package engine, npm, and configured PostgreSQL, Redis and Kubernetes infrastructure.

Install dependencies:

    npm ci

Build frontend:

    npm run build --workspace frontend

Compile API:

    npx tsc -p services/api/tsconfig.json

Run frontend:

    npm run dev --workspace frontend

Run API after compiling and configuring environment variables:

    node services/api/dist/server.js

Required API configuration includes database connection settings, `JWT_SECRET`, and `MFA_ENCRYPTION_KEY`. Keep all actual credentials outside source control.

## 6. API Endpoints

| Endpoint | Purpose |
|---|---|
| `/health` | API health |
| `/ready` | Database readiness |
| `/api/auth` | Authentication |
| `/api/auth/mfa` | MFA operations |
| `/api/patients` | Patient records |
| `/api/clinical` | Clinical records |
| `/api/appointments` | Appointment management and visit reports |
| `/api/analytics` | Analytics |
| `/fhir/r4` | FHIR-oriented interoperability |

Protected healthcare routes require authentication and appropriate staff roles.

Appointment management supports a seven-state workflow: requested, scheduled, confirmed, checked in, in progress, completed, and cancelled. Invalid state transitions are rejected. A pre-insert overlap check rejects conflicting appointments for the same clinician. This check is not yet concurrency-safe at the database level.

Visit reports support creation and retrieval, with one report per appointment. Clinicians are restricted to reports for their assigned appointments. Diagnosis and vital-sign data are stored as PostgreSQL JSONB.

## 7. Security Features

Implemented controls include password hashing, JWT authentication, TOTP MFA, role-based authorization, request validation, Helmet security headers, Express rate limiting, and selected-operation audit logging.

An audit-log database trigger blocks record updates and deletes.

These controls do not constitute HIPAA certification or complete regulatory compliance. Rate limiting is currently process-local, and production TLS is not configured.

## 8. Kubernetes Deployment

Kubernetes manifests are located under `infrastructure/kubernetes/`.

The repository includes manifests for PostgreSQL, Redis, MinIO, and local persistent storage.

Before applying manifests:
1. Configure deployment-specific Kubernetes Secrets.
2. Replace repository placeholders with secure values.
3. Verify storage and resource requirements.
4. Apply manifests and check pod readiness.

The current demonstration environment uses a kubeadm Kubernetes cluster on AWS EC2, not Amazon EKS.

## 9. Monitoring

Prometheus is deployed in the `medicore` namespace and scrapes the API metrics endpoint at `medicore-api:3001/metrics`. The API exposes HTTP request counters and process metrics. The Prometheus target was verified as healthy. Prometheus currently uses ephemeral storage, so historical metrics are not guaranteed to survive pod recreation.

## 10. Validation Performed

- Frontend production build successful.
- API TypeScript compilation successful.
- API health and database readiness checks successful.
- MFA login flow tested.
- Analytics endpoints tested.
- Security response headers checked.
- Audit-log update and delete protection tested.
- Appointment state transitions tested, including rejection of an invalid transition.
- Clinician appointment-overlap conflict check tested.
- Visit-report creation and retrieval tested.
- Visit-report diagnosis and vital-sign JSONB persistence verified.
- Duplicate visit-report creation rejected.
- Clinician assignment enforcement tested: a clinician token with a different user ID receives HTTP 403 for both report retrieval and creation.

## 11. Limitations and Future Work

This is a demonstration prototype, not a production healthcare deployment. Remaining work includes production TLS, distributed rate limiting, complete patient ownership authorization, refresh-token lifecycle, database-level concurrency protection for appointment conflicts, appointment reminder scheduling, notifications, Grafana dashboards, centralized logging, distributed tracing, CI/CD, high availability, and independent FHIR conformance validation.

Only synthetic demonstration data should be used. Do not store real patient information in this prototype.

## 12. License

Refer to the applicable assignment and project licensing terms before redistribution.

### Application Deployment Details

The demonstration application is deployed on the kubeadm cluster using:
- `infrastructure/kubernetes/apps/api.yaml` — API Deployment and ClusterIP Service.
- `infrastructure/kubernetes/apps/frontend.yaml` — frontend Deployment and NodePort Service.
- API container image: `localhost/medicore-api:1.1`.
- Frontend container image: `localhost/medicore-frontend:1.0`.
- Frontend access: `http://13.206.197.147:30080`.
- API listens on port 3001 and connects to the PostgreSQL Kubernetes Service.
- API environment variables are supplied through the `medicore-api-env` Kubernetes Secret.

Both application workloads are currently scheduled on the control-plane node because the locally imported images are available there. The frontend is exposed through NodePort 30080.

This is a demonstration deployment. Images are locally imported rather than pulled from a container registry. The cluster does not currently provide production high availability, TLS termination, or an ingress controller.
