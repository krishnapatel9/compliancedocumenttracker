// Soft delete, retention and the audit trail. Needs a throwaway Postgres (see api.test.js).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.CRON_SECRET = 'cron-secret-for-tests';
process.env.RETENTION_DAYS = '30';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

let app, prisma, token, adminId;
const { buildSamplePdf } = require('../src/utils/samplePdf');
const { addDays, formatDateOnly, todayDateOnly } = require('../src/utils/dates');

const day = (n) => formatDateOnly(addDays(todayDateOnly(), n));
const auth = () => ({ Authorization: `Bearer ${token}` });
const pdf = buildSamplePdf(['Audit test']);

const create = (title, over = {}) =>
    request(app).post('/api/documents').set(auth())
        .field('title', title)
        .field('category', 'insurance')
        .field('issueDate', day(-30))
        .field('expiryDate', over.expiryDate || day(5))
        .field('notifyEmail', 'audit@example.com')
        .attach('file', pdf, { filename: 'a.pdf', contentType: 'application/pdf' });

const trail = async (entityId) =>
    (await request(app).get(`/api/audit-logs?entityId=${entityId}&limit=100`).set(auth())).body.items;

test.before(async () => {
    if (skip) return;
    prisma = require('../src/db');
    app = require('../src/app').createApp();
    await prisma.notification.deleteMany();
    await prisma.frameworkControl.deleteMany();
    await prisma.document.deleteMany();
    await prisma.admin.deleteMany();
    const admin = await prisma.admin.create({ data: { email: 'auditor@test.com', passwordHash: await bcrypt.hash('correct-password', 4) } });
    adminId = admin.id;
    const res = await request(app).post('/api/auth/login').send({ email: 'auditor@test.com', password: 'correct-password' });
    token = res.body.token;
});
test.after(async () => { if (prisma) await prisma.$disconnect(); });

test('logins are recorded, successful and failed', { skip }, async () => {
    await request(app).post('/api/auth/login').send({ email: 'auditor@test.com', password: 'wrong' });
    const res = await request(app).get('/api/audit-logs?actor=auditor@test.com&limit=100').set(auth());
    const actions = res.body.items.map((e) => e.action);
    assert.ok(actions.includes('LOGIN_SUCCESS'));
    const failed = res.body.items.find((e) => e.action === 'LOGIN_FAILED');
    assert.ok(failed);
    assert.equal(failed.details.reason, 'wrong password');
    assert.equal(failed.actorId, null);
    const ok = res.body.items.find((e) => e.action === 'LOGIN_SUCCESS');
    assert.equal(ok.actorId, adminId);
    assert.equal(JSON.stringify(res.body).includes('correct-password'), false);
});

