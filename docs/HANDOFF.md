# Operations handoff

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the step-by-step Render, Vercel and cron setup.

## Where things run

| Piece | Where | Config |
|---|---|---|
| Frontend | Vercel, root directory `frontend` | `frontend/vercel.json` rewrites `/api/*` and `/api-docs/*` to the API URL; update that URL if the API moves |
| API | Render, Node runtime | `render.yaml`; build `npm ci`; start `npm run start:prod --workspace=backend` (runs `prisma migrate deploy`, then the server) |
| Database | Neon or Supabase Postgres | `DATABASE_URL` (use the direct, not the pooled, connection string: the app keeps one small Prisma pool, and migrations can hang behind a pooler) |
| Email | any SMTP provider (Resend, Gmail SMTP, ...) | `SMTP_HOST/PORT/USER/PASS/FROM` |
| Daily scan trigger | cron-job.org (recommended on free hosting) | `POST <api>/api/services/cron/run`, header `x-cron-secret: <CRON_SECRET>` |

## Environment variables (API)

`NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (32+ chars; the server will not start without it), `JWT_EXPIRES_IN` (default 12h), `CORS_ORIGINS` (leave empty when the frontend uses the Vercel rewrite), `TRUST_PROXY` (hops in front of the API), `APP_TIMEZONE`, `CRON_SECRET`, `SMTP_*`, optional `STARTUP_SCAN=false` to disable the boot scan. Full list with comments: `backend/.env.example`.

## First deployment

1. Create the database and set `DATABASE_URL`.
2. Deploy; migrations run on start.
3. Create the admin once: `ADMIN_EMAIL=... ADMIN_PASSWORD='12+ chars' npm run db:create-admin --workspace=backend` (run it in a Render shell, or locally with the production `DATABASE_URL`).
4. Do **not** run `db:seed` against production (it refuses unless `ALLOW_SEED=true`; it creates a well-known password).
5. Set `TRUST_PROXY`. Verify: sign in from two networks and confirm the rate limiter counts them separately (log `req.ip`).
6. Add the cron-job.org job and confirm a manual call returns 200.

## Routine tasks

* **Rotate `JWT_SECRET`**: set a new value and redeploy; everyone is signed out. Secrets that were ever committed (the old compose files in git history) must be treated as compromised and rotated.
* **Change the admin password**: re-run `db:create-admin` with the same email.
* **Check alert health**: `GET /api/health` returns `alerts.lastRunAt / lastSuccessAt / lastError`. A non-null `lastError` or an old `lastSuccessAt` means reminders are not going out.
* **Run a scan now**: the Dashboard's "Run expiry scan now" button, or `POST /api/services/cron/trigger` with a login token. A `502` means the mail server or a send failed; the response lists which documents failed and the next scan retries them.

## Trash and audit log

* **Deleted something by mistake?** Documents > Trash > Restore. Items are purged `RETENTION_DAYS` (default 30) after deletion by a job at 00:30 `APP_TIMEZONE`; a purged document is gone for good (the audit log keeps a record).
* **Who changed or downloaded a document?** Open the document's details for its history, or use the Audit Log page (filter by action, person, dates). The same data is at `GET /api/audit-logs`.
* The audit log cannot be edited or cleared from the app or API, and a database trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on `audit_logs`. If you ever must remove test data from it, drop the triggers first as the database owner, and record that you did.

## Failure playbook

| Symptom | Likely cause | Fix |
|---|---|---|
| Scan returns 502, `error: SMTP_HOST is not configured` | production without mail settings | set `SMTP_*` and re-run the scan; nothing was marked as sent |
| Scan returns 502 with `failed[]` entries | mail server rejected or timed out | fix the provider issue and re-run; failed warnings were released and will send |
| Everyone locked out of login | too many failed attempts from a shared IP (wrong `TRUST_PROXY`) | wait 15 min; correct `TRUST_PROXY` |
| First request takes ~50 s | free host cold start | expected; the login screen waits up to 70 s. The cron-job.org ping also keeps the host warm |
| Document shows "File missing" | the document predates PDF-in-database storage | open Edit and re-upload the PDF |
| `500` with a `requestId` | unexpected error | find `[ERROR <requestId>]` in the API logs |

## Backups and capacity

PDFs, the trash and the audit log live only in Postgres (max 5 MB per PDF). Check the storage cap of your Neon/Supabase plan, keep the provider's point-in-time recovery enabled, and export periodically (`pg_dump "$DATABASE_URL" > backup.sql`). Restoring is `psql "$DATABASE_URL" < backup.sql` into an empty database, then `npm run db:deploy --workspace=backend`.

## Development

`npm install`, copy `backend/.env.example` to `backend/.env`, `npx prisma migrate deploy --schema backend/prisma/schema.prisma`, `npm run dev`. `npm test` runs the backend then the frontend suites (`npm run test:backend`, `npm run test:frontend`); the backend integration tests need `DATABASE_URL` (use a scratch database: the tests delete rows). CI runs the same on every pull request.
