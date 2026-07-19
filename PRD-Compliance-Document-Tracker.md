# Product Requirements Document (PRD)
## Compliance Document Tracker — MVP

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft — Ready for Development |
| **Owner** | Solo Developer (Resume Project) |
| **Last Updated** | July 19, 2026 |

---

## 1. Overview

### 1.1 Problem Statement
Companies manage compliance-critical documents — licenses, certificates, insurance policies, contracts, permits — that carry expiry dates. Many organizations still track these in spreadsheets, which leads to missed renewals, audit failures, fines, and operational disruption.

### 1.2 Solution
A centralized web application where compliance documents are uploaded, tracked, and monitored. The system automatically flags documents nearing expiry and sends email reminders before deadlines are missed.

### 1.3 Goal of This Project
This is an MVP built to demonstrate backend engineering competency for a job application (backend/full-stack developer role). Priorities are: clean relational schema design, REST API design, file handling, scheduled background jobs, and email integration — not feature breadth or scale.

### 1.4 Explicit Non-Goals
- No role-based access control (RBAC) — single demo admin account only
- No multi-tenancy
- No AI/OCR features
- No digital signatures or approval workflows
- No mobile app

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL |
| ORM | Prisma |
| Backend | Node.js + Express |
| Frontend | React |
| Auth | JWT (single admin user) |
| File Upload | Multer (local disk storage for MVP) |
| Scheduler | node-cron |
| Email | Nodemailer |
| Validation | Zod |
| API Docs | Swagger / OpenAPI |
| Containerization | Docker + docker-compose |
| Deployment | Render / Railway |

---

## 3. User

**Single Admin User** — no roles, no permissions tiers. One seeded account (email + password) logs into the system and has full access to all features. Authentication exists only to gate the app, not to segment data.

---

## 4. Database Schema

### 4.1 Entity Overview
Three tables total. No `departments`, `owners`, or `roles` tables — kept flat intentionally for MVP scope.

### 4.2 `admin`
| Column | Type | Notes |
|---|---|---|
| id | UUID / Serial | Primary key |
| email | String | Unique |
| password_hash | String | bcrypt hashed |
| created_at | Timestamp | |

### 4.3 `documents`
| Column | Type | Notes |
|---|---|---|
| id | UUID / Serial | Primary key |
| title | String | Required |
| category | Enum | `license`, `certificate`, `insurance`, `contract`, `permit`, `tax_document` |
| issue_date | Date | Required |
| expiry_date | Date | Required |
| status | Enum (computed) | `active`, `expiring_soon`, `expired` |
| notify_email | String | Email to receive reminders for this document |
| file_path | String | Path to uploaded PDF |
| description | String (nullable) | Optional notes |
| created_at | Timestamp | |
| updated_at | Timestamp | |

**Status computation rule** (applied at read time, not stored as static truth):
```
days_remaining = expiry_date - current_date

if days_remaining < 0        → expired
elif days_remaining <= 30    → expiring_soon
else                          → active
```

### 4.4 `notifications`
| Column | Type | Notes |
|---|---|---|
| id | UUID / Serial | Primary key |
| document_id | FK → documents.id | |
| days_before | Integer | One of: 30, 15, 7 |
| sent_at | Timestamp | |

Purpose: prevents duplicate reminder emails for the same milestone on the same document.

### 4.5 Relationships
```
documents 1 ──── * notifications
```
That's the only foreign key relationship in the schema.

---

## 5. Feature Requirements

### 5.1 Authentication
- Single seeded admin account (created via seed script, not signup flow)
- `POST /auth/login` — returns JWT on valid credentials
- All `/documents` and `/dashboard` routes protected by JWT middleware
- No registration endpoint, no password reset flow (out of scope for MVP)

### 5.2 Document Management (CRUD)
- Create document: title, category, issue date, expiry date, notify email, optional description, file upload (PDF)
- Edit document: update any field, replace file
- Delete document: removes DB record and associated file
- View single document: full details + computed status
- Download document file

### 5.3 Status Logic
- Status is never stored as a static field the user sets manually — always derived from `expiry_date` vs current date at query time
- Applied consistently across list view, detail view, and dashboard counts

### 5.4 Dashboard
Returns aggregate counts:
- Total documents
- Expired count
- Expiring within 7 days
- Expiring within 30 days
- Category-wise breakdown (count per category)

Implemented via SQL `GROUP BY` / `COUNT`, not application-side looping — this is a deliberate technical choice to demonstrate DB-level aggregation skill.

