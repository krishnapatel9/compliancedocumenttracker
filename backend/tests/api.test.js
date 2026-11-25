// Integration tests: need a throwaway Postgres with migrations applied.
//   DATABASE_URL=postgresql://... npx prisma migrate deploy && npm test
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.CRON_SECRET = 'cron-secret-for-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

let app, prisma, token;
const { buildSamplePdf } = require('../src/utils/samplePdf');
const { addDays, formatDateOnly, todayDateOnly } = require('../src/utils/dates');

const day = (n) => formatDateOnly(addDays(todayDateOnly(), n));
const auth = () => ({ Authorization: `Bearer ${token}` });
const pdf = buildSamplePdf(['Test document']);

const create = (over = {}) =>
    request(app).post('/api/documents').set(auth())
        .field('title', over.title || 'Test Permit')
        .field('category', over.category || 'permit')
        .field('issueDate', over.issueDate || day(-10))
        .field('expiryDate', over.expiryDate || day(200))
        .field('notifyEmail', 'owner@example.com')
        .attach('file', over.file || pdf, { filename: 'a.pdf', contentType: 'application/pdf' });

test.before(async () => {
    if (skip) return;
    prisma = require('../src/db');
    app = require('../src/app').createApp();
    await prisma.notification.deleteMany();
    await prisma.frameworkControl.deleteMany();
    await prisma.document.deleteMany();
    await prisma.admin.deleteMany();
    await prisma.admin.create({ data: { email: 'admin@test.com', passwordHash: await bcrypt.hash('correct-password', 4) } });
    const res = await request(app).post('/api/auth/login').send({ email: 'Admin@Test.com', password: 'correct-password' });
    token = res.body.token;
});
test.after(async () => { if (prisma) await prisma.$disconnect(); });

test('login rejects bad credentials and accepts good ones', { skip }, async () => {
    assert.ok(token);
    const bad = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope' });
    assert.equal(bad.status, 401);
    const none = await request(app).post('/api/auth/login').send({});
    assert.equal(none.status, 400);
});

test('protected routes need a token', { skip }, async () => {
    assert.equal((await request(app).get('/api/documents')).status, 401);
    assert.equal((await request(app).get('/api/dashboard')).status, 401);
});

test('errors are JSON, never HTML', { skip }, async () => {
    const nf = await request(app).get('/api/nope');
    assert.equal(nf.status, 404);
    assert.match(nf.headers['content-type'], /json/);
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    assert.equal(bad.status, 400);
    assert.match(bad.headers['content-type'], /json/);
});

