# Architecture

## Components

```
Browser (React + React Router)
   │  /api/*  (Vite proxy in dev, Vercel rewrite in prod)
   ▼
Express API (backend/src/app.js)
   ├─ middleware: helmet, CORS allowlist, JSON body (100 kb), login rate limit, JWT guard, uuid/query validation
   ├─ routes → controllers → Prisma (one shared client, src/db.js)
   ├─ services/cronService: expiry scan (node-cron daily + boot catch-up + HTTP triggers)
   └─ errorHandler: every failure becomes JSON; internals are logged, never returned
   ▼
PostgreSQL (documents, document_files, notifications, framework_controls, admin)
   ▲
SMTP server (Nodemailer) ← expiry scan
```

## Key decisions

| Decision | Reason |
|---|---|
| PDFs stored in Postgres (`document_files`), uploaded via Multer memory storage | Free hosts (Render) have ephemeral disks; a disk path in the database silently dangled after every restart. List and detail queries never select `data`. |
| Dates are calendar dates (`DATE` columns, UTC midnight in JS, "today" from `APP_TIMEZONE`) | Local-time maths shifted dates by one day on UTC+5:30 machines. One module (`utils/dates.js`) owns the rules; `utils/documentStatus.js` is the single source for status and its SQL filters. |
| Reminders are state-based (30/15/7/0) and keyed on (document, expiry date, threshold) | A missed cron run or late upload is still warned; renewing starts a fresh cycle; the unique key makes concurrent scans safe. |
| Claim the notification row, then send; release the claim if sending fails | Never lose an alert and never send twice. |
| No silent mail fallback in production | A mock that "succeeds" marks the alert sent and the real email is never delivered. |
| Scan from several triggers: daily cron, 15 s after boot, `POST /api/services/cron/run` with `x-cron-secret` | A sleeping host can miss midnight. Duplicates are impossible, so extra scans are free. |
| Soft delete (`documents.deleted_at`), purge after `RETENTION_DAYS` | A compliance record deleted by mistake must be recoverable. Trashed documents vanish from lists, the dashboard, downloads, framework views and expiry reminders; a daily job (00:30) purges the expired ones. |
| Audit trail (`audit_logs`), append-only | Answers "who changed or accessed this, and when". Written in the same transaction as the change; no foreign keys, so entries outlive documents; a trigger blocks UPDATE/DELETE/TRUNCATE even for the application's own credentials; updates store field-level before/after (a renewal shows the old and new expiry date). Failing to record a download fails the download. |
| Single shared Prisma client | Each client opens its own pool; free Postgres tiers cap connections. |
| Swagger UI served from `swagger-ui-dist`, spec guarded by a route-coverage test | No third-party scripts, a strict CSP, and the docs cannot drift from the routes. |

## Frontend design system

`frontend/src/index.css` is the single stylesheet. Palette: ink `#092328`, teal `#12544f`, green `#2a835f`, sage `#8bbb92`; the page itself is dark teal (`--page`, a blend of ink and teal) with the rail in ink; content sits on opaque ink panels (`--surface`) with hairline sage borders, so tables, drawers, dialogs and form fields are all dark (`color-scheme: dark`). Text uses `--text` and `--text-muted`; buttons are sage with ink text (danger is brick); bars and charts are sage. Status words use lightened variants (`--ok`, `--soon`, `--late`) so they stay readable on dark. Status needs red and amber, which the palette lacks, so there are three status colours (`--late`, `--soon`, `--ok`); status is always shown as a text label as well as colour. Headings use a system serif stack, body uses the system sans, numbers are tabular. No external fonts, icon libraries, gradients, glows or emoji (icons are the inline SVGs in `components/Icon.jsx`).

Layout: a fixed labelled navigation rail (collapses to a scrolling top bar under 900 px), a ruled page header, flat bordered panels, tables for registers, and right-hand drawers for details, add and edit (small centred dialogs for confirmations). The Overview leads with a sentence that states the position ("4 documents have expired and 3 expire within 30 days"), a proportion bar and four figures, then the documents that need attention. `/documents?status=expired` and `/documents?open=<id>` deep-link into the register.

### Themes

