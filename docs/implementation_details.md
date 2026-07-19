# Compliance Document Tracker - Implementation History

This document records the exact details, files, dependencies, and validation steps for each phase of building the Compliance Document Tracker MVP.

---

## Phase 0: Scaffold & Connect

Completed on July 19, 2026.

### 1. Folder Structure
Established a monorepo setup dividing the API layer from the React SPA client:
* **`/backend`**: Express app, seed files, and Prisma schema.
* **`/frontend`**: React client bootstrapper with Vite.
* **`/docs`**: Local project development documentation.

### 2. Workspace & Root Scaffolding
* **`.gitignore`**: Excludes system temporary items, node packages, local secret files, and document assets:
  * `node_modules/`, `dist/`, `uploads/`, `*.log`, `.env`, `.vscode/`, `.idea/`, `.DS_Store`.
* **`package.json`**: Root workspace scheduler containing concurrency wrappers:
  * `"dev": "concurrently \"pnpm dev:backend\" \"pnpm dev:frontend\""`
  * `"prisma:migrate": "pnpm --filter backend db:migrate"`
  * `"db:seed": "pnpm --filter backend db:seed"`
* **`pnpm-workspace.yaml`**: Coordinates dependency version matching and local links via PNPM Workspaces:
  ```yaml
  packages:
    - 'backend'
    - 'frontend'
  ```
* **`docker-compose.yml`**: Formulates a persistent local PostgreSQL 15 environment:
  * **Database Name**: `compliance_tracker`
  * **Username**: `postgres`
  * **Password**: `postgrespassword`
  * **Container Name**: `compliance-db`
  * **External Port**: `5432`
  * **Volume**: `postgres_data` mapping to `/var/lib/postgresql/data`.

### 3. Backend Implementation Details (`/backend`)
* **`backend/package.json`**:
  * **Production Dependencies**: `@prisma/client`, `bcryptjs`, `cors`, `dotenv`, `express`, `jsonwebtoken`, `morgan`, `multer`, `node-cron`, `nodemailer`, `zod`.
  * **Development Dependencies**: `prisma`, `nodemon`.
  * **Execution Scripts**:
    * `"start"`: Runs `node src/app.js`.
    * `"dev"`: Runs `nodemon src/app.js` for auto-reloading.
    * `"db:migrate"`: Runs `prisma migrate dev` for model updates.
    * `"db:seed"`: Runs `node prisma/seed.js`.
    * `"prisma:generate"`: Runs `prisma generate`.
* **`backend/.env.example` & `backend/.env`**: Exposes local config details:
  * Port: `5000`
  * database connection string: `postgresql://postgres:postgrespassword@localhost:5432/compliance_tracker?schema=public`
  * Defaults for JWT token signer, SMTP servers, and local mailing usernames.
* **`backend/prisma/schema.prisma`**: Defined core relational structures mapping DB tables:
  * **`Admin` (`admin` table)**: Model containing UUID primary key, unique email string, mapped string `password_hash`, and datetime `created_at`.
  * **`Document` (`documents` table)**: Model containing UUID primary key, string title, enum `category` (`license`, `certificate`, `insurance`, `contract`, `permit`, `tax_document`), db dates `issue_date` and `expiry_date`, notification target `notify_email`, file attachment local path `file_path`, optional description text, and update logs.
  * **`Notification` (`notifications` table)**: Records sent warnings containing id, document ID backlink, threshold integer `days_before`, and sent time.
  * **Constraints**: Applied Cascade delete behavior on `Document` removal. Added composite unique constraint `@@unique([documentId, daysBefore])` to prevent duplicate warning dispatches.
* **`backend/src/app.js`**: Express boilerplate parsing incoming payloads (`express.json()`), CORS middleware, development request loggers (`morgan`), and a `/api/health` diagnostics check endpoint verifying postgres availability by running `prisma.$queryRaw` queries.

### 4. Frontend Implementation Details (`/frontend`)
* **`frontend/package.json`**: React 18, React DOM, and Vite compilation bundles.
* **`frontend/vite.config.js`**: Proxies `/api` network requests directly to post `5000` on localhost:
  ```javascript
  server: {
    port: 3000,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
  }
  ```
* **`frontend/index.html`**: Formulates basic frame and styles.
* **`frontend/src/main.jsx`**: Handles client React mounting.
* **`frontend/src/App.jsx`**: Uses React `useEffect` callback mapping fetch requests.
* **`frontend/src/index.css`**: Configures global variables for a modern HSL-tailored slate dark palette.

