const nodemailer = require('nodemailer');
const cron = require('node-cron');
const prisma = require('../db');
const { isProduction } = require('../config');
const { toDateOnly, todayDateOnly, addDays, daysBetween } = require('../utils/dates');
const { THRESHOLDS, pickThreshold, buildEmail } = require('./expiryRules');
const { record, SYSTEM_ACTOR } = require('./audit');
const { purgeExpiredTrash } = require('./retention');

const isUniqueViolation = (err) => err && err.code === 'P2002';

// Console transport for local development only (no SMTP configured, not production).
const consoleTransport = {
    sendMail: async (options) => {
        console.log(`[SMTP EMAIL MOCK] To: ${options.to}\nSubject: ${options.subject}\n${options.text}\n`);
        return { messageId: 'console-mock-transport-id' };
    }
};

/**
 * Real SMTP transport, or the console mock when SMTP is not configured outside production.
 * A configured-but-broken SMTP server is an error: falling back to the mock would mark the
 * warning as sent and the real email would never be delivered or retried.
 */
const getTransporter = async () => {
    if (!process.env.SMTP_HOST) {
        if (isProduction()) throw new Error('SMTP_HOST is not configured; refusing to run expiry alerts without a mail server.');
        return consoleTransport;
    }

    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    await transport.verify();
    return transport;
};

// A scan that cannot be recorded must not stop reminders from going out.
const auditScan = (actor, details) =>
    record(null, actor, { action: 'EXPIRY_SCAN_RUN', entityType: 'system', details })
        .catch((err) => console.error('[AUDIT] Could not record scan:', err.message));

const scanState = { running: false, lastRunAt: null, lastSuccessAt: null, lastError: null };

/** Status of the most recent scan, exposed on /api/health. */
const getScanStatus = () => ({ ...scanState });

/**
 * Sends at most one warning per document, expiry date and threshold.
 * Never throws: a failure is reported in the result so callers can respond with a non-200.
 */
const checkExpiries = async (actor = SYSTEM_ACTOR) => {
    const emailsSent = [];
    const skippedDuplicates = [];
    const failed = [];

    if (scanState.running) {
        return { success: false, error: 'A scan is already running', scannedThresholds: THRESHOLDS, sentCount: 0, emailsSent, skippedDuplicates, failed };
    }
    scanState.running = true;
    scanState.lastRunAt = new Date();

    try {
        const today = todayDateOnly();
        const transporter = await getTransporter();

        // Everything inside the widest window, including already-expired documents
        const documents = await prisma.document.findMany({
            where: { deletedAt: null, expiryDate: { lte: addDays(today, Math.max(...THRESHOLDS)) } }
        });

        for (const doc of documents) {
            const daysRemaining = daysBetween(today, toDateOnly(doc.expiryDate));
            const threshold = pickThreshold(daysRemaining);
            if (threshold === null) continue;

            const key = { documentId: doc.id, expiryDate: toDateOnly(doc.expiryDate), daysBefore: threshold };

            try {
                // Claim the warning first; the unique key makes this atomic across concurrent scans.
                let claim;
                try {
                    claim = await prisma.notification.create({ data: key });
                } catch (err) {
                    if (isUniqueViolation(err)) {
                        skippedDuplicates.push({ id: doc.id, title: doc.title, daysBefore: threshold });
                        continue;
                    }
                    throw err;
                }

                const { subject, text } = buildEmail(doc, threshold, daysRemaining);
                try {
                    await transporter.sendMail({
                        from: process.env.SMTP_FROM || '"DocShield Expiry Reminders" <compliance@docshield.local>',
                        to: doc.notifyEmail,
                        subject,
                        text
                    });
                    emailsSent.push({ id: doc.id, title: doc.title, email: doc.notifyEmail, daysBefore: threshold });
                } catch (mailErr) {
                    // Release the claim so the next scan retries this warning
                    await prisma.notification.delete({ where: { id: claim.id } }).catch(() => {});
                    throw mailErr;
                }
            } catch (docErr) {
                // One bad document must not stop the alerts for the rest.
                failed.push({ id: doc.id, title: doc.title, daysBefore: threshold, error: docErr.message });
                console.error(`[MAIL SERVICE] Failed to process "${doc.title}":`, docErr.message);
            }
        }

        const success = failed.length === 0;
        scanState.lastError = success ? null : `${failed.length} warning(s) failed`;
        if (success) scanState.lastSuccessAt = new Date();
        await auditScan(actor, { success, sent: emailsSent.length, duplicates: skippedDuplicates.length, failed: failed.length });
        return { success, scannedThresholds: THRESHOLDS, sentCount: emailsSent.length, emailsSent, skippedDuplicates, failed };
    } catch (err) {
        scanState.lastError = err.message;
        console.error('[CRON SUPERVISOR] Scan failed:', err.message);
        await auditScan(actor, { success: false, sent: emailsSent.length, duplicates: skippedDuplicates.length, failed: failed.length, error: err.message });
        return { success: false, error: err.message, scannedThresholds: THRESHOLDS, sentCount: emailsSent.length, emailsSent, skippedDuplicates, failed };
    } finally {
        scanState.running = false;
    }
};

const logResult = (label, stats) =>
    console.log(`[CRON SUPERVISOR] ${label}: success=${stats.success} sent=${stats.sentCount} duplicates=${stats.skippedDuplicates.length} failed=${stats.failed.length}${stats.error ? ` error=${stats.error}` : ''}`);

/**
 * Daily scan at 00:00 in the business time zone, plus a catch-up scan shortly after boot
 * (hosts that sleep can miss midnight). Duplicate sends are prevented by the unique
 * notification key, so extra scans are safe.
 */
const tasks = [];

const startScheduler = () => {
    if (process.env.NODE_ENV === 'test') return;

    tasks.push(cron.schedule('0 0 * * *', async () => {
        logResult('Daily scan', await checkExpiries());
    }, { timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata', noOverlap: true, name: 'daily-expiry-scan' }));

    // Permanently remove documents whose trash retention window has passed.
    tasks.push(cron.schedule('30 0 * * *', async () => {
        try {
            const r = await purgeExpiredTrash();
            console.log(`[RETENTION] Purged ${r.purged} document(s) older than ${r.retentionDays} days in the trash`);
        } catch (err) {
            console.error('[RETENTION] Purge failed:', err.message);
        }
    }, { timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata', noOverlap: true, name: 'trash-retention' }));

    if (process.env.STARTUP_SCAN !== 'false') {
        setTimeout(async () => logResult('Startup catch-up scan', await checkExpiries()), 15000).unref();
    }
};

const stopScheduler = async () => {
    while (tasks.length) await tasks.pop().destroy();
};

module.exports = { checkExpiries, startScheduler, stopScheduler, getScanStatus };