test('document lifecycle leaves a complete trail with field-level diffs', { skip }, async () => {
    const doc = (await create('Fire Policy')).body.document;

    await request(app).put(`/api/documents/${doc.id}`).set(auth())
        .field('expiryDate', day(400)).field('notifyEmail', 'new@example.com');
    await request(app).put(`/api/documents/${doc.id}`).set(auth()).field('title', 'Fire Policy'); // no change: no entry
    await request(app).get(`/api/documents/${doc.id}/file`).set(auth());
    await request(app).delete(`/api/documents/${doc.id}`).set(auth());
    await request(app).post(`/api/documents/${doc.id}/restore`).set(auth());

    const entries = await trail(doc.id);
    assert.deepEqual(entries.map((e) => e.action).reverse(),
        ['DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'DOCUMENT_DOWNLOADED', 'DOCUMENT_DELETED', 'DOCUMENT_RESTORED']);
    assert.ok(entries.every((e) => e.actorEmail === 'auditor@test.com' && e.actorId === adminId && e.documentTitle === 'Fire Policy'));

    const upd = entries.find((e) => e.action === 'DOCUMENT_UPDATED');
    assert.deepEqual(upd.details.changes, {
        expiryDate: { from: day(5), to: day(400) },
        notifyEmail: { from: 'audit@example.com', to: 'new@example.com' }
    });
    assert.equal(upd.details.fileReplaced, false);
});

test('soft-deleted documents disappear everywhere and come back on restore', { skip }, async () => {
    await prisma.notification.deleteMany();
    const keep = (await create('Keeper', { expiryDate: day(200) })).body.document;
    const gone = (await create('Trashed Permit', { expiryDate: day(-3) })).body.document; // expired: would trigger an alert

    const before = (await request(app).get('/api/dashboard').set(auth())).body;
    await request(app).delete(`/api/documents/${gone.id}`).set(auth());
    const after = (await request(app).get('/api/dashboard').set(auth())).body;
    assert.equal(after.total, before.total - 1);
    assert.equal(after.expired, before.expired - 1);

    const live = (await request(app).get('/api/documents?limit=100').set(auth())).body.items.map((d) => d.id);
    assert.ok(live.includes(keep.id) && !live.includes(gone.id));
    assert.equal((await request(app).get(`/api/documents/${gone.id}`).set(auth())).status, 404);
    assert.equal((await request(app).get(`/api/documents/${gone.id}/file`).set(auth())).status, 404);
    assert.equal((await request(app).put(`/api/documents/${gone.id}`).set(auth()).field('title', 'Nope')).status, 404);

    const trashList = (await request(app).get('/api/documents?trash=true').set(auth())).body.items;
    const inTrash = trashList.find((d) => d.id === gone.id);
    assert.ok(inTrash && inTrash.deletedAt && inTrash.purgeAt);
    assert.ok(!trashList.some((d) => d.id === keep.id));

    // The expiry scan ignores trashed documents.
    const { checkExpiries } = require('../src/services/cronService');
    const scan = await checkExpiries();
    assert.ok(!scan.emailsSent.some((e) => e.id === gone.id));

    // A control linked to a trashed document shows as unlinked, and trashed documents cannot be linked.
    assert.equal((await request(app).post('/api/frameworks/link').set(auth()).send({ framework: 'GDPR', controlCode: 'Article 5', documentId: gone.id })).status, 404);

    const restored = await request(app).post(`/api/documents/${gone.id}/restore`).set(auth());
    assert.equal(restored.status, 200);
    assert.equal(restored.body.document.deletedAt, null);
    assert.equal((await request(app).post(`/api/documents/${gone.id}/restore`).set(auth())).status, 404);
    assert.equal((await request(app).get(`/api/documents/${gone.id}`).set(auth())).status, 200);
});

test('retention purges old trash, keeps recent trash, and records who did it', { skip }, async () => {
    const { purgeExpiredTrash } = require('../src/services/retention');
    const old = (await create('Old Trash')).body.document;
    const recent = (await create('Recent Trash')).body.document;
    await request(app).delete(`/api/documents/${old.id}`).set(auth());
    await request(app).delete(`/api/documents/${recent.id}`).set(auth());
    await prisma.document.update({ where: { id: old.id }, data: { deletedAt: new Date(Date.now() - 31 * 86400000) } });

    const result = await purgeExpiredTrash();
    assert.equal(result.purged, 1);
    assert.equal(await prisma.document.count({ where: { id: old.id } }), 0);
    assert.equal(await prisma.documentFile.count({ where: { documentId: old.id } }), 0);
    assert.equal(await prisma.document.count({ where: { id: recent.id } }), 1);

    // The trail outlives the document and still names it.
    const entries = await trail(old.id);
    const purged = entries.find((e) => e.action === 'DOCUMENT_PURGED');
    assert.ok(purged);
    assert.equal(purged.actorEmail, 'system');
    assert.equal(purged.documentTitle, 'Old Trash');
    assert.equal(entries.filter((e) => e.action === 'DOCUMENT_CREATED').length, 1);
});

test('framework links and expiry scans are audited', { skip }, async () => {
    const doc = (await create('Policy Evidence', { expiryDate: day(300) })).body.document;
    const link = (documentId) => request(app).post('/api/frameworks/link').set(auth()).send({ framework: 'SOC2', controlCode: 'CC6.1', documentId });
    await link(doc.id);
    await link(null);
    const entries = await trail(doc.id);
    const linked = entries.find((e) => e.action === 'FRAMEWORK_LINKED');
    assert.equal(linked.details.controlCode, 'CC6.1');
    assert.ok(entries.find((e) => e.action === 'FRAMEWORK_UNLINKED'));

    await request(app).post('/api/services/cron/trigger').set(auth());
    await request(app).post('/api/services/cron/run').set('x-cron-secret', process.env.CRON_SECRET);
    const scans = (await request(app).get('/api/audit-logs?action=EXPIRY_SCAN_RUN&limit=10').set(auth())).body.items;
    assert.ok(scans.some((e) => e.actorEmail === 'auditor@test.com'));
    assert.ok(scans.some((e) => e.actorEmail === 'system (external scheduler)'));
    assert.equal(typeof scans[0].details.success, 'boolean');
});

test('the audit trail is append-only, even for the application itself', { skip }, async () => {
    const entry = await prisma.auditLog.findFirst();
    assert.ok(entry);
    await assert.rejects(prisma.auditLog.update({ where: { id: entry.id }, data: { actorEmail: 'tampered' } }), /append-only/);
    await assert.rejects(prisma.auditLog.delete({ where: { id: entry.id } }), /append-only/);
    await assert.rejects(prisma.auditLog.deleteMany(), /append-only/);
    await assert.rejects(prisma.$executeRawUnsafe('TRUNCATE TABLE audit_logs'), /append-only/);
    assert.equal(await prisma.auditLog.count({ where: { id: entry.id } }), 1);
});

test('audit log API validates filters and paginates', { skip }, async () => {
    assert.equal((await request(app).get('/api/audit-logs')).status, 401);
    for (const q of ['action=BOGUS', 'limit=1000', 'page=0', 'from=yesterday']) {
        assert.equal((await request(app).get(`/api/audit-logs?${q}`).set(auth())).status, 400, q);
    }
    const p1 = (await request(app).get('/api/audit-logs?limit=2&page=1').set(auth())).body;
    const p2 = (await request(app).get('/api/audit-logs?limit=2&page=2').set(auth())).body;
    assert.equal(p1.items.length, 2);
    assert.notEqual(p1.items[0].id, p2.items[0].id);
    assert.ok(p1.totalItems > 4);
    const today = (await request(app).get(`/api/audit-logs?from=${day(0)}&to=${day(0)}&limit=1`).set(auth())).body;
    assert.ok(today.totalItems >= 1);
    const future = (await request(app).get(`/api/audit-logs?from=${day(10)}`).set(auth())).body;
    assert.equal(future.totalItems, 0);
});