### 5. Verification & Health Audit
* Installed dependencies across packages via `pnpm install` in 59.1s.
* Triggered PostgreSQL container build and run via Docker Compose, which finished successfully.
* Ran Prisma DB sync migration: `pnpm --filter backend db:migrate --name init`, creating SQL schema tables and outputting native client libraries.
* Launched development runtime via `pnpm dev` in a background terminal.
* Ran local CLI test checks returning successful web calls to `/api/health` with `status: ok` and `database: connected` outputs.

---

## Phase 1: Vertical Slice, Upload & Validation

Completed on July 19, 2026.

### 1. Database Seeding (`/backend/prisma/seed.js`)
* **Seeded Admin User**: Built an idempotent seed runner checking for existence of administrative credentials. Uses `bcryptjs` to encrypt password `adminpassword` with 10 salt rounds and saves record `admin@compliance.com` into database.
* **Execution**: Activated script via `pnpm --filter backend db:seed`, logging successful insertion: `Admin account seeded successfully: admin@compliance.com`.

### 2. Authorization Layer (`/backend/src/middleware/authMiddleware.js`)
* **JWT Middlewares**: Protects incoming requests by parsing HTTP headers for format `Authorization: Bearer <token>`. Checks validity against `process.env.JWT_SECRET` and binds the admin model identifiers to incoming metadata (`req.adminId`). Rejects invalid claims with `401 Unauthorized` responses.

### 3. Login API Endpoint (`/backend/src/controllers/authController.js` and `/backend/src/routes/authRoutes.js`)
* **Controller**: Accepts JSON `{ email, password }` via `POST /api/auth/login`. Matches email in database, compares hashes via `bcrypt.compare`, and signs credentials returning a JWT token with `7d` expiry.
* **Routing**: Mounted auth routes under Express router configurations and bound route to `app.js` entry point.

### 4. Zod Request Validators (`/backend/src/validators/documentValidator.js`)
* Schema verification using `zod` to inspect:
  * `title`: string constraint between 3 and 150 characters.
  * `category`: enum strict values matching `license`, `certificate`, `insurance`, `contract`, `permit`, `tax_document`.
  * `notifyEmail`: standard parsed email formats.
  * `description`: optional strings.
  * Date fields: transformed and verified strings.

### 5. Document Creation & Listing APIs (`/backend/src/controllers/documentController.js` and `/backend/src/routes/documentRoutes.js`)
* **File Upload Config**: Configured `multer` engine inside `/backend/src/middleware/uploadMiddleware.js` targeting local directory `backend/uploads`. Enforces PDF only rules and 5MB size limit constraints.
* **Document Controller**:
  * `createDocument`: Extracts pdf files and metadata fields. Executes Zod schemas check. Validates two date-logic rules: `issueDate <= today` and `expiryDate > issueDate`. If checks fail, cleans and unlinks local PDF files from disk, then aborts with structured JSON error details. If checks succeed, creates table row in PostgreSQL and returns computed status parameters.
  * `getDocuments`: Retrieves all records sorted by creation. Automatically runs the computed status helper function `computeStatus` at run time, mapping days left based on current system clock rules:
    ```
    daysRemaining = expiryDate - currentSystemDate
    if daysRemaining < 0        → 'expired'
    elif daysRemaining <= 30    → 'expiring_soon'
    else                        → 'active'
    ```
* **Routing & Middleware Mounting**: Binds routing to Express app under `app.use('/api/documents', documentRoutes)`, protecting both operations via JWT token middle layers.

### 6. Frontend Authentication Client (`/frontend/src/context/AuthContext.jsx`)
* Exposes `AuthProvider` and `useAuth` hook tracking JWT state and storing headers inside local storage:
  * `login(email, password)`: requests `/api/auth/login` and commits credentials.
  * `logout()`: clears local storage and wipes token states.
  * `authFetch(url, options)`: custom wrapper adding `Authorization` bearer token to requests. Intercepts `401` states to trigger automatic signouts.

### 7. Frontend User Views & Pages
* **`frontend/src/pages/Login.jsx`**: Formulates credential entry input sheets, loading states, and error alerts.
* **`frontend/src/pages/Documents.jsx`**:
  * **Document Creation**: Multi-part forms mapping title, category selects, dates, reminder email, description, and file choosing inputs. Intercepts validation messages from Express to highlight errors.
  * **Document table list**: Interrogates GET `/api/documents` mapping results (Title, Category, Expiry dates, Days remaining, and Status badges).
  * **Status Badges**: Styled with custom CSS indicators (Green active, Amber expiring, Red expired).
