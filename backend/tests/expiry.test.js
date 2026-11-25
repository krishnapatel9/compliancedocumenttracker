// Regression tests for the date and alert bugs (audit A-1, A-2, A-3, A-4).
// Run with: npm test   (uses Node's built-in test runner, no extra packages)
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { toDateOnly, todayDateOnly, addDays, daysBetween, formatDateOnly } = require('../src/utils/dates');
const { computeStatus, statusWhere } = require('../src/utils/documentStatus');
const { pickThreshold, buildEmail } = require('../src/services/expiryRules');

// --- A-1: calendar dates never shift with the server's time zone ----------

test('YYYY-MM-DD is stored as that same calendar day (no IST off-by-one)', () => {
    const d = toDateOnly('2026-12-01');
    assert.equal(d.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal(formatDateOnly(d), '2026-12-01');
});

test('ISO strings and Prisma DATE values keep their calendar day', () => {
    assert.equal(formatDateOnly(toDateOnly('2026-12-01T00:00:00.000Z')), '2026-12-01');
    assert.equal(formatDateOnly(toDateOnly(new Date('2026-12-01T00:00:00.000Z'))), '2026-12-01');
});

test('invalid dates are rejected', () => {
    assert.equal(toDateOnly('2026-02-31'), null);
    assert.equal(toDateOnly('not a date'), null);
    assert.equal(toDateOnly(''), null);
});

test('"today" follows the business time zone, not UTC', () => {
    // 20:00 UTC on Nov 30 is already 01:30 on Dec 1 in India
    const now = new Date('2026-11-30T20:00:00Z');
    assert.equal(formatDateOnly(todayDateOnly(now, 'Asia/Kolkata')), '2026-12-01');
    assert.equal(formatDateOnly(todayDateOnly(now, 'UTC')), '2026-11-30');
});

// --- Status boundaries agree between computeStatus and the DB filter -------

test('status boundaries: -1 expired, 0 and 30 expiring soon, 31 active', () => {
    const today = toDateOnly('2026-11-21');
    const statusIn = (days) => computeStatus(addDays(today, days), today);

    assert.deepEqual(statusIn(-1), { status: 'expired', daysRemaining: -1 });
    assert.deepEqual(statusIn(0), { status: 'expiring_soon', daysRemaining: 0 });
    assert.deepEqual(statusIn(30), { status: 'expiring_soon', daysRemaining: 30 });
    assert.deepEqual(statusIn(31), { status: 'active', daysRemaining: 31 });
});

test('statusWhere filters match computeStatus at the boundaries', () => {
    const today = toDateOnly('2026-11-21');
    const matches = (where, date) =>
        (!where.lt || date < where.lt) &&
        (!where.gt || date > where.gt) &&
        (!where.gte || date >= where.gte) &&
        (!where.lte || date <= where.lte);

    for (const days of [-5, -1, 0, 1, 29, 30, 31, 90]) {
        const date = addDays(today, days);
        const { status } = computeStatus(date, today);
        assert.ok(matches(statusWhere(status, today), date), `day ${days} should match its own filter (${status})`);
        for (const other of ['expired', 'expiring_soon', 'active'].filter((s) => s !== status)) {
            assert.ok(!matches(statusWhere(other, today), date), `day ${days} must not match ${other}`);
        }
    }
});

// --- A-2: warnings are state-based, not "exactly on day 30 / 7" -----------

test('pickThreshold returns the most urgent threshold crossed', () => {
    assert.equal(pickThreshold(45), null);
    assert.equal(pickThreshold(31), null);
    assert.equal(pickThreshold(30), 30);
    assert.equal(pickThreshold(20), 30); // uploaded late or cron missed day 30
    assert.equal(pickThreshold(15), 15);
    assert.equal(pickThreshold(10), 15);
    assert.equal(pickThreshold(7), 7);
    assert.equal(pickThreshold(5), 7);   // uploaded with 5 days left still gets warned
    assert.equal(pickThreshold(0), 0);
    assert.equal(pickThreshold(-10), 0); // already expired gets an expiry alert
});

test('daysBetween counts whole calendar days', () => {
    assert.equal(daysBetween(toDateOnly('2026-11-21'), toDateOnly('2026-12-21')), 30);
    assert.equal(daysBetween(toDateOnly('2026-11-21'), toDateOnly('2026-11-20')), -1);
});

test('expiry emails describe the real timing', () => {
    const doc = {
        title: 'ISO Certificate',
        category: 'certificate',
        issueDate: toDateOnly('2025-01-01'),
        expiryDate: toDateOnly('2026-11-26'),
        description: null,
    };
    assert.match(buildEmail(doc, 7, 5).subject, /expires in 5 day/);
    assert.match(buildEmail(doc, 0, -3).subject, /has expired/);
    assert.match(buildEmail(doc, 0, -3).text, /expired 3 day\(s\) ago/);
    assert.match(buildEmail(doc, 30, 20).text, /Expiry Date:  2026-11-26/);
});

// --- Audit date filters use business-time-zone days, not UTC days -----------

const { zonedDayStart } = require('../src/utils/dates');

test('zonedDayStart returns the instant a local calendar day begins', () => {
    assert.equal(zonedDayStart('2026-11-25', 'Asia/Kolkata').toISOString(), '2026-11-24T18:30:00.000Z');
    assert.equal(zonedDayStart('2026-11-25', 'UTC').toISOString(), '2026-11-25T00:00:00.000Z');
    // New York: EST (UTC-5) before the March change, EDT (UTC-4) after it
    assert.equal(zonedDayStart('2026-03-08', 'America/New_York').toISOString(), '2026-03-08T05:00:00.000Z');
    assert.equal(zonedDayStart('2026-03-09', 'America/New_York').toISOString(), '2026-03-09T04:00:00.000Z');
    assert.equal(zonedDayStart('not a date', 'UTC'), null);
});
