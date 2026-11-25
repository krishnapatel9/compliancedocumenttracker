# Deployment: Render (API) + Vercel (frontend) + Neon (database)

Order matters: database, API, admin account, frontend, scheduler, verification.

## 0. Before you start

* **Snapshot the live database.** The first deploy applies three migrations; the first one drops `documents.file_path`, so links to PDFs on the old disk are gone for good. In Neon: create a branch from the current state (instant, free) or take a backup.
* **Rotate secrets that were ever committed.** The old compose files in git history contained a JWT secret and a database password. Treat both as compromised: new database password (Neon: reset the role password), new `JWT_SECRET`.
* Generate secrets (32+ characters each):
  ```bash
  openssl rand -hex 32    # JWT_SECRET
  openssl rand -hex 32    # CRON_SECRET
  ```
* Get the code onto the branch you deploy from: review `fix/remediation`, then merge it into `main` (or point Render and Vercel at the branch while you test).

## 1. Database (Neon or Supabase)

1. Create (or reuse) the project and database.
2. Copy the **direct** connection string (host without `-pooler`), with `?sslmode=require`:
   `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`
   Use the direct string, not the pooled one: the API keeps a single small connection pool, and `prisma migrate deploy` can hang behind a pooler.

## 2. API on Render

Render needs a **Node** service (the old Docker files are gone). Two ways; pick one.

**A. Keep your current URL (`compliancedocumenttracker.onrender.com`):** open the existing service, Settings, and set:

| Setting | Value |
|---|---|
| Runtime / Language | Node (if Render will not let you change an existing Docker service, use option B) |
| Root Directory | *(empty)* |
| Build Command | `npm ci` |
| Start Command | `npm run start:prod --workspace=backend` |
| Health Check Path | `/api/health` |
| Branch | the branch you merged to |

**B. New service from the blueprint:** Render dashboard, New, Blueprint, pick the repo; it reads `render.yaml` (service name `compliance-document-tracker-api`, so its URL will be `https://compliance-document-tracker-api.onrender.com` unless you rename it). You will then change the URL in `frontend/vercel.json` (step 4).

**Environment variables** (Environment tab; the blueprint prompts for the ones marked `sync: false`):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the direct Neon string from step 1 |
| `JWT_SECRET` | 32+ random characters. The server refuses to start without it |
| `CRON_SECRET` | 32+ random characters |
| `TRUST_PROXY` | `2` (Vercel, then Render) to start with; verify in step 7 |
| `APP_TIMEZONE` | `Asia/Kolkata` (or your zone; "today" and the daily scan use it) |
| `RETENTION_DAYS` | `30` |
| `CORS_ORIGINS` | leave empty (the frontend reaches the API through Vercel, same origin) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | your mail provider. Required: in production the scan fails loudly without it |
| `NODE_VERSION` | optional, `22` |

SMTP examples: **Resend** `smtp.resend.com`, port `465`, user `resend`, password = API key, `SMTP_FROM` on a domain you verified. **Gmail** `smtp.gmail.com`, port `587`, user = your address, password = an app password.

Deploy. The start command runs `prisma migrate deploy` first, then the server. Watch the logs for `Server is running on port ...`. Open `https://<your-api>.onrender.com/api/health`: expect `"status":"ok","database":"connected"`.

## 3. Create the admin account (once)

Never run the seed against production. The free Render plan has no shell, so run this on your own machine, after the first deploy has applied the migrations:

```bash
cd backend
DATABASE_URL="<direct Neon string>" ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="at least 12 characters" npm run db:create-admin
```

Re-running it with the same email resets that account's password.

## 4. Frontend on Vercel

1. If the API URL is not `https://compliancedocumenttracker.onrender.com`, edit `frontend/vercel.json` and replace that host in both rewrites (`/api/:path*` and `/api-docs/:path*`), commit and push.
2. Vercel, Add New, Project, import the repo.
3. Settings:

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Include source files outside of the Root Directory | **on** (needed so the root `package-lock.json` and workspaces install) |
| Install Command | leave default (npm, from the root lockfile) |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` |
| Node.js Version | **22.x** (Vite 7 needs Node 20.19 or newer) |
| Environment variables | none needed |

4. Deploy. `vercel.json` rewrites `/api/*` to Render and every other path to `index.html` (so deep links like `/documents` work).

If the first sign-in after idle time fails because the free Render service was asleep, retry once; see step 6.

## 5. Mail check

Sign in, open Overview, press **Run scan**. A success toast means mail went through; an error toast names the reason (for example `SMTP_HOST is not configured` or a connection error). Nothing is marked as sent when the scan fails, so you can fix settings and run it again.

## 6. Daily scan on a sleeping host (cron-job.org)

Free Render services sleep, and an in-process scheduler cannot fire while asleep. The API also runs a catch-up scan 15 seconds after every start, but use an external scheduler:

1. cron-job.org, create a job:
   * URL: `https://<your-api>.onrender.com/api/services/cron/run`
   * Method: `POST`
   * Header: `x-cron-secret: <your CRON_SECRET>`
   * Schedule: daily (e.g. 00:05 in your time zone)
2. Optional keep-warm job: `GET https://<your-api>.onrender.com/api/health` every 10 minutes. This also reduces the ~50 s cold start.
3. Run the job once; expect HTTP 200. A `502` means the mail server or a send failed (the response body says which).

## 7. Verify the live site

* [ ] `/api/health` returns `ok` and `connected`.
* [ ] Sign in works; the Audit log shows the sign-in.
* [ ] **Proxy hops:** sign in once with a wrong password, then open Audit log and read the IP address on the "Failed sign-in" row. It must be **your** public IP. If it is a Vercel or Render address, `TRUST_PROXY` is too low; if it looks wrong or changes oddly, adjust it (1, 2 or 3) and redeploy. This matters: the login rate limit and the audit trail both use that address.
* [ ] Add a document with a PDF, download it, edit it, move it to Trash, restore it.
* [ ] `/api-docs` loads the Swagger page.
* [ ] Run scan: success toast; Reminders page lists any emails sent.
* [ ] The theme toggle works and follows the OS by default.
* [ ] Old documents from before the migration show "No PDF stored. Re-upload it via Edit" (expected; their files were on the old disk).

## 8. Rollback

* **API:** Render, Events/Deploys, redeploy the previous successful deploy.
* **Frontend:** Vercel, Deployments, promote the previous deployment.
* **Database:** migrations are forward-only. If you must go back, restore from the snapshot or Neon branch from step 0 (and redeploy the older API against it). Do not run an old API against the migrated schema.

## Common problems

| Symptom | Cause and fix |
|---|---|
| Render deploy fails at start: `JWT_SECRET must be set` | Missing or under 32 characters. Set it. |
| Deploy hangs on `prisma migrate deploy` | You used the pooled Neon URL. Use the direct one. |
| `ECONNREFUSED` / SSL error to the database | Add `?sslmode=require` to `DATABASE_URL`. |
| Everyone gets "Too many login attempts" | `TRUST_PROXY` too low, so all users share the proxy's IP. Raise it (step 7). |
| Sign-in spins ~50 s then works | Render cold start. Add the keep-warm job. |
| `/documents` gives 404 on Vercel | `vercel.json` missing from the deployed root directory; it must be at `frontend/vercel.json` with Root Directory `frontend`. |
| Vercel build fails on Vite or Node version | Set Node.js Version to 22.x. |
| `/api/...` returns the Vercel 404 page | The rewrite destination in `vercel.json` points at the wrong Render URL. |
