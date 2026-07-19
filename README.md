# DocShield: Regulatory Compliance Document Tracker

DocShield is a core dashboard application designed to record, track, and monitor organization-level compliance documents (such as corporate licenses, certificates, insurance policies, permits, and tax clearances). 

The platform implements real-time warning indicators, computed expiration statuses, interactive analytics dashboards, and deduplicated email notification warnings.

---

## Technical Stack
* **Backend API Engine**: Node.js, Express, Prisma ORM, Multer (local PDF storage), Nodemailer.
* **Frontend Web App**: React (Vite), Vanilla CSS, responsive layouts.
* **Database Layer**: PostgreSQL.
* **Containerization**: Docker, Docker Compose.

---

## Project Structure
```text
compliance-document-tracker/
├── backend/
│   ├── prisma/             # Schema definitions and seeding scripts
│   ├── src/
│   │   ├── controllers/    # API logical controllers
│   │   ├── docs/           # OpenAPI JSON specifications
│   │   ├── middleware/     # Auth and file uploads filters
│   │   ├── routes/         # Endpoint router registrations
│   │   ├── services/       # node-cron scheduler alert engine
│   │   └── app.js          # Express app entry node
│   ├── uploads/            # Local PDF file storage path
│   └── Dockerfile          # Node containerization setup
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable layout UI blocks
│   │   ├── context/        # Login auth session hooks
│   │   ├── pages/          # React route views (Dashboard, Documents)
│   │   ├── App.jsx         # Component layout router
│   │   └── index.css       # Core vanilla CSS design palette
│   └── vite.config.js      # Proxy API redirects configuration
├── docs/                   # Product requirements and logs
├── docker-compose.yml      # Orchestration compose configurations
├── pnpm-workspace.yaml     # Monorepo workspaces settings
└── README.md               # User quickstart reference guide
```

---

## Port Mappings
* **Vite Frontend Dev Host:** `http://localhost:3000`
* **Express Backend Master API:** `http://localhost:5000`
* **Swagger API Specification:** `http://localhost:5000/api-docs`

---

## Seeding & Authentication Details
The database includes seeded records:
* **Admin Login Email:** `admin@compliance.com`
* **Admin Login Password:** `adminpassword`
* **Realistic Documents:** 10 registered documents spanning active, expiring-soon, and expired states are seeded automatically with PDF stubs.

---

## Installation & Startup Guide

### Method A: Docker Compose (Orchestrated)
To containerize and launch the API and database services automatically, run:
```bash
docker-compose up --build -d
```
The API server will launch at `http://localhost:5000` and the Postgres database will mount internally.

### Method B: Manual Local Startup (Running concurrently)
Ensure PostgreSQL is active. Then run:
```bash
# 1. Install dependencies across monorepo workspace packages
pnpm install

# 2. Run Database Migrations and Seeding
pnpm --filter backend run db:migrate
pnpm --filter backend run db:seed

# 3. Spin up both Dev Servers (Client & Server side) concurrently
pnpm dev
```

---

## API Endpoints List

### 1. Authentication
* `POST /api/auth/login` - Retrieve JWT authentication token.

### 2. Documents Management (Requires JWT Authentication)
* `GET /api/documents` - Fetch paginated, searchable, status-filtered document lists.
* `POST /api/documents` - Register new document with multipart file upload (PDF only, max 5MB).
* `GET /api/documents/:id` - Fetch details of single document.
* `PUT /api/documents/:id` - Update document metadata & optionally replace pdf.
* `DELETE /api/documents/:id` - Remove record and unlink file from server.
* `GET /api/documents/:id/file` - Download the attached PDF file.

### 3. Dashboard Metrics (Requires JWT Authentication)
* `GET /api/dashboard` - Retrieve aggregated document status counts & category distributions.

### 4. Background Services (Requires JWT Authentication)
* `POST /api/services/cron/trigger` - Request instant execution of the daily expiry status email notifications alerts scan.

---

## Expiry Warnings Strategy
Expiries alerts are triggered for documents at two key thresholds relative to the current local server date:
1. **Exactly 30 Days Left**
2. **Exactly 7 Days Left**

A record is inserted into the `notifications` database table to track which reminders have been triggered, preventing duplicate emails. By default, the application runs the mail queue through secure console reports unless custom `SMTP_HOST` credentials are set in `/backend/.env`.
