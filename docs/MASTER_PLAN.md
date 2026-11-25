# DocShield: Flaw Audit and Master Remediation Plan

Scope: every tracked file at commit `4f290d5` (shallow clone). Findings come from reading the code, not from running it. Each flaw has an ID, the evidence, and the root cause.

Note: there is no handoff file in the repo. Nothing matches `*hand*`, and no file mentions "handoff". The only history is the single latest commit. Its message and `backend/tests/expiry.test.js` refer to an earlier "audit A-1..A-4" (dates, alert thresholds, duplicate sends, upload name collisions). That audit isn't in the repo. This document starts from what the code shows now.

---

## 1. The one root cause behind most flaws

`PRD-Compliance-Document-Tracker.md` §1.3 says it outright: *"an MVP built to demonstrate backend engineering competency for a job application… not feature breadth or scale."* The non-goals say "single demo admin account only."

So the codebase was built as a **demo that passes a happy-path walkthrough**, and it is now being used as if it were a **system of record for compliance documents**. The flaws fall into five families, each with its own cause:

| Family | True reason it exists |
|---|---|
| **A. Demo defaults shipped as production defaults** | Seed, secrets and compose files were written for "clone and it works." Nothing separates dev from prod. |
| **B. Silent failure by design** | Fallbacks (console mail mock, Supabase stub, `details: error.message`) were added so the demo never visibly breaks. In a compliance tool the broken thing *is* the product. |
| **C. State kept on a disposable machine** | Files are on local disk with absolute paths. The "storage abstraction" is a stub, so it only looks portable. |
| **D. No contract at the edges** | No input validation on query/params, no error middleware, no shared Prisma client, no tests above the pure-function level. Each controller was written alone. |
| **E. Process drift** | Three package managers, hand-run "verify" scripts, and docs written per phase and never reconciled. Whoever fixes one thing can't tell what else depends on it. |

The last commit fixed the date and alert bugs. It was a **symptom fix inside family D/B**. The same class of bug is still present (see F-12) because the cause, no shared contract plus no integration tests, was left alone.

---

## 2. Findings

Severity: **S1** can cause data loss, a missed compliance alert, or unauthorized access. **S2** is a security or reliability weakness. **S3** is a correctness or quality problem.

### Family A: Demo defaults in production

| ID | Sev | Evidence | Consequence |
|---|---|---|---|
| F-01 | S1 | `docker-entrypoint.sh` runs `node prisma/seed.js` on **every start**, including via `docker-compose.prod.yml`. `seed.js` creates `admin@compliance.com` / `adminpassword` and 10 fake documents. | Anyone who reads the repo can log in to a production deployment. Fake documents pollute the real registry. |
| F-02 | S1 | JWT secrets and DB passwords are hardcoded in `docker-compose.yml`, `docker-compose.prod.yml` and `backend/.env.example` (`supersecretkey…`, `productionsecurepasswordhere`). | Public secrets mean forgeable admin JWTs. The "prod" secrets are also in git history forever and must be treated as burned. |
| F-03 | S2 | Postgres publishes `5432:5432` to the host in both compose files, with a known password and no healthcheck. `backend` uses `depends_on` without `service_healthy`. | DB exposed to the host network. Startup relies on a 15×3s retry loop. |
| F-04 | S2 | `seed.js` uses real-looking recipients (`legal@docshield.com`, …). With SMTP configured, the seeded expired and expiring documents make the cron send real mail to those addresses. | Accidental outbound email from a seed. |
| F-05 | S3 | `seed.js` builds dates with local `setDate`/`today`. This is the same bug the last commit fixed in `dates.js`. | Seed dates shift by timezone. |

### Family B: Silent failure