Dark and light, switched with the toggle at the bottom of the navigation rail and in the corner of the sign-in page. All colours are CSS variables defined twice in `index.css`: `:root, [data-theme="dark"]` and `[data-theme="light"]`; components only reference tokens (`--surface`, `--text`, `--accent`, `--late`, ...), so adding a screen needs no theme code. The choice is saved in `localStorage` (`docshield-theme`, wrapped in try/catch) and applied by a small inline script in `index.html` before first paint, so there is no flash. `ThemeContext` keeps the attribute, the saved value and the browser `theme-color` in sync. With no saved choice the theme follows the operating system (`prefers-color-scheme`), including live changes such as automatic day/night switching (a `change` listener, re-checked when the tab regains focus). Clicking the toggle saves an explicit choice; choosing the theme the OS already uses clears the saved value, so the same button restores "follow the system".

## Request lifecycle (documents)

`protect` (JWT, HS256) → `uuidParam` / `validateQuery` → Multer (5 MB, PDF mimetype) → `verifyPdf` (`%PDF` magic bytes) → controller (Zod, date rules) → Prisma → JSON. Any thrown error reaches `errorHandler`: Multer → 400/413, Prisma `P2025` → 404, `P2002` → 409, everything else → 500 with a `requestId`.

## Testing and CI

* `npm test` (backend): unit tests for dates, statuses, thresholds and emails; integration tests (supertest + Postgres) for auth, document lifecycle, input fuzzing, framework linking, dashboard counts, the expiry scan (dedupe, SMTP failure, release of claims) and the cron secret; OpenAPI tests that fail when a route is undocumented or a documented route does not exist; `audit.test.js` covers soft delete, restore, retention and the audit trail, including proof that the trail cannot be updated, deleted or truncated.
* **Frontend** (`npm run test:frontend`, Vitest 5 + Testing Library + jsdom, no server or database needed): 87 tests in 13 files. Unit tests cover date formatting (UTC calendar days, `null` is not 1970), audit-entry wording and status badges. Context tests cover the theme (follows the OS, saved choice, return to system), toasts and auth (sign-in, server and HTML errors, 401 sign-out, expired and malformed tokens). Page tests drive the real components against a mocked `fetch` router (unmatched requests fail the test) and cover the register (search, filters, sorting, paging, stepping back when a later page empties, URL filters, empty and error states, downloads, add/edit forms with server validation, trash, restore, delete forever with confirmations), the overview (statement wording, figures, scan success and failure), frameworks, reminders, the audit log and routing (sign-in redirects, protected pages, sign-out). The suite runs in `America/Los_Angeles` so local-time date bugs cannot hide. Eight deliberately reintroduced bugs (local-time dates, search not cleared, theme not returning to system, failed scan shown as success, 401 not signing out, download enabled without a file, empty later page, unprotected routes) were each caught by at least one test.
* Integration tests need `DATABASE_URL` pointing at a throwaway database with migrations applied; without it they are skipped.
* `.github/workflows/ci.yml`: `npm ci`, `prisma migrate deploy` on an empty Postgres 16, a migration-vs-schema drift check, the backend tests, the frontend tests, the frontend build, and `npm audit --omit=dev --audit-level=high`.

## Known limitations

* The single admin account is by design (PRD non-goal): no roles, so the audit trail records the one admin (and `system` for scheduled jobs) rather than separate people.
* The trigger stops application-level tampering, not a database superuser or provider-level access; export the log if you need stronger guarantees.
* Audit entries are never purged (the table grows slowly: one row per action).
* Tokens last 12 h and are stored in `localStorage`; there is no server-side revocation.
* PDFs live in the database. Check your plan's storage cap and take backups (see `HANDOFF.md`).
* Dependencies: `nodemailer` 10, `zod` 4 and `node-cron` 4 are current and covered by tests (real SMTP delivery against a fake server, validation error shape, scheduler contract). `react-router-dom` is on v7 (the app uses only `BrowserRouter`, `Routes`, `Route`, `Navigate`, `NavLink` and `Outlet`, which are unchanged). `npm audit --omit=dev` reports no vulnerabilities; the only open advisories are in dev-only tooling (`vite`, `esbuild`, `nodemon`/`minimatch`), which does not ship to production. The CI audit job fails on any high-severity production advisory.
