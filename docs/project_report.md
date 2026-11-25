# DocShield Compliance Management Suite - Full Project Report

This report outlines the design, architecture, implementation history, and end-to-end operations of the **DocShield Compliance Management Suite (MVP)** from scratch to completion.

---

## 1. Project Vision & Scope

DocShield is a premium compliance and document lifecycle management platform. The project was designed and built to help organizational administrators audit, upload, monitor, and renewal-track critical institutional safety records, insurance policies, permits, and quality checklists before legal expirations occur.

### User Stories & Journey
* **Credential Verification (System Admin)**: Authenticates securely to the administrative panel using secure cryptographic validation layers.
* **Asset Upload & Audits**: Uploads physical proof documents (PDFs) and fills registry fields (issue date, expiry date, notification email, description). The system inspects dates at write time to ensure logical order (`issueDate <= today` and `expiryDate > issueDate`).
* **Active Monitoring Dashboard**: Audits fleet metrics at a glance (total counts, expired alerts, and imminent expiration queues) colored and flagged dynamically based on real-time calendar thresholds.
* **Compliance Search & Extraction**: Performs fast filters matching doc titles/descriptions, filtering by category dropdowns, and paginates through records in increments of 5 entries to preserve memory.
* **Protected Downloads**: Downloads uploaded PDF credentials securely using token-validated streaming channels.
* **Automated Expiry Notifications**: Scans database records daily and sends reminder emails at 30, 15 and 7 days before expiry and again once a document has expired, using a unique (document, expiry date, threshold) record to prevent duplicate emails. A missed run or a late upload is still warned.

---

## 2. Technical Stack Selection (The "Why")

```mermaid
graph TD
    Client[React Client - Vite Port 3000] -->|HTTP Requests / Proxy| Backend[Express API Server - Port 5000]
    Backend -->|Prisma Client| Database[(PostgreSQL DB - Port 5432)]
    Backend -->|Cron Scan Daemon| Mailer[Email Transporter (Nodemailer SMTP)]
```

### 1. Database Layer: PostgreSQL & Prisma ORM
* **Why PostgreSQL**: Standard, highly reliable relational ACID-compliant database. Perfect for structuring strict relationships (such as cascade unlinking of notifications and tracking unique document codes).
* **Why Prisma**: Provides type-safe schema definitions and automatic TypeScript/JavaScript client generations, saving boilerplate SQL writing. The migration system guarantees matching databases across environments.

### 2. API Backend Layer: Node.js & Express
* **Why Express**: Extremely lightweight, flexible, and robust web framework. Allows for straightforward construction of REST endpoints, JWT authorization gates, file upload parsing (via Multer, in memory), and request logging (via Morgan).
* **Why Zod**: Type-safe runtime schema parsing. Validates client payloads at the controller gate and cleanly catches formatting errors before database queries.

### 3. Frontend Client UI: React (Vite) & Vanilla CSS
* **Why React**: Component-driven architecture splits navigation headers, minimised sidebars, gauges, activity monitors, and inventory tables into clean, maintainable, reactive modules.
* **Why Vite**: Standard hot module reloading (HMR) speeds up development cycles and packages asset modules quickly.
* **Why Vanilla CSS**: Allows for the implementation of a bespoke dark-neon corporate style system (variables, custom scrollbars, transitions, and glow shadows) from scratch without framework overhead.

### 4. Deployment: Render, Vercel and a hosted Postgres
* **Why no Docker**: the owner chose a plain Node runtime. The API runs on Render (`render.yaml`), the frontend on Vercel (`frontend/vercel.json` rewrites `/api/*` to the API), and the database is Neon or Supabase. The project uses npm workspaces with one root lockfile.
* **Why PDFs are in Postgres**: Render's free disk is wiped on restart. Storing the bytes in `document_files` keeps documents and files consistent and means nothing depends on the host's disk.

---

## 3. End-to-End Architectural Flows