| ID | Sev | Evidence | Consequence |
|---|---|---|---|
| F-06 | **S1** | `cronService.getTransporter`: if `SMTP_HOST` is set but `verify()` fails, it logs a warning and **falls back to the console mock**. The mock's `sendMail` always succeeds, so the notification row stays claimed, `success: true` is returned, and the warning is never retried. | **A misconfigured or briefly down SMTP server permanently eats the alert.** The dashboard's "warnings sent" count goes up for emails nobody received. This is the most dangerous defect in a compliance product. |
| F-07 | S1 | `storage.js`: `PROVIDER === 'supabase'` returns a fabricated URL and uploads nothing. `deleteFile` only logs. `downloadDocumentFile` does `fs.existsSync(document.filePath)`, which can never be true for a URL. | Setting `STORAGE_PROVIDER=supabase` stores a link to a file that doesn't exist, and the local copy is orphaned. The stub looks like a feature. |
| F-08 | S2 | Every controller returns `details: error.message`. This leaks Prisma messages (table, column, constraint names) to clients. `/api/health` returns the raw DB error publicly. | Information disclosure. |
| F-09 | S2 | Cron failures inside the loop other than P2002 `throw` and abort the **whole scan**. Remaining documents get no alert that run. | One bad row blocks all later alerts for the day. |
| F-10 | S3 | `notificationController`: `if (!notif.document) return notif` is unreachable (the relation is `onDelete: Cascade`). | Dead code hiding an assumption. |

### Family C: Disposable state

| ID | Sev | Evidence | Consequence |
|---|---|---|---|
| F-11 | **S1** | Uploads go to `backend/uploads/`. `docker-compose*.yml` has **no volume** for it. The DB column `file_path` stores the **absolute/cwd-relative local path** multer returned. `vercel.json` points to a `*.onrender.com` backend, whose disk is ephemeral on Render. | Rebuilding or redeploying the backend container wipes every PDF while the DB rows survive. The registry says the documents exist and the files are gone. For compliance evidence this is the worst data-loss path. The absolute path also breaks any move between hosts. |
| F-12 | S2 | The cron fires only at 00:00 in the app's own process (`node-cron`). On a free-tier host that sleeps, the process may be down at midnight. `checkExpiries` does not run on startup. | State-based thresholds make late scans correct, but nothing triggers a late scan until the next midnight. |
| F-13 | S3 | `dashboardController.monthlyUploads` uses `setDate/setHours/setMonth` (local time) and `toLocaleString('default')`, so bucket edges and month names depend on server locale. | The same timezone bug class as the one already "fixed." |

### Family D: No contract at the edges

| ID | Sev | Evidence | Consequence |
|---|---|---|---|
| F-14 | S2 | `app.js` has no error-handling middleware. Multer errors (file too large, wrong mimetype from `fileFilter`) go to Express's default handler. | HTML 500 pages (stack traces outside `NODE_ENV=production`) instead of a clean 400/413. |
| F-15 | S2 | Seven separate `new PrismaClient()` instances (`app.js`, 4 controllers, `authController`, `cronService`). | Each opens its own connection pool. Pool exhaustion on small Postgres plans. |
| F-16 | S2 | `getDocuments`: `parseInt(page)`/`parseInt(limit)` unvalidated. `limit=100000` is unbounded, `limit=abc` gives NaN, and `page=0` gives a negative `skip`, all ending in a 500. An invalid `category` throws a Prisma enum error (500). A non-UUID `:id` gives a Prisma error (500) instead of 404. An unknown `status` is silently ignored. | Bad input becomes a 500 or a silently wrong result. |
| F-17 | S2 | `login`: no `trust proxy`. The limiter keys on `req.ip`, which behind nginx/Render is the proxy's IP. `max: 5` also counts **successful** logins. | Either all users share one 5-attempt bucket and lock each other out, or (with `express-rate-limit` v8) the `X-Forwarded-For` validation throws. Brute force protection is both too strict and bypassable. |
| F-18 | S2 | JWT: 7-day expiry, no revocation, `JWT_SECRET` unchecked at boot (undefined makes `jwt.sign` throw as a 500), algorithm not pinned. The token is stored in `localStorage`, and the CSP allows `'unsafe-inline'` scripts. | A stolen token stays valid for a week. Any XSS can read it. |
| F-19 | S2 | `cors()` with no origin allowlist. | Any origin can call the API from a browser (still needs a token, but the policy is wrong). |
| F-20 | S2 | `frameworkRoutes`/`linkDocumentToControl`: `framework` and `controlCode` are not validated against `STATIC_CONTROLS`. The schema has no `@@unique([framework, controlCode])`, and the code does find-then-create. | Arbitrary rows are created. Concurrent calls create duplicates, and `controlMap` keeps the last one. |
| F-21 | S3 | `Document` has no indexes on `expiry_date`, `category` or `created_at`, though the cron, dashboard (6+ counts) and list filters hit them. The dashboard issues about 12 sequential queries. | Fine at 10 rows, slow at scale. |
| F-22 | S3 | `downloadDocumentFile` pipes a stream with no `error` handler. | A read error leaves the response hanging. |
| F-23 | S3 | `updateDocument` doesn't check `updateData.description` against clearing. `req.file` is saved before the DB update, and the old file is removed only on success (OK), but a failed update after `saveFile` under a non-local provider would leak the new object. | Edge-case orphans. |
| F-24 | S3 | The `swaggerRoutes` page loads Swagger UI from `unpkg.com` with no SRI, publicly, with `unsafe-inline`/`unpkg.com` allowed in the CSP. `openapi.json` is a hand-edited static file. | Supply-chain exposure, and the spec can drift from the routes. |

