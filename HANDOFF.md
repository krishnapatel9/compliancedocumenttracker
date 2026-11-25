# Handoff — Compliance Document Tracker (DocShield)

Last updated: 2026-11-23. Covers everything done and decided in this working session.
Nothing from this session is committed yet.

---

## 1. Goal

The owner wants the app **live and polished for a demo** (resume/portfolio project). The spec is `PRD-Compliance-Document-Tracker.md`.
- **Live stack:** frontend on Vercel. `frontend/vercel.json` sends `/api/*` to `https://compliancedocumenttracker.onrender.com`. The backend (Express + Prisma) runs on Render, and the database is on **Neon or Supabase** (free tier that doesn't expire).
- Repo: `https://github.com/krishnapatel9/compliancedocumenttracker` (branch `main`).

## 2. Decisions the owner made (don't re-ask)

| Topic | Decision |
|---|---|
| Package manager | **npm workspaces only** (pnpm removed) |
| Docker | **Remove completely from the project.** Don't use it for anything, local DB included. |
| Local database | `embedded-postgres` npm package (`npm run db:local`). Chosen by me after "no Docker". |
| Uploaded PDFs | **Stored in Postgres** (new `document_files` table), because Render's free disk is wiped on restart |
| Live DB | Neon / Supabase |
| Emails | **Real emails** (Resend or Gmail SMTP). The owner adds SMTP credentials in Render's environment settings. Seeded documents should send to an address the owner controls (planned `DEMO_NOTIFY_EMAIL` env var), not the fake `@docshield.com` ones. |
| Reminder thresholds | Recommended **30 / 15 / 7 / 0** (PRD's 30/15/7 plus the existing expired alert). Not explicitly confirmed; the owner accepted the plan's defaults. |
| Dead UI | Recommended: remove what the PRD doesn't need, wire up the rest. Accepted as a plan default. |
| Routing | Recommended: add `react-router-dom`. Accepted as a plan default. |

## 3. Key documents

- `docs/master_fix_plan.md`: the full plan. Every known issue (#1–#18, D1–D9) with cause, fix, files and a test to prove it. **Read this first.** Parts written before the "no Docker / PDFs in DB" decisions (Docker volume and S3 adapter in Phase 5, `docker compose` in the Phase 0 status note) are now **out of date**; follow this handoff where they differ.
- `PRD-Compliance-Document-Tracker.md`: the spec.

## 4. Summary of the audit

**Blockers**
1. Broken install: pnpm links pointed to the old folder location. **FIXED.**
2. No Express error handler, so Multer errors, bad JSON and unknown routes return HTML 500/404 instead of JSON.
3. `cronService.getTransporter()` falls back to the console mock when SMTP is configured but failing, then saves the notification, so the real email is never sent or retried.
4. Thresholds are `[30, 7, 0]` in `backend/src/services/expiryRules.js:7`. The PRD wants 15 as well.

**Functional bugs**
- #5 `Documents.jsx:247` `a.removeChild(a)` throws, so every download shows an error alert.
- #6 Overview has no ≤7d/≤30d tiles; "active" = total − expired (wrongly counts expiring-soon documents).
- #7 "SCAN NOW" only reloads stats.
- #8 Hard-coded activity feed and a fixed "NOMINAL" badge.
- #9 Reset doesn't refetch after a text-only search.
- #10 The fetch error banner is never cleared.
- #11 Deleting the last item on a page leaves an empty page.
- #12 Invalid UUID, category or page/limit values return 500.
- #13 Framework link has no validation and no unique constraint.

**Docs, deployment and data**
- #14 Swagger is missing frameworks, notifications and health, and `/api-docs` isn't rewritten on Vercel.
- #15 Files are lost on Render; cron doesn't run while Render is asleep.
- #16 Secrets were hard-coded in the compose files (now deleted, but the **prod DB password and JWT secret are in git history**, so rotate them).
- #17 README is missing the ER diagram and write-up and has pnpm instructions.
- #18 The seed uses local-time dates and fake one-line "PDFs".

**Dead UI (D1–D8):** header search mock, bell, avatar, ❓ help, table checkboxes, fake "SORT BY" label, ⚙ icon used for logout and `justify:` typo in `Sidebar.jsx`, and no URL routing.
**D9:** `/cron/trigger` always returns 200 even when sends fail.

**Found during the session, not yet in the plan:**
- **Rate limiter on Render:** `app.js` has no `app.set('trust proxy', …)`. Behind the Vercel and Render proxies, every user shares one IP, so 5 logins in 15 minutes (successful ones count too) locks everyone out during a demo. Fix: trust proxy (likely 2 hops: Vercel → Render), and `skipSuccessfulRequests: true`.
- **Login timeout on a sleeping server:** Render free tier sleeps, so the first request takes about 50 seconds. The 15 s timeout in `AuthContext.login` can fail before the server wakes. Consider an external keep-alive pinger and a longer timeout or retry.
- **Seeded data on the live DB is stale:** it was seeded in July with relative dates, so most demo documents are now expired. A planned `SEED_REFRESH_DATES` option would reset seeded documents' dates relative to today.
- `frontend/.env.local` (untracked, the owner's) sets `VITE_API_URL` to the Render backend, so local `npm run dev` sends API calls to the **live** backend and live data. Run the frontend with `VITE_API_URL=http://localhost:5000` for local testing; check whether the shell value overrides `.env.local` before relying on it. Don't edit the owner's file without asking.
- `npm audit`: nodemailer and zod (high), uuid (moderate). These need major version upgrades; do them after tests exist.

## 5. Done so far (uncommitted)

1. **Clean npm install.** Deleted the broken `node_modules`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the backend/frontend/root lockfiles, then reinstalled. There's now one root `package-lock.json` (untracked, **must be committed**).
2. **Root `package.json`:** removed `concurrently`, `install:all` is now just `npm install`, added the `test` and `db:local` scripts.
3. **Deleted 3 leftover files outside the repo:** `C:\Users\ASUS\node_modules\.bin\node{,.cmd,.ps1}` (approved by the owner). They were leftover links to an uninstalled `node` package and broke every `npm run` script that calls `node`. Note that `C:\Users\ASUS\package.json` and its `node_modules` (mongoose, wrangler, etc.) still exist; leave them alone.
4. **Docker removed (`git rm`):** `backend/Dockerfile`, `backend/docker-entrypoint.sh`, all `.dockerignore` files, `frontend/Dockerfile`, `frontend/Dockerfile.prod`, `frontend/nginx.conf`, `docker-compose.yml`, `docker-compose.prod.yml`.
   **Still referencing Docker:** `frontend/vite.config.js` (`DOCKER_ENV` fallback), `README.md`, `docs/implementation_details.md`, `docs/project_report.md`, `docs/master_fix_plan.md`, PRD tech table.
   ⚠️ **If the Render service was set up as a Docker service, deploys now break.** Switch it to a Node runtime (see §7).
5. **Local DB:** `backend/scripts/local-db.js` runs embedded-postgres (pinned dev dependency `embedded-postgres@17.11.0-beta.19`). It reads user, password, port and database name from `DATABASE_URL` in `backend/.env`, refuses to start for a non-localhost URL, and keeps data in `backend/.pgdata/` (`**/.pgdata` added to root `.gitignore`). It was started successfully and the 3 existing migrations were applied. It's **not running now** (the background task was stopped).
6. **`backend/package.json`:**
   - `prisma` moved to `dependencies`.
   - Added `engines.node >=20` and the scripts `start:prod` (`prisma migrate deploy && node prisma/seed.js && node src/app.js`), `db:local`, `db:deploy`, and `postinstall: prisma generate`.
   - `test` is now `node --test tests/`.
7. **`backend/prisma/schema.prisma` — partly edited, see §6:**
   - Removed `Document.filePath`.
   - Added `file DocumentFile?` and the new `DocumentFile` model (`document_files`: `document_id` PK/FK cascade, `file_name`, `mime_type`, `size`, `data Bytes`, `uploaded_at`).
   - Added `@@unique([framework, controlCode])` to `FrameworkControl`.
   - Updated the threshold comment.

**Verified earlier in the session:** 10/10 unit tests pass, the frontend build passes, the backend boots, `/api-docs` returns 200, and `npm run dev` starts both servers.

## 6. ⚠️ Current state is half-done: finish this first

The schema no longer has `filePath`, but **no migration exists yet** and **the code still uses `filePath`** (`documentController.js`, `utils/storage.js`, `uploadMiddleware.js` disk storage, `verifyPdfMiddleware.js`, `prisma/seed.js`). The generated Prisma client is still the old one. The next `npm install` (postinstall) or `prisma generate` will produce a client that breaks the backend at runtime.

Next steps in order:
1. Start the local DB with `npm run db:local` in its own terminal.
2. **Write the migration by hand.** `prisma migrate dev` fails in a non-interactive shell, and `prisma migrate diff --from-schema-datasource` exited with code 4. Create `backend/prisma/migrations/2026112313xxxx_pdf_storage_and_control_unique/migration.sql` containing:
   - `CREATE TABLE "document_files" (...)`, with the FK to `documents(id)` `ON DELETE CASCADE`
   - `ALTER TABLE "documents" DROP COLUMN "file_path";` (the files behind these paths are already gone on Render, so nothing of value is lost)
   - de-duplicate `framework_controls` (keep the newest `linked_at` per `(framework, control_code)`), then `CREATE UNIQUE INDEX "framework_controls_framework_control_code_key" ON "framework_controls"("framework","control_code");`

   Then run `npx prisma migrate deploy` and `npx prisma generate`, and check with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <local url to a scratch db>` (it should print an empty diff).
3. **Code changes for file storage:**
   - `uploadMiddleware.js`: `multer.memoryStorage()`, keep the 5 MB limit and the PDF fileFilter.
   - `verifyPdfMiddleware.js`: check `%PDF` on `req.file.buffer`.
   - `documentController.js`: create with a nested `file: { create: { fileName, size, data: req.file.buffer } }`; update with `file: { upsert: … }`; download reads `prisma.documentFile.findUnique` and sends the buffer with `Content-Length`. Return `file: { fileName, size }` (via `select`, never `data`) and a `hasFile` flag in list and detail responses. Show "File missing, re-upload via Edit" in the UI when `hasFile` is false.
   - Delete `utils/storage.js` and the `makeUploadFilename` test in `tests/expiry.test.js`. Remove `uploads/` handling.
   - `seed.js`: generate a real minimal valid PDF per document (new `utils/samplePdf.js` that builds the PDF with correct xref offsets and the document title), use `todayDateOnly()` / `addDays()` from `src/utils/dates.js`, use `DEMO_NOTIFY_EMAIL`, add the `SEED_REFRESH_DATES` option, and backfill the file for any seeded document that doesn't have one.

## 7. Remaining work (after §6)

Follow `docs/master_fix_plan.md` Phases 1–4 and 6, with these changes:
- **Phase 1:** `middleware/errorHandler.js` (`notFound`, MulterError → 400, JSON parse → 400, Prisma P2025 → 404 / P2002 → 409, no `details` in production), a Zod list-query schema plus a `sort`/`order` whitelist, UUID param check → 404, framework link Zod validation plus `upsert`, a JSON-safe `readJson()` on the frontend, `trust proxy` and limiter fixes, and fail at startup if `JWT_SECRET` is missing or short.
- **Phase 2:**
  - SMTP: fail instead of mocking when `SMTP_HOST` is set and broken; mock only when no SMTP is configured; add `secure: port === 465`.
  - Thresholds become `[30, 15, 7, 0]`; update the tests and texts.
  - The trigger route returns non-200 when sends fail.
  - Add `POST /api/services/cron/run` protected by an `x-cron-secret` header (`CRON_SECRET`) for an external daily scheduler (cron-job.org), plus an optional catch-up scan on startup. Duplicate sends are already prevented, so a startup scan is safe.
- **Phases 3–4:** all frontend fixes from the plan (#5, #9–#11, UTC date formatting, #6 tiles with backend status counts from one SQL `COUNT(*) FILTER` query, #7, #8, D1–D8 with react-router-dom).
- **Phase 5 (rewritten — no Docker, no S3):**
  - Add `render.yaml` for a Node web service. Build: `npm ci`. Start: `npm run start:prod --workspace=backend`. Health check path: `/api/health`.
  - Render env vars: `DATABASE_URL` (Neon/Supabase), `JWT_SECRET`, `SMTP_HOST/PORT/USER/PASS/FROM`, `APP_TIMEZONE`, `CRON_SECRET`, `DEMO_NOTIFY_EMAIL`, `NODE_ENV=production`, `TRUST_PROXY`.
  - Check that Vercel still builds the frontend now that `frontend/package-lock.json` is gone (workspace root lockfile; root directory `frontend`).
  - Add an `/api-docs` rewrite to `vercel.json`.
  - Remove the `DOCKER_ENV` fallback from `vite.config.js`.
- **Phase 6:**
  - Swagger: complete the spec and add a route-coverage test.
  - README: npm-only setup with `npm run db:local`, an env var table, a Mermaid ER diagram including `document_files`, the reminder rules, Render/Vercel/Neon deployment steps, and the write-up.
  - Update the docs that mention Docker.
  - Add supertest integration tests and a GitHub Actions CI workflow.
  - Do the `npm audit` major-version upgrades.
- **Final:** end-to-end browser check locally. Then get the owner's OK to **commit** and to **push to `main`**: pushing triggers live deploys, and the migration drops `file_path` on the live DB. Then the owner updates the Render settings and env vars, and we verify the live site.

## 8. Things to keep in mind

- Windows host: PowerShell and Git Bash are both available. The repo is inside **OneDrive**, which syncs `node_modules`; that caused the broken-link problem. Suggest excluding it from sync.
- `schema.prisma` and other files have CRLF line endings: `sed` / `String.replace` with `\n` silently fails, so use exact Edit replacements.
- `prisma migrate dev` is interactive-only here; write migrations by hand and apply with `migrate deploy`.
- Never print `backend/.env` values (they include SMTP credentials). Names only.
- The owner's private instruction for UI work: **avoid burnt orange with black and white text; use opaque cards in distinct, suitable colors.** The current UI uses `#fd7e14` orange for warnings. Pick a different warning color when restyling.
- Don't commit, push or change Render/Vercel settings without the owner's explicit OK.