test('document lifecycle stores the PDF in the database', { skip }, async () => {
    const created = await create();
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const doc = created.body.document;
    assert.equal(doc.hasFile, true);
    assert.equal(doc.status, 'active');
    assert.equal(doc.file.data, undefined);
    assert.equal(doc.filePath, undefined);

    const list = await request(app).get('/api/documents?search=permit').set(auth());
    assert.equal(list.status, 200);
    assert.equal(list.body.items[0].file.data, undefined);

    const dl = await request(app).get(`/api/documents/${doc.id}/file`).set(auth()).buffer().parse((r, cb) => {
        const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(dl.status, 200);
    assert.deepEqual(dl.body, pdf);

    const upd = await request(app).put(`/api/documents/${doc.id}`).set(auth())
        .field('title', 'Renamed Permit')
        .attach('file', buildSamplePdf(['v2']), { filename: 'b.pdf', contentType: 'application/pdf' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.document.title, 'Renamed Permit');

    // Delete is soft: the document and its file wait in the trash.
    const del = await request(app).delete(`/api/documents/${doc.id}`).set(auth());
    assert.equal(del.status, 200);
    assert.ok(del.body.restorableUntil);
    assert.equal(await prisma.documentFile.count({ where: { documentId: doc.id } }), 1);
    assert.equal((await request(app).delete(`/api/documents/${doc.id}`).set(auth())).status, 404);

    // Permanent deletion only works from the trash, and removes the file with it.
    const purge = await request(app).delete(`/api/documents/${doc.id}/permanent`).set(auth());
    assert.equal(purge.status, 200);
    assert.equal(await prisma.documentFile.count({ where: { documentId: doc.id } }), 0);
    assert.equal((await request(app).delete(`/api/documents/${doc.id}/permanent`).set(auth())).status, 404);
});

test('bad input is a 4xx, never a 500', { skip }, async () => {
    for (const q of ['limit=x', 'limit=100000', 'page=0', 'category=bogus', 'status=bogus', 'sort=password']) {
        const r = await request(app).get(`/api/documents?${q}`).set(auth());
        assert.equal(r.status, 400, q);
    }
    assert.equal((await request(app).get('/api/documents/not-a-uuid').set(auth())).status, 404);

    const notPdf = await create({ file: Buffer.from('hello world') });
    assert.equal(notPdf.status, 400);
    const big = await create({ file: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(6 * 1024 * 1024)]) });
    assert.equal(big.status, 413);
    const dates = await create({ issueDate: day(5), expiryDate: day(50) });
    assert.equal(dates.status, 400);
});

test('framework link validates the control and is idempotent', { skip }, async () => {
    const doc = (await create({ title: 'Policy Doc' })).body.document;
    const link = (body) => request(app).post('/api/frameworks/link').set(auth()).send(body);
    assert.equal((await link({ framework: 'SOC2', controlCode: 'NOPE', documentId: doc.id })).status, 400);
    assert.equal((await link({ framework: 'SOC2', controlCode: 'CC1.1', documentId: 'x' })).status, 400);
    assert.equal((await link({ framework: 'SOC2', controlCode: 'CC1.1', documentId: doc.id })).status, 200);
    assert.equal((await link({ framework: 'SOC2', controlCode: 'CC1.1', documentId: doc.id })).status, 200);
    assert.equal(await prisma.frameworkControl.count({ where: { framework: 'SOC2', controlCode: 'CC1.1' } }), 1);
});

test('dashboard counts agree with document statuses', { skip }, async () => {
    await prisma.document.deleteMany();
    await create({ title: 'Expired One', issueDate: day(-400), expiryDate: day(-5) });
    await create({ title: 'Soon One', issueDate: day(-100), expiryDate: day(5) });
    await create({ title: 'Active One', issueDate: day(-100), expiryDate: day(100) });
    const r = await request(app).get('/api/dashboard').set(auth());
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 3);
    assert.equal(r.body.expired, 1);
    assert.equal(r.body.expiringSoon, 1);
    assert.equal(r.body.active, 1);
    assert.equal(r.body.expiring7d, 1);
    assert.equal(r.body.monthlyUploads.length, 6);
    assert.equal(r.body.monthlyUploads.reduce((n, m) => n + m.count, 0), 3);
});

test('expiry scan sends once, dedupes, and does not swallow SMTP failures', { skip }, async () => {
    const { checkExpiries } = require('../src/services/cronService');
    await prisma.notification.deleteMany();
    const first = await checkExpiries();
    assert.equal(first.success, true);
    assert.equal(first.sentCount, 2); // expired + expiring in 5 days
    const second = await checkExpiries();
    assert.equal(second.sentCount, 0);
    assert.equal(second.skippedDuplicates.length, 2);

    // Configured but unreachable SMTP must fail loudly and leave no claimed notification behind.
    await prisma.notification.deleteMany();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';
    try {
        const broken = await checkExpiries();
        assert.equal(broken.success, false);
        assert.equal(broken.sentCount, 0);
        assert.equal(await prisma.notification.count(), 0);
    } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_PORT;
    }
});

test('cron run route needs the shared secret and reports failures with non-200', { skip }, async () => {
    assert.equal((await request(app).post('/api/services/cron/run')).status, 401);
    assert.equal((await request(app).post('/api/services/cron/run').set('x-cron-secret', 'wrong')).status, 401);
    assert.equal((await request(app).post('/api/services/cron/run').set('x-cron-secret', process.env.CRON_SECRET)).status, 200);
});