### 5.5 Search & Filter
- Search documents by title (case-insensitive partial match)
- Filter by `category`
- Filter by `status` (computed field, filtered post-query or via date range logic)
- Pagination: `page`, `limit` query params, returns total count + page data

### 5.6 Email Reminder System
- `node-cron` job runs once daily (midnight)
- Job logic:
  1. Query all documents where `days_remaining` ∈ {30, 15, 7}
  2. For each match, check `notifications` table — has this `document_id` + `days_before` combination already been sent?
  3. If not sent, send email via Nodemailer to `notify_email`, then insert a row into `notifications`
- Email content: document title, category, expiry date, days remaining

### 5.7 File Handling
- Accept PDF only, max size limit (e.g. 5MB) enforced via Multer config
- Files stored on local disk under `/uploads`, path saved in `file_path` column
- Serve file via authenticated download endpoint (not static public folder)

---

## 6. API Specification

| Method | Route | Description |
|---|---|---|
| POST | `/auth/login` | Authenticate admin, return JWT |
| GET | `/documents` | List documents (supports `search`, `category`, `status`, `page`, `limit` query params) |
| POST | `/documents` | Create document (multipart/form-data with file) |
| GET | `/documents/:id` | Get single document detail |
| PUT | `/documents/:id` | Update document |
| DELETE | `/documents/:id` | Delete document |
| GET | `/documents/:id/file` | Download associated file |
| GET | `/dashboard` | Return aggregate stats |

All routes except `/auth/login` require `Authorization: Bearer <token>` header.

---

## 7. Validation Rules

Enforced via Zod schemas at the API boundary:
- `title`: required, string, 3–150 chars
- `category`: required, must be one of the defined enum values
- `issue_date`: required, valid date, must be ≤ today
- `expiry_date`: required, valid date, must be after `issue_date`
- `notify_email`: required, valid email format
- `file`: required on create, PDF only, max 5MB

---

## 8. Non-Functional Requirements

- **Error handling:** consistent JSON error shape (`{ error: string, details?: any }`), proper HTTP status codes
- **Logging:** request logging via middleware (e.g. `morgan`) for basic observability
- **API documentation:** Swagger UI available at `/api-docs`
- **Environment config:** `.env` for DB URL, JWT secret, email credentials — never hardcoded
- **Containerization:** `docker-compose.yml` running app + Postgres for one-command local setup

---

## 9. Build Plan

| Phase | Days | Deliverable |
|---|---|---|
| 1 | 1–2 | Prisma schema, migrations, seed script, JWT auth, document CRUD + file upload |
| 2 | 3–4 | Status computation logic, dashboard aggregation endpoint, search/filter/pagination |
| 3 | 5–6 | node-cron reminder job, Nodemailer integration, notifications dedup logic |
| 4 | 7 | Swagger docs, Dockerization, deployment, README with ER diagram and setup instructions |

Estimated: ~1 week full-time, ~2 weeks part-time.

---

## 10. Definition of Done (MVP)

- [ ] Admin can log in with seeded credentials and receive a JWT
- [ ] Admin can create, edit, delete, and view documents with file upload
- [ ] Status (active / expiring_soon / expired) is correctly computed on every fetch
- [ ] Dashboard returns accurate aggregate counts
- [ ] Search, category filter, status filter, and pagination all work together
- [ ] Daily cron job sends reminder emails at 30/15/7 day marks without duplicating sends
- [ ] All endpoints documented in Swagger
- [ ] App runs via `docker-compose up` with one command
- [ ] README includes setup steps, ER diagram, and a short project write-up suitable for a resume/portfolio link

---

## 11. Future Enhancements (explicitly post-MVP — not to be built now)

- Role-based access control (Admin / Compliance Officer / Manager / Employee)
- Multi-tenant support (multiple companies/organizations)
- Departments and document ownership per user
- OCR-based expiry date extraction from uploaded PDFs
- AI-based document classification
- Digital signatures and approval workflows
- Document version history
- Calendar integration for renewal reminders

---

## 12. Resume Positioning

**One-line summary for resume:**
"Built a compliance document tracking system (Node.js, Express, PostgreSQL, React) with automated expiry monitoring, scheduled email reminders via cron jobs, and RESTful APIs — modeling a real enterprise workflow used to prevent regulatory penalties from missed document renewals."

**Interview talking points this project supports:**
- Relational schema design and normalization
- Deriving computed state (status) from raw data rather than trusting stored flags
- Preventing duplicate side effects (notification dedup) in scheduled jobs
- SQL aggregation for dashboard metrics
- Secure file upload handling and validation
- RESTful API design with pagination, filtering, and search
