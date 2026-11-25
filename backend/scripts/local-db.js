/**
 * Local development database, no Docker or system install needed.
 * Runs a real PostgreSQL 17 server from node_modules (embedded-postgres),
 * with data kept in backend/.pgdata (git-ignored).
 *
 *   npm run db:local     start it (leave this terminal open; Ctrl+C stops it)
 *
 * User, password, port and database name are read from DATABASE_URL in
 * backend/.env, so the server matches what the app connects to. It refuses to
 * run if DATABASE_URL points anywhere but localhost (e.g. the live Neon DB).
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const EmbeddedPostgres = require('embedded-postgres').default;

const DATA_DIR = path.join(__dirname, '..', '.pgdata');

const url = new URL(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/compliance_tracker');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    console.error(`[local-db] DATABASE_URL points at ${url.hostname}, not localhost. Refusing to start a local server for a remote database.`);
    process.exit(1);
}
const USER = decodeURIComponent(url.username || 'postgres');
const PASSWORD = decodeURIComponent(url.password || 'postgres');
const PORT = Number(url.port || 5432);
const DB_NAME = url.pathname.replace(/^\//, '') || 'compliance_tracker';

const main = async () => {
    const firstRun = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));

    const pg = new EmbeddedPostgres({
        databaseDir: DATA_DIR,
        user: USER,
        password: PASSWORD,
        port: PORT,
        persistent: true,
        onLog: () => {},
    });

    if (firstRun) {
        console.log('[local-db] First run: initialising data directory...');
        await pg.initialise();
    }

    await pg.start();

    try {
        await pg.createDatabase(DB_NAME);
        console.log(`[local-db] Created database "${DB_NAME}"`);
    } catch (err) {
        if (!/already exists/i.test(String(err && err.message))) throw err;
    }

    console.log(`[local-db] PostgreSQL ready on postgresql://${USER}:***@localhost:${PORT}/${DB_NAME}`);
    console.log('[local-db] Next (in another terminal): npm run prisma:migrate && npm run db:seed');
    console.log('[local-db] Press Ctrl+C to stop.');

    let stopping = false;
    const stop = async () => {
        if (stopping) return;
        stopping = true;
        console.log('\n[local-db] Stopping...');
        await pg.stop();
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
};

main().catch((err) => {
    console.error('[local-db] Failed to start:', err);
    process.exit(1);
});
