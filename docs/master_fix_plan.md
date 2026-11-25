# Master Fix Plan — Compliance Document Tracker

Written 2026-11-23. Covers every known issue from the audit against `PRD-Compliance-Document-Tracker.md`.
Issue numbers (#1–#18, D1–D9) match the audit. Each item gives the root cause, the fix, the files touched, and how to prove it's fixed.

Phases are ordered by dependency: nothing can be tested until Phase 0 is done, and later phases rely on the error handling and validation from Phase 1.

| Phase | Theme | Issues | Size |
|---|---|---|---|
| 0 | Get it running again | #1 | S |
| 1 | API hardening (errors + input validation) | #2, #12, #13, Login JSON parse | M |
| 2 | Reminder engine correctness | #3, #4, D9 | S |
| 3 | Inventory page bugs | #5, #9, #10, #11, date display | S |
| 4 | Truthful dashboard + dead UI | #6, #7, #8, D1–D8 | M |
| 5 | Data, deployment, security | #15, #16, #18 | M |
| 6 | Docs + regression tests | #14, #17, test suite | M |

---

## Decisions needed before starting (recommended default in **bold**)

1. **Package manager:** **npm** (dev.js already uses it) vs pnpm. The other one's lockfile/workspace file gets deleted.
2. **Reminder thresholds:** **30 / 15 / 7 / 0** (PRD plus the expired alert added in the last commit) vs strict PRD 30 / 15 / 7.
3. **File storage in production:** **real S3/Supabase adapter** vs a paid Render persistent disk. Local disk can't work on Render's free tier.
4. **Dead UI:** **remove what the PRD doesn't need** (search mock, checkboxes, help button) and wire up the rest (bell → Warnings, avatar → sign-out menu, sort → real sort).
5. **Routing:** **add `react-router-dom`** so pages have URLs.

---

## Phase 0 — Get it running again

### #1 Backend dependencies point to a deleted folder
- **Cause:** pnpm links in `backend/node_modules` point to `Desktop/Compliance_document_tracker/node_modules/.pnpm/...`, the folder from before the move. npm and pnpm files are now mixed.
- **Fix:**
  1. Delete `node_modules/`, `backend/node_modules/`, `frontend/node_modules/`.
  2. Delete `pnpm-lock.yaml` and `pnpm-workspace.yaml` (npm workspaces are already set in root `package.json`). Delete `backend/package-lock.json` and `frontend/package-lock.json` so a single root lockfile is used.
  3. Run `npm install` at the root, then `npm run prisma:generate`.
  4. Remove the unused `concurrently` dev dependency, or switch `dev` back to using it and delete `dev.js`.
  5. Keep OneDrive from syncing `node_modules`: mark it "Free up space"/exclude it, or move the repo out of OneDrive. Cloud sync on `node_modules` causes file locks and broken links.
- **Files:** root `package.json`, lockfiles, `dev.js`.
- **Done when:** `npm run dev` starts both servers, `GET /api/health` returns `database: connected`, and `npm test` passes.

**Status (2026-11-23):** steps 1–4 done. Clean npm install, one root `package-lock.json`, `concurrently` removed, root `npm test` script added. The backend boots, `/api-docs` serves, 10/10 tests pass, and the frontend builds. Still open:
- **Outside the repo:** `C:\Users\ASUS\node_modules\.bin\node{,.cmd,.ps1}` are leftover links to a `node` package that's no longer installed. npm puts every parent folder's `node_modules/.bin` on the PATH while running scripts, so every `npm run …` that calls `node` fails until these 3 files are deleted.
- **No database running locally:** start Docker Desktop and run `docker compose up -d postgres`, then `npm run prisma:migrate` and `npm run db:seed`.
- **Docker builds have no lockfile:** each Dockerfile builds from its own workspace folder, so it can't see the root lockfile. Phase 5: build from the repo root with `npm ci --workspace=…`.
- **`npm audit`:** nodemailer and zod (high) and uuid (moderate) need major version upgrades. Handle these in Phase 6 with the test suite in place.

---

## Phase 1 — API hardening

### #2 Errors come back as HTML instead of JSON
- **Cause:** `backend/src/app.js` has no 404 handler or error-handling middleware, so Multer, `express.json()` and route errors fall through to Express's default HTML page.
- **Fix:** add `backend/src/middleware/errorHandler.js` and register it after all routes, before `app.listen`:
  - `notFound` → `404 { error: 'Route not found' }`
  - `MulterError` `LIMIT_FILE_SIZE` → `400 { error: 'Validation failed', details: { file: ['File must be 5MB or smaller'] } }`
  - fileFilter error (PDF only) → `400`, same shape
  - `SyntaxError` from `express.json()` (`err.type === 'entity.parse.failed'`) → `400 { error: 'Malformed JSON body' }`
  - Prisma `P2025` → `404`; `P2002` → `409`; `P2023` / invalid UUID → `400`
  - default → `500 { error: 'Internal server error' }`; include `details` only when `NODE_ENV !== 'production'`
  - If `req.file` exists, always delete the uploaded file.
- Also stop sending raw `error.message` as `details` from controllers in production, because it leaks internal details.
- **Files:** `app.js`, new `middleware/errorHandler.js`, the controllers (switch to `next(err)`).
- **Done when:** a `.txt` upload, a 6 MB PDF, a malformed JSON body and `GET /api/nope` all return JSON with the right status.

### #12 Bad inputs crash with a 500
- **Cause:** query and path parameters go straight to Prisma unchecked.
- **Fix:**
  - Add `listDocumentsQuerySchema` (Zod) in `validators/documentValidator.js`:
    `page` int ≥ 1 (default 1), `limit` int 1–100 (default 10), `category` enum optional, `status` enum optional, `search` string ≤ 100 optional, `sort` whitelist optional (see D5). Invalid input → `400`.
  - Add a `validateUuidParam('id')` middleware on every `/:id` route → `404 Document not found` for a malformed id, so a malformed id looks the same as a missing one.
- **Files:** `validators/documentValidator.js`, new `middleware/validateParams.js`, `routes/documentRoutes.js`, `controllers/documentController.js`.
- **Done when:** `/api/documents/abc`, `?category=foo`, `?page=x`, `?limit=0` all return 4xx JSON, never 500.

### #13 Framework linking accepts anything and allows duplicates
- **Cause:** no check against `STATIC_CONTROLS`, and no unique constraint, so the separate find-then-create steps can race.
- **Fix:**
  - Zod-validate `{ framework, controlCode, documentId? (uuid | null) }`. Reject combinations not in `STATIC_CONTROLS` with `400`.
  - Migration: remove existing duplicates (keep the newest `linked_at`), then add `@@unique([framework, controlCode])`.
  - Replace find + create/update with one `prisma.frameworkControl.upsert`.
  - Optional: move `STATIC_CONTROLS` into a seeded table so the controller stops merging in hard-coded data.
- **Files:** `schema.prisma`, new migration, `controllers/frameworkController.js`.
- **Done when:** a fake control returns 400, and 10 parallel link requests leave exactly one row.

### Login page crashes on non-JSON responses
- **Cause:** `AuthContext.login` and every page call `response.json()` without checking the response type, so a proxy 502/504 HTML page causes "Unexpected token '<'".
- **Fix:** add a `readJson(res)` helper in `AuthContext.jsx` that checks `content-type` and falls back to `{ error: 'Server unavailable (HTTP 502)' }`. Use it everywhere.

---

## Phase 2 — Reminder engine correctness

### #3 Emails marked as sent when they never went out
- **Cause:** `getTransporter()` in `services/cronService.js` (lines 23-24) catches a failed SMTP check and returns the console mock. The mock always "succeeds", so the notification row is kept.
- **Fix:**
  - If `SMTP_HOST` is set and the check fails, **throw**. `checkExpiries` then returns `{ success: false, error }`, sends nothing and saves no rows.
  - Use the console mock only when `SMTP_HOST` is not set at all, and log `MAIL MODE: console` once at startup.
  - Add `secure: port === 465` and a connection timeout.
  - Optional: add a `channel` column (`smtp` | `console`) to `notifications` so the Warnings page shows how each alert was delivered.
- **Done when:** with a wrong `SMTP_PASS`, a scan reports failure and the `notifications` table is unchanged. With the right password, the email arrives and one row is saved.

### #4 No 15-day reminder
- **Cause:** `services/expiryRules.js:7` has `THRESHOLDS = [30, 7, 0]`.
- **Fix:** `THRESHOLDS = [30, 15, 7, 0]` (decision 2). Update `pickThreshold` tests (20 → 30, 15 → 15, 10 → 15, 5 → 7), the Warnings page empty-state text, and the README.
- **Done when:** a document 12 days from expiry gets a 15-day warning, plus the updated `npm test` passes.

### D9 Scan reports success even when emails fail
- **Cause:** `routes/cronRoutes.js` always returns 200, and `Warnings.jsx:37` only checks `res.ok`.
- **Fix:** return `207` (or `500`) with the results when `failed.length > 0`. The frontend reads `results.success` and shows "Sent X, skipped Y, failed Z".

---

## Phase 3 — Inventory page bugs (`frontend/src/pages/Documents.jsx`)

| # | Cause | Fix |
|---|---|---|
| #5 Download alert | `a.removeChild(a)` at line 247 throws | `document.body.removeChild(a)`. Move `URL.revokeObjectURL` into `finally`. Use the filename from the `Content-Disposition` header. |
| #9 Reset doesn't refresh | the search text isn't one of the fetch triggers | Split `searchInput` (the text box) from `appliedSearch` (submitted). Submit sets `appliedSearch` and page 1. Add `appliedSearch` to the effect's triggers and remove the direct `fetchDocuments()` call in `handleSearchSubmit` (this also fixes the double fetch). |
| Stale responses | two requests in flight; whichever finishes last wins | Use an `AbortController` in the effect and cancel the previous request. |
| #10 Error never clears | `setFetchError` is only ever set, never reset | `setFetchError(null)` at the start of `fetchDocuments`. |
| #11 Empty page after delete | page number is never adjusted to the new total | After loading, if `totalItems > 0 && currentPage > totalPages`, set `currentPage(totalPages)`. Show pagination whenever `totalPages > 1`, even if the current page is empty. |
| Date display | `new Date(date).toLocaleDateString()` shifts a day in time zones west of UTC | Format with `{ timeZone: 'UTC' }`, or show the `YYYY-MM-DD` part directly. Put this in a `formatDate` helper used on every page. |
| Edit errors | `alert()` for server errors | Show them inline like the create form does (`editSubmitError`). |

---

## Phase 4 — Truthful dashboard and dead UI

### #6 Overview leaves out the 7-day and 30-day counts and counts expiring-soon as active
- **Cause:** `Dashboard.jsx` lines 58 and 121 use `total - expired`, and the `expiring7d`/`expiring30d` values the API returns are never shown.
- **Fix (backend):** in `dashboardController.js`, get the status breakdown from **one SQL query** with `COUNT(*) FILTER (WHERE …)` / `CASE` via `prisma.$queryRaw` (PRD §5.4 asks for DB-level aggregation, and this replaces 6 separate count queries). Return `active`, `expiringSoon`, `expired`, `expiring7d`, `expiring30d`, `expiring60d`, `expiring90d`. Redefine `healthRate = active / total`. Fix `monthlyUploads` to use the business time zone helper (it currently uses server-local `setHours`).
- **Fix (frontend):** add tiles for Total, Expired, Expiring ≤ 7d and Expiring ≤ 30d. "Active" and the score come from `stats.active`.
- **Done when:** with the seed data, the counts are total 10, expired 3, ≤ 7d 1, ≤ 30d 3, active 4.

### #7 "SCAN NOW" only reloads
- **Fix:** call `POST /api/services/cron/trigger`, show the sent/skipped/failed result, then reload. Put the trigger call in one shared function that the Warnings page uses too.

### #8 Fake activity feed and fixed "NOMINAL" badge
- **Fix:** build the feed from real data: the latest 5 rows of `/api/notifications` plus the 5 newest documents (`?sort=createdAt`), merged by time. The badge is worked out from the stats: `expired > 0` → **AT RISK**, `expiringSoon > 0` → **ATTENTION**, otherwise **NOMINAL**.
- **Imminent queue:** stop fetching `limit=100` and sorting in the browser. Use `?sort=expiryDate&limit=4` (needs D5).

### Dead UI pieces
| ID | Element | Fix |
|---|---|---|
| D1 | Header "Search console ⌘K" (`App.jsx:61`) | Remove, or make it a real input that opens Inventory with that search applied. |
| D2 | 🔔 bell | Link to Warnings, with a badge showing the count of documents in an alert window. |
| D3 | Avatar | Small menu showing the admin email and a Sign out button. |
| D4 | Sidebar ❓ help (`Sidebar.jsx:78`) | Remove, or link to `/api-docs`. |
| D5 | "SORT BY: LAST_MODIFIED" label | Backend: whitelisted `sort` param (`createdAt`, `updatedAt`, `expiryDate`, `title`) + `order`. Frontend: a real sort dropdown. |
| D6 | Table checkboxes | Remove (there's no bulk action in the PRD). |
| D7 | Logout shown as ⚙ gear; logo uses `justify:` | Use a sign-out icon with a label; change to `justifyContent: 'center'`. |
| D8 | No URLs, refresh goes back to Overview | Add `react-router-dom`: `/`, `/documents`, `/frameworks`, `/warnings`, `/analytics`; `/login` redirects when signed out. Put the same 5 links in the header and sidebar. Add an SPA fallback in `vite.config.js`; it's already there in `nginx.conf` and `vercel.json`. |

---

## Phase 5 — Data, deployment, security

### #15 Uploaded files disappear in Docker/Render; cron misses runs while the instance sleeps
- **Fix:**
  - Docker: add a named volume `uploads_data:/app/uploads` to the backend in both compose files.
  - Production storage (decision 3): implement `saveFile`/`deleteFile`/`openFileStream` in `utils/storage.js` for S3-compatible storage (Supabase Storage or S3) via `@aws-sdk/client-s3`. Store the object key, not a URL. Make the download endpoint stream from storage so downloads stay behind authentication (PRD §5.7).
  - Startup check: when `NODE_ENV=production` and `STORAGE_PROVIDER=local` with no persistent disk, log a loud warning.
  - Cron: also expose `POST /api/services/cron/run` protected by a `CRON_SECRET` header, and call it daily from an external scheduler (Render Cron Job, GitHub Actions or cron-job.org). Keep `node-cron` for local and Docker use. The duplicate check (claiming the notification row before sending) already makes double runs safe.

### #16 Secrets in compose files
- **Fix:** move every secret to `.env` (git-ignored) and reference it with `${VAR}` / `env_file:`. Add a root `.env.example` listing `POSTGRES_PASSWORD`, `JWT_SECRET`, `SMTP_*`, `APP_TIMEZONE`, `CRON_SECRET` and `STORAGE_*`. Remove `ports: 5432:5432` from the prod compose file. Make the backend refuse to start if `JWT_SECRET` is missing or shorter than 32 characters.
- **Rotate** the prod database password and JWT secret: the current ones are in the git history.
- **Commit checklist:** `frontend/.env.local` is untracked; confirm `.gitignore` covers `*.env.local`.

### #18 Seed dates wrong and stub PDFs won't open
- **Fix:** in `prisma/seed.js`, use `todayDateOnly()` and `addDays()` from `src/utils/dates.js`. Replace the one-line text stub with a real minimal PDF: add `prisma/fixtures/sample.pdf` (one page, about 1 KB) and copy it for each seed document.
- **Done when:** seeding at 01:00 IST gives the correct days remaining, and a downloaded seed file opens in a PDF viewer.

---

## Phase 6 — Docs and regression tests

### #14 Swagger is incomplete
- **Fix:** add `GET /api/frameworks`, `POST /api/frameworks/link`, `GET /api/notifications`, `GET /api/health`, plus the new `sort`/`order` params, the 400/404/409 error schemas, and the 15-day threshold. Add a `/api-docs` rewrite to `vercel.json`. Add a test that lists every registered Express route and fails if one is missing from `openapi.json`.

### #17 README is missing parts and out of date
- **Fix:** npm-only setup steps, an environment variable table, a Mermaid ER diagram (`admin`, `documents 1─* notifications`, `documents 1─* framework_controls`), the 30/15/7/0 reminder rule, the storage and cron deployment notes, and a short project write-up for a resume (PRD §10).

### Regression test suite
Add `supertest` integration tests (against a test database, or with Prisma mocked) covering:
- Error handler: wrong file type, oversized file, malformed JSON, unknown route → JSON 4xx.
- Query validation: bad page/limit/category/uuid → 4xx.
- Search + category + status + pagination working together (PRD §10).
- Framework link: an invalid control is rejected, and parallel requests leave one row.
- Cron: an SMTP failure saves no notification row; a second run sends no duplicate.

Add a GitHub Actions workflow that runs `npm test` and `npm run build --workspace=frontend` on every push.

---

## Definition of Done (PRD §10, re-checked after all phases)

- [ ] Admin logs in with seeded credentials and gets a JWT
- [ ] Create / edit / delete / view / download all work with no error alerts
- [ ] Status is correct on every fetch, with matching counts across Overview, Inventory and Analytics
- [ ] Dashboard shows total, expired, ≤ 7d, ≤ 30d and the category breakdown, aggregated in the database
- [ ] Search, category, status, sort and pagination work together
- [ ] Daily reminders at 30/15/7 (+expired), never duplicated, never falsely marked sent
- [ ] Every endpoint documented in Swagger (checked by a test)
- [ ] `docker-compose up` works in one command, and files survive a restart
- [ ] README has setup steps, the ER diagram and the write-up
- [ ] No secrets in the repo; CI is green