### Family E: Process drift

| ID | Sev | Evidence | Consequence |
|---|---|---|---|
| F-25 | S2 | Package managers conflict. The root `package.json` uses npm `workspaces`, `pnpm-workspace.yaml` and `dev.js` use pnpm, `frontend/` has a `package-lock.json`, and `backend/` has **no lockfile**. The Dockerfiles run `npm install`, not `npm ci`. | Builds aren't reproducible. Backend dependency versions float on every image build. |
| F-26 | S2 | Tests cover only pure functions (`dates`, `documentStatus`, `expiryRules`, `makeUploadFilename`). `verify_phase9.js`/`verify_security.js` are manual scripts that need a live server on `localhost:5000` and are not in `npm test` or CI. There is no CI. | Controllers, auth, upload, the cron claim/release logic and migrations are untested. This is why F-06 and F-13 survived the last fix. |
| F-27 | S3 | `README.md` (lines 110-111, "Exactly 30 Days Left / Exactly 7 Days Left") and `docs/implementation_details.md` (line 224) describe the **old** alert behavior. The last commit changed it to state-based thresholds (30/7/0). | Docs contradict the code. A reader will "fix" the code back. |
| F-28 | S3 | `Documents.jsx` `handleDownload`: `a.removeChild(a)` should be `document.body.removeChild(a)`. It throws `NotFoundError` after the download starts. | The user sees "Error downloading" after a successful download, and `revokeObjectURL` never runs. |
| F-29 | S3 | The frontend uses `alert()` for all errors. Navigation is `useState` page switching with no router, so no deep links and no back button. `Dockerfile.prod` uses `npm install`. | Poor UX and no testability. |
| F-30 | S3 | Containers run as root, `npm start` runs as a child of `sh` (SIGTERM never reaches Node, so there is no graceful shutdown or `prisma.$disconnect`), and there is no healthcheck. | Slow, unclean stops and dropped in-flight requests on deploy. |

### Product-level gaps (not bugs, but they matter for "compliance")

- **No audit trail.** Who uploaded, edited or deleted a document, and when, isn't recorded. `DELETE` is a hard delete that removes the file and cascades the notification history. This matters in a tool that exists to survive audits.
- **Single recipient per document** (`notifyEmail`). If that mailbox is dead, nothing escalates.
- **No renewal workflow.** Renewing means editing the expiry date. The old document and file are overwritten (the old file is deleted on replace).

---

## 3. Master plan

Order is by risk, and each phase leaves the system working. Each phase has an exit test so it can be verified rather than assumed.

### Phase 0: Stop the bleeding (half a day; do before anything else)
1. **F-02:** Rotate all secrets. Remove literals from both compose files and use `${VAR}` with an untracked `.env`. Fail startup if `JWT_SECRET` is missing or shorter than 32 characters.
2. **F-01:** Delete the seed from `docker-entrypoint.sh`. Make the seed an explicit dev-only command (`npm run db:seed`), and change `seed.js` to refuse to run when `NODE_ENV=production`. Add a one-time `create-admin` command that takes email and password from the environment.
3. **F-06:** Remove the silent mock fallback. In production, a failed SMTP verify must make `checkExpiries` return `success:false`, release every claim, and log at error level. The console mock stays only when `NODE_ENV !== 'production'` and `SMTP_HOST` is unset.
4. **F-11 (stop-gap):** Add a named volume for `uploads/` in both compose files so a rebuild no longer wipes files.