test('validation errors keep the { details: { field: [messages] } } shape', { skip }, async () => {
    const r = await request(app).post('/api/documents').set(auth())
        .field('title', 'ab')
        .field('category', 'nonsense')
        .field('issueDate', 'not-a-date')
        .field('expiryDate', day(100))
        .field('notifyEmail', 'not-an-email')
        .attach('file', pdf, { filename: 'a.pdf', contentType: 'application/pdf' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'Validation failed');
    for (const field of ['title', 'category', 'issueDate', 'notifyEmail']) {
        assert.ok(Array.isArray(r.body.details[field]) && typeof r.body.details[field][0] === 'string', `details.${field}`);
    }
    assert.equal(r.body.details.title[0], 'Title must be between 3 and 150 characters');
    assert.equal(r.body.details.notifyEmail[0], 'Invalid notify email address');
});

// A minimal SMTP server, so the real nodemailer transport (verify + send) is exercised.
const net = require('node:net');
const startFakeSmtp = () => new Promise((resolve) => {
    const messages = [];
    const server = net.createServer((socket) => {
        let inData = false;
        let buf = '';
        let current = { to: [], data: '' };
        socket.write('220 fake ESMTP\r\n');
        socket.on('data', (chunk) => {
            buf += chunk.toString();
            if (inData) {
                if (buf.includes('\r\n.\r\n')) {
                    current.data = buf.split('\r\n.\r\n')[0];
                    messages.push(current);
                    current = { to: [], data: '' };
                    inData = false; buf = '';
                    socket.write('250 queued\r\n');
                }
                return;
            }
            let idx;
            while ((idx = buf.indexOf('\r\n')) !== -1) {
                const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
                const cmd = line.toUpperCase();
                if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) socket.write('250-fake\r\n250 SIZE 10485760\r\n');
                else if (cmd.startsWith('MAIL FROM')) socket.write('250 ok\r\n');
                else if (cmd.startsWith('RCPT TO')) { current.to.push(line.slice(8).replace(/[<>]/g, '').trim()); socket.write('250 ok\r\n'); }
                else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); break; }
                else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
                else socket.write('250 ok\r\n');
            }
        });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, messages, port: server.address().port }));
});

// Decodes RFC 2047 "encoded words" (the subject contains an emoji, so nodemailer encodes it).
const subjectOf = (raw) => {
    const unfolded = raw.replace(/\r\n[ \t]+/g, ' ');
    const line = unfolded.split('\r\n').find((l) => l.startsWith('Subject: ')).slice(9);
    const joined = line.replace(/\?=\s+=\?UTF-8\?Q\?/g, '');
    return joined.replace(/=\?UTF-8\?Q\?(.*?)\?=/g, (_, q) =>
        Buffer.from(q.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'));
};

test('expiry scan delivers real emails through SMTP (nodemailer transport)', { skip }, async () => {
    const { checkExpiries } = require('../src/services/cronService');
    await prisma.notification.deleteMany();
    const smtp = await startFakeSmtp();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.port);
    try {
        const res = await checkExpiries();
        assert.equal(res.success, true, JSON.stringify(res));
        assert.equal(res.sentCount, 2);
        assert.equal(smtp.messages.length, 2);
        assert.ok(smtp.messages.every((m) => m.to.includes('owner@example.com')));
        const subjects = smtp.messages.map((m) => subjectOf(m.data));
        assert.ok(subjects.some((t) => /Expired One.*has expired/.test(t)), subjects.join(' | '));
        assert.ok(subjects.some((t) => /Soon One.*expires in 5 day/.test(t)), subjects.join(' | '));
        assert.equal(await prisma.notification.count(), 2);
    } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_PORT;
        await new Promise((r) => smtp.server.close(r));
    }
});
