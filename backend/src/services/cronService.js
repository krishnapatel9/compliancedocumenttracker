const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { toDateOnly, todayDateOnly, addDays, daysBetween } = require('../utils/dates');
const { THRESHOLDS, pickThreshold, buildEmail } = require('./expiryRules');

const prisma = new PrismaClient();

// Setup Nodemailer SMTP transport or fallback to Console mock (best for local/offline testing)
const getTransporter = async () => {
    if (process.env.SMTP_HOST) {
        try {
            const transport = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            await transport.verify();
            return transport;
        } catch (err) {
            console.warn('[MAIL SERVICE] SMTP Host verification failed. Falling back to Console mock.');
        }
    }

    // Default Console logger transport
    return {
        sendMail: async (options) => {
            console.log(`
┌────────────────────────────────────────────────────────┐
│ [SMTP EMAIL MOCK SERVICE]                             │
├────────────────────────────────────────────────────────┤
│ To:      ${options.to.padEnd(46)} │
│ Subject: ${options.subject.padEnd(46)} │
├────────────────────────────────────────────────────────┤
│ Body:                                                  │
│ ${options.text.replace(/\r?\n/g, '\n│ ')}
└────────────────────────────────────────────────────────┘
`);
            return { messageId: 'console-mock-transport-id' };
        }
    };
};

const isUniqueViolation = (err) => err && err.code === 'P2002';

// Check for expiries and send at most one warning per document, expiry date and threshold
const checkExpiries = async () => {
    const today = todayDateOnly();
    const emailsSent = [];
    const skippedDuplicates = [];
    const failed = [];

    const transporter = await getTransporter();

    // Everything inside the widest window, including already-expired documents
    const documents = await prisma.document.findMany({
        where: { expiryDate: { lte: addDays(today, Math.max(...THRESHOLDS)) } }
    });

    for (const doc of documents) {
        const daysRemaining = daysBetween(today, toDateOnly(doc.expiryDate));
        const threshold = pickThreshold(daysRemaining);
        if (threshold === null) continue;

        const key = { documentId: doc.id, expiryDate: toDateOnly(doc.expiryDate), daysBefore: threshold };

        // Claim the warning first. The unique key makes this atomic, so two scans
        // running at once (cron + manual trigger, or two instances) cannot both send.
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
                from: process.env.SMTP_FROM || '"DocShield Expiries Reminders" <compliance@docshield.local>',
                to: doc.notifyEmail,
                subject,
                text
            });
            emailsSent.push({ id: doc.id, title: doc.title, email: doc.notifyEmail, daysBefore: threshold });
        } catch (mailErr) {
            // Release the claim so the next scan retries this warning
            await prisma.notification.delete({ where: { id: claim.id } }).catch(() => {});
            failed.push({ id: doc.id, title: doc.title, daysBefore: threshold, error: mailErr.message });
            console.error(`[MAIL SERVICE] Failed to deliver email reminder for "${doc.title}" to ${doc.notifyEmail}:`, mailErr.message);
        }
    }

    return {
        success: failed.length === 0,
        scannedThresholds: THRESHOLDS,
        sentCount: emailsSent.length,
        emailsSent,
        skippedDuplicates,
        failed
    };
};

// Scheduler config: runs once per day at 00:00 in the business time zone.
// Missed runs are safe: the next scan picks up anything that crossed a threshold meanwhile.
if (process.env.NODE_ENV !== 'test') {
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON SUPERVISOR] Initializing daily automatic compliance check scan...');
        try {
            const stats = await checkExpiries();
            console.log('[CRON SUPERVISOR] Executed. Emails sent:', stats.sentCount, 'Duplicates skipped:', stats.skippedDuplicates.length, 'Failed:', stats.failed.length);
        } catch (err) {
            console.error('[CRON SUPERVISOR] Error scanning compliance expiries:', err);
        }
    }, { timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata' });
}

module.exports = { checkExpiries };