* **`frontend/src/components/Sidebar.jsx`**: Exposes profile identity labels and logout pathways.
* **`frontend/src/App.jsx`**: Integrates `AuthProvider` session checks. Redirects unregistered calls to `<Login />` and mapped queries to dashboard panels.
* **`frontend/src/index.css`**: Complete responsive layout styling.

### 8. Verification Checks
* Performed PowerShell connection checks logging into `/api/auth/login` and pulling `/api/documents` payload matching:
  * **POST /api/auth/login**: `200 ok` returning auth token.
  * **GET /api/documents**: `200 ok` returning empty array `[]` (since table data is vacant).

---

## Phase 2: CRUD & Downloads

Completed on July 19, 2026.

### 1. Document Detail Validation (`/backend/src/validators/documentValidator.js`)
* **`updateDocumentSchema`**: Model validator using Zod. Declares optional properties (`title`, `category`, `issueDate`, `expiryDate`, `notifyEmail`, `description`). Uses `.refine` constraints in controller to prevent illogical updates.

### 2. CRUD and Download Controller Layer (`/backend/src/controllers/documentController.js`)
* **`getDocumentById`**: Resolves `GET /api/documents/:id`. Fetches records by primary key UUID and runs `computeStatus` at read time to structure status labels before rendering.
* **`updateDocument`**: Resolves `PUT /api/documents/:id`. Assesses permissions and retrieves current database record. Runs Zod filters. Validates date-logic rules: `issueDate <= today` and `expiryDate > issueDate` across old data and new inputs. If new PDF file is uploaded, deletes the replaced PDF file from disk, commits updates, and sends back the updated document.
* **`deleteDocument`**: Resolves `DELETE /api/documents/:id`. Deletes database records where ID matches (triggering cascade deletes on related `Notification` rows mapped to unique indices). Unlinks physical PDF assets from host server uploads folder.
* **`downloadDocumentFile`**: Resolves `GET /api/documents/:id/file`. Locates PDF records and streams binary chunks back via Express read stream pipelines. Configures headers: `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="..."`.

### 3. CRUD Frontend Modal sheets (`/frontend/src/pages/Documents.jsx`)
* **Details Modal**: Triggered by clicking document titles in table rows. Exhibits issue/expiry dates, notification emails, and notes. Link triggers client file downloads.
* **Edit Modal**: Refills existing document records, handling validation errors, and providing a file chooser field to replace the current attachment.
* **Delete Confirmation Overlay**: Standard warning shield prompting users to verify document elimination tasks.
* **JWT-Bound Blob Downloads**: Built file retrieval mechanism to download attachments via protected API calls. Requests files as `Blob` types, constructs temporary object URLs, and triggers click download actions on client browsers.

### 4. Style enhancements (`/frontend/src/index.css`)
* Incorporated `.modal-backdrop`, `.modal-content` (including keyframe transition animations `fadeIn` and `slideUp`), `.td-actions` alignments, and custom table action controls. Fixed standard `background-clip: text` compatibility warnings.

### 5. Automated verification (`/test_crud.js`)
* Built functional test suite executing an end-to-end CRUD loop:
  1. Login admin: Success (200).
  2. Create Document with PDF upload: Success (201). Mapped 26 days left (expiring_soon).
  3. Get Documents List: Success (200, length 1).
  4. Fetch Single Document: Success (200).
  5. Update Document metadata: Success (200).
  6. Download PDF stream: Success (200, Content-Type: application/pdf).
  7. Delete Document: Success (200). Mapped cascade database drop and local system disk unlinks.
* Verified that servers hot-reloaded and executed tasks cleanly. Files cleaned up.

---

## Phase 3: Dashboard & Search/Filter/Pagination

Completed on July 19, 2026.

### 1. Dashboard Aggregations (`/backend/src/controllers/dashboardController.js` & `/backend/src/routes/dashboardRoutes.js`)
* **`getDashboardStats`**: Computes totals, expired count (where `expiryDate < today`), expiring in 30 days (where `expiryDate >= today && expiryDate <= today+30`), and expiring in 7 days (where `expiryDate >= today && expiryDate <= today+7`). Groups in-memory by category, setting zeros for empty slots in response payload counts.
* **`dashboardRoutes`**: Maps `GET /` of database statistics to `getDashboardStats`, protected under `authMiddleware`.
* Mounted dashboard endpoints in `/backend/src/app.js` under `/api/dashboard`.

