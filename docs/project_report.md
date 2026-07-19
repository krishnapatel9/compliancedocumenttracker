# DocShield Compliance Management Suite - Full Project Report

This report outlines the design, architecture, implementation history, and end-to-end operations of the **DocShield Compliance Management Suite (MVP)** from scratch to completion.

---

## 1. Project Vision & Scope

DocShield is a premium, containerized compliance and document lifecycle management platform. The project was designed and built to help organizational administrators audit, upload, monitor, and renewal-track critical institutional safety records, insurance policies, permits, and quality checklists before legal expirations occur.

### User Stories & Journey
* **Credential Verification (System Admin)**: Authenticates securely to the administrative panel using secure cryptographic validation layers.
* **Asset Upload & Audits**: Uploads physical proof documents (PDFs) and fills registry fields (issue date, expiry date, notification email, description). The system inspects dates at write time to ensure logical order (`issueDate <= today` and `expiryDate > issueDate`).
* **Active Monitoring Dashboard**: Audits fleet metrics at a glance (total counts, expired alerts, and imminent expiration queues) colored and flagged dynamically based on real-time calendar thresholds.
* **Compliance Search & Extraction**: Performs fast filters matching doc titles/descriptions, filtering by category dropdowns, and paginates through records in increments of 5 entries to preserve memory.
* **Protected Downloads**: Downloads uploaded PDF credentials securely using token-validated streaming channels.
* **Automated Expiry Notifications**: Scans database records daily and triggers notification mailers exactly 30 days and 7 days before document expirations, using deduplication records to prevent redundant emails.

---

## 2. Technical Stack Selection (The "Why")

```mermaid
graph TD
    Client[React Client - Vite Port 3000] -->|HTTP Requests / Proxy| Backend[Express API Server - Port 5000]
    Backend -->|Prisma Client| Database[(PostgreSQL DB - Port 5432)]
    Backend -->|Cron Scan Daemon| Mailer[Email Transporter (Node-Mailer)]
```

### 1. Database Layer: PostgreSQL & Prisma ORM
* **Why PostgreSQL**: Standard, highly reliable relational ACID-compliant database. Perfect for structuring strict relationships (such as cascade unlinking of notifications and tracking unique document codes).
* **Why Prisma**: Provides type-safe schema definitions and automatic TypeScript/JavaScript client generations, saving boilerplate SQL writing. The migration system guarantees matching databases across environments.

### 2. API Backend Layer: Node.js & Express
* **Why Express**: Extremely lightweight, flexible, and robust web framework. Allows for straightforward construction of REST endpoints, JWT authorization gates, file uploads parsing (via Multer), and request logging (via Morgan).
* **Why Zod**: Type-safe runtime schema parsing. Validates client payloads at the controller gate and cleanly catches formatting errors before database queries.

### 3. Frontend Client UI: React (Vite) & Vanilla CSS
* **Why React**: Component-driven architecture splits navigation headers, minimised sidebars, gauges, activity monitors, and inventory tables into clean, maintainable, reactive modules.
* **Why Vite**: Standard hot module reloading (HMR) speeds up development cycles and packages asset modules quickly.
* **Why Vanilla CSS**: Allows for the implementation of a bespoke dark-neon corporate style system (variables, custom scrollbars, transitions, and glow shadows) from scratch without framework overhead.

### 4. Portability Layer: Docker Compose
* **Why Docker**: Decouples workspaces, isolates node version runtimes (`node:20-slim`), resolves strict workspace packages installation conflicts on host systems, and bypasses OneDrive NTFS cloud-locks by running the build context in local containers.

---

## 3. End-to-End Architectural Flows

### Flow A: Document Asset Upload and Validation
1. Client sends multipart form-data (`POST /api/documents`) including JWT token and selected PDF document.
2. Express `authMiddleware` validates JWT signature; `multerMiddleware` intercepts the stream to write PDF to `/backend/uploads`.
3. The controller parses metadata using Zod schema check.
4. Date-logic check:
   * Is `issueDate <= today` AND `expiryDate > issueDate`?
   * **If NO**: Deletes uploaded PDF file immediately from server files system and returns `400 Bad Request` with date error logs.
   * **If YES**: Commits row data to PostgreSQL database via `prisma.document.create`.
5. Returns `201 Created` with full document details.

### Flow B: Background Expiry Notifications (Cron)
1. Scheduler triggers check scan (`0 0 * * *`) every midnight.
2. Service calculates absolute target deadlines (today + 30 days, today + 7 days).
3. Database query scans for documents matching dates exactly.
4. Deduplication Verification:
   * Query `notifications` logs table to check if alert has been sent previously for `(documentId, daysBefore)`.
   * **Skip** if entry exists (prevents duplicate notification emails).
   * **Dispatch** if entry is vacant.
5. Email Service transmits alerts:
   * Calls `nodemailer` configuration.
   * On failure or offline mode, falls back to raw console logger outputs.
6. Writes alert record to database: `prisma.notification.create`.

### Flow C: JWT-Protected File Streaming
1. Client triggers download by fetching `GET /api/documents/:id/file` with `Authorization: Bearer <token>`.
2. Backend validates token and checks database record.
3. Node `fs.createReadStream` reads file from `/backend/uploads/` and pipes directly to Express HTTP response stream.
4. Client resolves response stream as `Response.blob()`, maps it to a temporary window element object URL, and triggers immediate browser download.

---

## 4. Phase-by-Phase Development History

* **Phase 0 (Scaffold & Conn)**: Monorepo folder setup, dockerized PostgreSQL DB, Prisma schemas, health check endpoints.
* **Phase 1 (Vertical Upload)**: JWT auth endpoints, Admin seeds, Multer PDF parsing, Zod validators, computed status helpers, React pages.
* **Phase 2 (CRUD Details)**: Document metadata updates, cascading notification removals, local PDF file cleanup on deletions, secure window downloads.
* **Phase 3 (Dashboard Grids)**: Express stats aggregations, paginated search routes, dashboard category bar distributions, React search pagination bars.
* **Phase 4 (Expiry Reminders)**: Daily midnight Alert Scheduler, DB deduplication matching, nodemailer console log fallbacks, manual API trigger routes.
* **Phase 5 (Swagger & Docs)**: OpenAPI JSON documenting, CDNs Swagger layout, Swagger custom dark-stylesheet integration, realistic data seeding.
* **Phase 6 (Bespoke Redesign)**: Deep dark CSS variables system, minimalist sidebar, brand header menu tabs, custom SVG gauge arcs, terminal-style logs activity timelines, overlay creation drawers.
* **Phase 7 (Orchestration Portable)**: Decoupling frontend workspace package conflicts, frontend Dockerfiles configurations, dynamic endpoint proxy fallbacks (`DOCKER_ENV`), docker-compose build context bindings.

---

## 5. Team Deployment & Runtime Guide

To check out and run the suite on any secondary team machine:

1. **Clone & Setup**:
   ```bash
   git clone https://github.com/krishnapatel9/compliancedocumenttracker.git
   cd compliancedocumenttracker
   ```
2. **Build and Boot Composer**:
   ```bash
   docker-compose up --build
   ```
   *(Docker will automatically build frontend client and backend Express containers, start postgres, wait for prisma migrations, database seeds, and run services)*
3. **Open Client App**:
   * **Frontend Web App**: [http://localhost:3000](http://localhost:3000) (Login: `admin@compliance.com` / `adminpassword`)
   * **Backend REST API**: [http://localhost:5000](http://localhost:5000)
   * **API Swagger Documentation**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