### Flow A: Document Upload and Validation
1. Client sends multipart form-data (`POST /api/documents`) with the JWT and a PDF.
2. `protect` validates the JWT (HS256 only); Multer reads the file into memory (5 MB limit, `application/pdf` only); `verifyPdf` checks the `%PDF` magic bytes.
3. The controller parses metadata with Zod and checks the dates (`issueDate <= today`, `expiryDate > issueDate`, "today" in `APP_TIMEZONE`).
4. On failure it returns `400` JSON (nothing was written, so there is nothing to clean up). On success one `prisma.document.create` writes the document and its `document_files` row together.
5. Returns `201` with the document (`hasFile`, `file.fileName`, `file.size`; never the bytes).

### Flow B: Expiry Reminders
1. The scan runs daily at 00:00 (`APP_TIMEZONE`), about 15 seconds after every boot (hosts that sleep can miss midnight), on `POST /api/services/cron/trigger` (admin) and on `POST /api/services/cron/run` (external scheduler with `x-cron-secret`).
2. It selects documents expiring within 30 days or already expired and picks the most urgent threshold crossed: 30, 15, 7 or 0.
3. It claims the warning by inserting a `notifications` row keyed on (document, expiry date, threshold). A duplicate key means it was already sent and is skipped.
4. It sends the email through the configured SMTP server. In production a missing or unreachable SMTP server fails the scan; the console mock is only used outside production when `SMTP_HOST` is unset.
5. If a send fails, the claim is released so the next scan retries, the document is recorded in `failed`, and the scan continues with the remaining documents. The manual routes answer `502` when anything failed, and `/api/health` reports the last scan status.

### Flow C: JWT-Protected File Download
1. Client fetches `GET /api/documents/:id/file` with `Authorization: Bearer <token>`.
2. The backend validates the token and the id (a malformed id is a 404), loads the `document_files` row and sends the bytes with `Content-Length`.
3. The client turns the response into a blob URL and triggers the download, revoking the URL afterwards.

---

## 4. Phase-by-Phase Development History

* **Phase 0 (Scaffold & Conn)**: Monorepo folder setup, PostgreSQL DB, Prisma schemas, health check endpoints.
* **Phase 1 (Vertical Upload)**: JWT auth endpoints, Admin seeds, Multer PDF parsing, Zod validators, computed status helpers, React pages.
* **Phase 2 (CRUD Details)**: Document metadata updates, cascading notification removals, cascade deletion of the stored PDF, secure window downloads.
* **Phase 3 (Dashboard Grids)**: Express stats aggregations, paginated search routes, dashboard category bar distributions, React search pagination bars.
* **Phase 4 (Expiry Reminders)**: Daily midnight Alert Scheduler, DB deduplication matching, nodemailer with a development-only console mock, manual API trigger routes.
* **Phase 5 (Swagger & Docs)**: OpenAPI JSON documenting, CDNs Swagger layout, Swagger custom dark-stylesheet integration, realistic data seeding.
* **Phase 6 (Bespoke Redesign)**: Deep dark CSS variables system, minimalist sidebar, brand header menu tabs, custom SVG gauge arcs, terminal-style logs activity timelines, overlay creation drawers.
* **Phase 7 (Portable setup, later replaced)**: Docker-based orchestration. Removed in Nov 2026 in favor of npm workspaces and a Node runtime.
* **Phase 9 (Audit trail and soft delete, Nov 2026)**: trash with restore and a retention window, append-only `audit_logs` written transactionally (with a database trigger that blocks tampering), an Audit Log page and per-document history.
* **Phase 8 (Remediation, Nov 2026)**: security and reliability audit; PDFs in Postgres, loud SMTP failures, shared Prisma client, JSON error handling, input validation, react-router, real dashboard feed, complete OpenAPI spec with a route-coverage test, CI. See `docs/MASTER_PLAN.md`.

---

## 5. Running It

See `README.md` for setup, environment variables and deployment, and `docs/HANDOFF.md` for operations (rotating secrets, recovering from a failed scan, restoring files).

```bash
npm install
cp backend/.env.example backend/.env      # DATABASE_URL, JWT_SECRET (32+ chars)
cd backend && npx prisma migrate deploy && cd ..
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='12+ characters' npm run db:create-admin --workspace=backend
npm run dev                               # frontend :3000, API :5000, docs :5000/api-docs
```