### 2. Search, Status Expiry Filters, and Paging (`/backend/src/controllers/documentController.js`)
* Upgraded `getDocuments` to parse queries (`search`, `category`, `status`, `page`, `limit`).
* Constructed database logic: searches title or description with case-insensitive `contains` mapping. Expiry status filters map to date range parameters before executing query to optimize indexing.
* Counts matches and skip-paginates documents with an order by `createdAt: 'desc'`. Returns `{ items, totalItems, totalPages, page, limit }` payload.

### 3. Executive Dashboard View (`/frontend/src/pages/Dashboard.jsx`)
* Renders 4 metrics panels for total, expired, expiring 30 days, expiring 7 days with themed glow highlights:
  * Expired: Red warning frame.
  * Expiring 30 Days: Amber grid glow.
  * Expiring 7 Days: Info blue layout.
* Lists all categories showing their exact document distribution card bars representing percentage portions relative to total documents.

### 4. Client Search Forms and Paginators (`/frontend/src/pages/Documents.jsx`)
* Added text query bar, category dropdown selector, and status enum filters. Includes a "Clear" button to wipe filters.
* Implemented Prev/Next buttons under the items table which update `currentPage` and load matching data pages. Limit size is set to 5 elements.

### 5. Sidebar and Navigation Routing (`/frontend/src/components/Sidebar.jsx` & `/frontend/src/App.jsx`)
* Enhanced `Sidebar` navigation menu adding a "Dashboard" selector button.
* Hooked up main layout page rendering to conditionally swap view components (`Dashboard` or `Documents`) matching sidebar state.

### 6. Automated Pipeline Verification (`/test_dashboard.js`)
* Run verification workflow:
  1. Validate initial dashboard stats (zeros).
  2. Create Doc A (Permit expired 5 days ago), Doc B (Insurance expiring in 15 days), Doc C (Certificate active for 45 days).
  3. Validate aggregated stats: Total 3, Expired 1, Expiring (30d) 1, Expiring (7d) 0. Categories counts: permit=1, insurance=1, certificate=1.
  4. Search filter match "Active" -> Doc C returned.
  5. Status filter "expired" -> Doc A returned.
  6. Paged fetch limit 2 -> Page 1 returns length 2, Page 2 returns length 1.
  7. Delete all 3 documents. Database unlinks files and clears records.
* Execution completed with 100% success. Verified.

---

## Phase 4: Cron & Email Reminders

Completed on July 19, 2026.

### 1. Alert Scheduler Daemon (`/backend/src/services/cronService.js`)
* **`checkExpiries`**: Runs daily at midnight (`0 0 * * *`) via `node-cron` to scan for compliance document expiries.
* Configured alert logic matching target expirations exactly 30 days or exactly 7 days from today.
* **Notification Deduplication**: Uses the `notifications` database table to record notifications sent for a given `documentId` and `daysBefore` pair. Future runs skip documents that already have matching alert logs.
* **SMTP Transport Fallbacks**: If `SMTP_HOST` environment variables are populated, validates the connection using `verify()`. If variables are missing or connection fails, the mail service falls back to a clean terminal-formatted console mock transporter. This guarantees that SMTP server errors or offline conditions do not interrupt system performance.

### 2. Manual Scan Endpoint (`/backend/src/routes/cronRoutes.js`)
* Exposed a protected admin trigger: `POST /api/services/cron/trigger` (restricted to JWT sessions).
* Calls internal check service and returns detailed json reporting matching targets found, emails successfully sent, and duplicates skipped.

### 3. Automated Cron Verification (`/test_cron.js`)
* Automated workflow checks:
  1. Create Doc X (expires in 30 days) and Doc Y (expires in 7 days).
  2. Perform first manual trigger endpoint request → returns `success: true`, status 200, sends 2 reminders, and logs entries in database.
  3. Perform second request → returns `success: true`, status 200, sends 0 emails, and skips 2 duplicates (Doc X and Doc Y).
  4. Delete target documents → database removes records and unlinks local attachments.
* Cron scan verified.

---

## Phase 5: Swagger, Docker Setup & Readme

Completed on July 19, 2026.