**Exit test:** `docker compose -f docker-compose.prod.yml up` with no `.env` refuses to start. With a bad `SMTP_HOST`, a manual scan reports failures and a retry after the fix sends the email.

### Phase 1: Make the data durable (1-2 days)
1. **F-11/F-07:** Implement a real storage adapter interface (`put`, `get` as stream, `delete`) with a local driver and an S3-compatible driver (S3, or Supabase's S3 API). Remove the stub. Store a **storage key**, not an absolute path. Write a migration script that converts existing `file_path` values to keys and verifies each file exists, listing the missing ones.
2. **F-22/F-23:** The download streams from the adapter with `error` handling. Create and update become "upload, write DB, then delete old" with compensating cleanup on failure.
3. Add a nightly reconciliation job that reports DB rows with a missing file and files with no row.

**Exit test:** Destroy and recreate the backend container (or redeploy). All downloads still work. The reconciliation job reports zero missing files.

### Phase 2: Reliable alerting (1 day)
1. **F-12:** Run `checkExpiries` once on boot (after DB is ready), then on a schedule. Move the scheduler to one place. Take a Postgres advisory lock so two instances never scan at once (the unique key already protects against duplicate sends, the lock avoids wasted work).
2. **F-09:** Catch per-document errors, record them, and continue.
3. Set `secure: true` for port 465 and add connect/send timeouts to the SMTP transport.
4. Add an alert for the alerter: if a scan fails, or no scan has succeeded in 36 hours, surface it on `/api/health` and the dashboard. Optionally add a secondary recipient or escalation address (the product gap above).

**Exit test:** Stop the process across a midnight and start it later: warnings go out within minutes of boot. Kill SMTP mid-scan: unsent documents are retried next run and sent ones are not repeated.

### Phase 3: Harden the API edge (2 days)
1. **F-15:** One shared `src/db.js` exporting a single `PrismaClient`. Add `SIGTERM` handling with `server.close()` and `prisma.$disconnect()`. Start with `exec` in the entrypoint (**F-30**).
2. **F-14/F-08:** Add one error middleware. It maps `MulterError` to 413/400, Prisma `P2025` to 404, and `P2002` to 409. Everything else returns a generic 500 plus a request ID, with details logged server-side only. Strip `details: error.message` from all controllers and from `/api/health`.
3. **F-16:** Add zod schemas for `query` (`page>=1`, `1<=limit<=100`, `category` enum, `status` enum) and `params` (`uuid`). Reject, don't ignore.
4. **F-17:** `app.set('trust proxy', <hops>)`, and use `skipSuccessfulRequests: true` on the login limiter. Add a per-account throttle.
5. **F-18/F-19:** Shorten the access token (15-60 min) with refresh in an `HttpOnly; Secure; SameSite` cookie, or at minimum a 12h token with a `tokenVersion` on `Admin` for revocation. Pin `algorithms:['HS256']`. Set a CORS allowlist from an env var. Drop `'unsafe-inline'` from `script-src` where possible.
6. **F-20:** Add `@@unique([framework, controlCode])`, validate against the control catalog, and use `upsert`. Move the catalog to `backend/src/data/controls.js` (and correct the inaccurate ISO control descriptions).
7. **F-21:** Add indexes on `documents(expiry_date)`, `documents(category)`, `documents(created_at)`. Collapse the dashboard counts into one raw query with `FILTER` clauses, and compute `monthlyUploads` in one grouped query using the business time zone (**F-13**).
8. **F-24:** Serve Swagger UI from a pinned local `swagger-ui-dist` package, or disable `/api-docs` in production. Generate `openapi.json` from the zod schemas, or add a CI check that it matches the routes.

**Exit test:** A fuzz list of bad inputs (`limit=-1`, `limit=x`, `id=not-a-uuid`, 10 MB upload, wrong content type) returns the right 4xx for every case, never a 500 and never an HTML body.

### Phase 4: Make it provable (2 days; start the test harness in Phase 0 and grow it)
1. **F-26:** Add integration tests (`node:test` + `supertest`, against a throwaway Postgres in CI). They cover login and rate limit, document CRUD with a real PDF, the status filters, the cron claim/release/retry paths (including F-06), and the migrations applied to a copy of the seed data. Fold `verify_*.js` into this suite and delete them.
2. Add GitHub Actions: lint, `npm ci`, `prisma migrate deploy` on a service Postgres, tests, and a Docker build.
3. **F-25:** Pick **npm** (the repo's `package.json` and both Dockerfiles already use it) or pnpm, delete the other manager's files, commit lockfiles for both packages, and switch the Dockerfiles to `npm ci`.
4. **F-27:** Update `README.md` and `docs/implementation_details.md` to the 30/7/0 state-based behavior. Add a short `docs/ARCHITECTURE.md` and a `docs/HANDOFF.md` (what's deployed where, env vars, how to rotate secrets, how to recover from a failed scan). The repo currently has no handoff doc, and this closes that gap.

**Exit test:** A pull request with a deliberately wrong status boundary, a broken migration or a missing lockfile fails CI.

### Phase 5: Frontend and product gaps (2-3 days)
1. **F-28:** Fix `document.body.removeChild(a)` and revoke the URL in a `finally`.
2. **F-29:** Add `react-router`, a toast component in place of `alert()`, and `npm ci` in `Dockerfile.prod`.
3. **Audit trail:** An `audit_log` table (admin id, action, document id, before/after, timestamp), written in the same transaction as each change. Switch `DELETE` to soft delete (`deletedAt`) with a retention window, and keep notification history.
4. **Renewal:** A "renew" action that creates a new version and keeps the old file and expiry date in history instead of overwriting.
5. Allow multiple notification recipients per document, with an escalation address for expired documents.

### Phase 6: Production hygiene
Run containers as a non-root user, add `HEALTHCHECK` and `service_healthy` dependencies, stop publishing port 5432, use structured logs (replace `morgan('dev')`), and add a backup and restore runbook for Postgres and the file store.

---

## 4. Suggested order of work

`F-02, F-01, F-06, F-11 stop-gap` → `Phase 1` → `Phase 2` → `Phase 3` (with Phase 4 tests written alongside) → `Phase 5` → `Phase 6`.

Phases 0-2 remove every S1 risk (public admin credentials, permanent loss of alerts, permanent loss of files). Do not start feature work (Phase 5) before them.

## 5. What was not verified

- I haven't run the app, the migrations or the tests. Everything above is from reading the code.
- The frontend pages were sampled (auth context, App, download handler, Analytics), not read line by line. `Documents.jsx` (789 lines) in particular deserves a full pass.
- I assumed the Render deployment uses ephemeral disk, based on the `vercel.json` target. If a persistent disk is mounted there, F-11 is lower severity in that environment but the compose files are still exposed.
- Only one commit is available (shallow clone), so I can't say when any of this was introduced.

---

## 6. Reconciliation with HANDOFF.md (dated 2026-11-23)

The handoff describes uncommitted work on the owner's machine. This clone is at `4f290d5`, so `docs/master_fix_plan.md` and the half-finished schema/Docker removal are **not** here. Where the handoff and sections 1-5 differ, **the handoff's owner decisions win**:

| Topic | Superseded in this plan | Use instead |
|---|---|---|
| Docker | Phase 0 volume, Phase 3 `service_healthy`, Phase 6 non-root container, F-03, F-30 | No Docker. Deploy as a Node service on Render (`render.yaml`). |
| File storage | Phase 1 S3 adapter | PDFs in Postgres (`document_files`, `Bytes`). Never `select` `data` in list/detail queries. |
| Package manager | Phase 4 "pick one" (F-25) | npm workspaces, one root lockfile. |
| Thresholds | I treated 30/7/0 as correct | 30/15/7/0 (the PRD's 30/15/7 plus the expired alert). |

### Findings both audits reached independently
SMTP mock fallback (F-06 = #3), download `removeChild` bug (F-28 = #5), 500s on bad input (F-16 = #12), framework link (F-20 = #13), file loss on Render (F-11 = #15), secrets in git history (F-02 = #16), rate limiter behind a proxy (F-17), local-time seed dates (F-05 = #18), no error handler (F-14).

### In the handoff but missing from my audit
Dead UI (D1-D8); the `/cron/trigger` route always returning 200 (D9); the dashboard counting expiring-soon documents as "active" (#6); the stale seeded data on the live DB; Render cold starts breaking the 15 s login timeout; `frontend/.env.local` pointing local dev at the live API; `npm audit` findings; Swagger gaps.

### In my audit but missing from the handoff (add these)
1. **F-01 is still live in the new plan.** `start:prod` runs `node prisma/seed.js` on every boot. That keeps `admin@compliance.com` / `adminpassword` on the public site. Seed only through an explicit command, and create the admin from env vars.
2. **`SEED_REFRESH_DATES` is dangerous if it runs at boot.** It would silently reset document dates on the live DB after the owner edits them. Make it opt-in per run, never in `start:prod`.
3. **F-15, seven `PrismaClient`s.** Neon/Supabase free tiers cap connections, and each client opens its own pool. Use one shared client.
4. **F-09:** one failing document aborts the whole scan.
5. **F-18/F-19:** 7-day JWT in `localStorage`, `cors()` open to all origins, and `unsafe-inline` in the CSP.
6. **F-21:** missing indexes, and the dashboard's roughly 12 sequential queries. The planned single `COUNT(*) FILTER` query fixes this; add `monthlyUploads` (F-13) to it.
7. **F-24:** Swagger loaded from unpkg without SRI.
8. **F-26:** the `verify_*.js` scripts need to be folded into the supertest suite and deleted.

### New risks created by the handoff's decisions
- **Database is now the only copy of every PDF.** Neon's free tier has a small storage cap and short point-in-time recovery. Document the cap, and add a periodic export. The migration drops `file_path` irreversibly (accepted by the owner, but take a DB snapshot first).
- **`TRUST_PROXY`.** "Likely 2 hops" is a guess. If it's too high, `X-Forwarded-For` can be spoofed and the limiter is bypassed. Verify by logging `req.ip` on the live site.
- **`x-cron-secret`.** Compare with `crypto.timingSafeEqual`, and rate-limit the route.
- **Vercel rewrite plus a 50 s Render cold start.** Rewrites to external hosts may time out before Render wakes. This is unverified. Test it on the live stack, and consider calling the Render URL directly from the frontend with CORS set to the Vercel origin.
- **Half-done state:** the schema has no `filePath` but the code still uses it, and the next `prisma generate` breaks the backend. Finish handoff §6 as one change before any other work.

### Revised order
1. Finish handoff §6 (migration, memory storage, controller/seed changes) as one commit.
2. Phase 0 items still open: rotate secrets (history is burned), remove the seed from boot (new item 1), remove the mock fallback.
3. Handoff Phase 1-2 (error handler, validation, thresholds, trigger status, cron route), plus new items 3-4.
4. Handoff Phases 3-4 (frontend), then Phase 5 (Render/Vercel), then Phase 6 (docs, tests, audit upgrades).
5. Only after those: audit trail, soft delete and renewal history (section 3, Phase 5 here).

---

## 7. Implementation status (branch `fix/remediation`)

Done and covered by tests (18 passing, including integration tests against Postgres 16; the new migration matches `schema.prisma` with an empty `migrate diff`): F-01 (no boot seed, admin from env), F-06 (no silent mock; production fails loudly), F-07/F-11 (PDFs in Postgres, no stub), F-08/F-14 (JSON error handler, no leaked details), F-09, F-12 (startup catch-up scan + external `cron/run`), F-13, F-15, F-16, F-17, F-18 (12h JWT, pinned algorithm, secret length check), F-19, F-20, F-21, F-22, F-25 (npm only), F-27 (README), F-28, 15-day threshold, D9, `trust proxy`, graceful shutdown.

Not done yet: dead UI cleanup and react-router (D1-D8), frontend handling of `hasFile` and the new dashboard fields, toast replacement for `alert()`, Swagger spec completion and local Swagger assets (F-24), CI workflow, audit trail / soft delete / renewal history, `npm audit` major upgrades, rotating the secrets already in git history (owner action), updating the remaining docs that mention Docker (`docs/*.md`, PRD tech table).

Frontend (second pass, verified in a real browser): react-router-dom with `/login`, `/`, `/documents`, `/frameworks`, `/warnings`, `/analytics` (deep links, back button, redirect to login); non-functional header search, bell, avatar and help icon removed; sign-out is a real button; fake activity feed replaced with real recent email alerts plus last scan status; "scan now" runs the real scan and reports failures; honest health badge; new 30d/7d/active/expired tiles from backend counts; toasts replace every `alert()`; search/reset/sort work (sort is a real control); fake checkboxes removed; deleting the last item on a page moves back a page; the fetch error banner clears; dates formatted in UTC; missing-file state disabled with a hint; login waits up to 70 s for a sleeping server; JSON-safe response parsing; burnt-orange warning colour replaced with amber-gold.

Third pass: complete OpenAPI 3 spec (all 14 operations, schemas, security schemes, error responses) with `tests/openapi.test.js` failing on any undocumented route or stale documented route (F-24 closed: Swagger UI served from `swagger-ui-dist`, no unpkg, no inline script, default strict CSP; verified rendering in a browser with no console errors); GitHub Actions CI (`.github/workflows/ci.yml`: `npm ci`, migrations on a clean Postgres 16, migration/schema drift check, tests, frontend build, non-blocking audit); documentation cleaned up (README with Mermaid ER diagram, PRD, project report, build-log banner, new `docs/ARCHITECTURE.md` and `docs/HANDOFF.md`); non-breaking `npm audit fix` applied (react-router-dom 6.30.6).

Fourth pass: upgraded `nodemailer` 6→10, `zod` 3→4 (`z.email()`, `z.uuid()`, `z.flattenError`) and `node-cron` 3→4 (task handles, `noOverlap`, destroyed on shutdown). Added tests that exercise the new versions: a real SMTP conversation against a fake server through the production transport code, the `{ details: { field: [messages] } }` validation shape, and the scheduler contract. Production `npm audit` has no high advisories left, so the CI audit job is now blocking at high severity.

Fifth pass: soft delete (trash, restore, permanent delete, daily retention purge; trashed documents are excluded from lists, the dashboard, downloads, frameworks and reminders) and an append-only audit trail (`audit_logs`, written in the same transaction, tamper-blocking trigger, field-level update diffs, sign-in/failed sign-in/download/link/scan events, `GET /api/audit-logs`, Audit Log page, per-document history). 34 tests pass; verified in a browser (delete, trash, restore, purge, history, audit filters) with no console errors. Renewal history is covered by the update diffs (old and new expiry dates).

Sixth pass: `react-router-dom` upgraded 6.30 → 7.18.6 with no code changes (same API surface); verified in a browser (login redirect, all five sidebar routes, deep link, back button, sign-out, trash/audit pages, no console errors). `npm audit --omit=dev`: 0 vulnerabilities.

Seventh pass: UI redesign on the supplied palette (new shell and layout, drawers instead of modals, status-first Overview, flat editorial style with no gradients, glows, emoji or fake terminal copy; inline SVG icons; responsive down to phone width with no horizontal overflow). Every screen re-checked in a browser; see the frontend design notes in `docs/ARCHITECTURE.md`.

Eighth pass: light and dark theme toggle (token-based, persisted, no flash on load; follows the OS setting by default, with an explicit choice saved only when the user picks a theme that differs from the OS); both themes checked in a browser.

Ninth pass: frontend test suite (Vitest 5, Testing Library, jsdom): 87 tests, wired into CI. Writing it found a real bug (`formatDate(null)` showed 01 Jan 1970), now fixed. Vite upgraded 5 → 7 (needed by Vitest; clears the vite/esbuild advisories). `npm audit --omit=dev`: 0.

Still open: one moderate dev-tooling advisory (`nodemon` → `minimatch`, dev only), rotating the secrets in git history (owner action), and the owner-side deployment steps in `docs/HANDOFF.md`.