### 1. Interactive Swagger OpenAPI Engine (`/backend/src/routes/swaggerRoutes.js` & `/backend/src/docs/openapi.json`)
* Documented every API endpoint (login authentication, search/paginate listings, files download attachment, dashboard, cron manual triggers).
* Mapped Swagger UI HTML bundles via CDN. Inverted CSS values dynamically to achieve a professional dark mode style matching the client's dark UI themes. Exposed at `/api-docs` endpoint.

### 2. Multi-Service Containerizations (`/backend/Dockerfile` & `/docker-compose.yml`)
* **`backend/Dockerfile`**: Configured Node 20 environment, staging production lock dependency layers, running `prisma generate`, and mapping Express services at port `5000`.
* **`docker-compose.yml`**: Bound backend service context dependencies with postgres database. Mounts postgres database engines and resolves connection URLs automatically.

### 3. Realistic Compliance Seeding Dataset (`/backend/prisma/seed.js`)
* Populated the database with 10 documents spanning active, expiring-soon, and expired states.
* Automatically creates individual physical PDF files on local storage to Stage realistic download attachments, making E2E exploration operational without initial manual configurations.

### 4. Setup README Documentation (`/README.md`)
* Added detailed project overview, folder architecture map, local/docker build guides, and API route index maps. Successful.

---

## Phase 6: Custom UI Redesign & Brand Integration

Completed on July 19, 2026.

### 1. Variables & Global Design Customizations (`/frontend/src/index.css`)
* **Dark Theme Variables**: Re-architected custom palette representing cybersecurity themes (`--bg-primary: #040810`, `--bg-secondary: #090f18`, `--bg-tertiary: #101726`).
* **Design Accents**: Configured strict monospaced statistics/labels using `JetBrains Mono` and default text labels using `Inter`. Custom border glow gradients (`rgba(255, 255, 255, 0.08)`) and border-left status indicators.

### 2. Top-Level Headers Wrapper (`/frontend/src/App.jsx`)
* **Branding Header**: Top menu persistent banner displaying brand title **DocShield**, user credentials icon profiles, and notification utilities.
* **Global Navigation Modals**: Configured live tabs switches routing between Overview and Inventory. Add secondary mocked global search console (`⌘K`).

### 3. Left Hand Sidebar Panel Navigation (`/frontend/src/components/Sidebar.jsx`)
* **Sidebar Layout**: Replaced wider list sidebar with a thin, 72px wide minimalist Left Icon Bar.
* **Menu Routing**: Mapped active/inactive indicators for dashboard and documents. Added mock icon buttons labeled (Frameworks, System Alerts, and Performance Logs) locked under tooltip shields.

### 4. System Aggregations Dashboard Metrics (`/frontend/src/pages/Dashboard.jsx`)
* **SVG Gauges**: Designed an dynamic SVG compliance gauge calculating radius coordinates to render dial arcs mapped to active vs. expired stats.
* **Live Shell Logs Feed**: Seeding simulated activity log feed lists reflecting database ping operations, expiration updates, and cron tasks.
* **Urgency Queues**: Displays the nearest expiring documents first with appropriate color codes.

### 5. Full Width Registry (`/frontend/src/pages/Documents.jsx`)
* **Modal Forms**: Transitioned inline document creation boxes into popup modal backdrop sliders.
* **Grid Layouts**: Full-size dataset tables mapping monospaced short-uuid codes, vertical status pipes (`| VERIFIED`, `| PENDING_REVIEW`), and email domain custodians.

---

## Phase 7: Containerized Developer Orchestration

Completed on July 19, 2026.

### 1. Frontend Dockerization Configs (`/frontend/Dockerfile`)
* **Base node layers**: Leveraged `node:20-slim` images. Sets up local folders and installs dependencies.
* **Port Bindings**: Configures developer runs listening on port `3000` bound to network interface `0.0.0.0`.

### 2. Dynamic Endpoint Fallbacks (`/frontend/vite.config.js`)
* **Vite Proxies**: Integrates environment check mapping target proxy to `http://backend:5000` when running under docker (`DOCKER_ENV=true`) and fallback to hostname `http://localhost:5000` for standard host platforms.

### 3. Dev Suite Composition Orchestrator (`/docker-compose.yml`)
* **Build Directives**: Configured build configurations for both backend services and frontend nodes. Allows teammates to fetch code and trigger compilations using standard instructions out-of-the-box.

### 4. Git Remote Commits
* Saved all changes, staged untracked modules, and executed push actions to remote branch `main`. Runs successfully.





