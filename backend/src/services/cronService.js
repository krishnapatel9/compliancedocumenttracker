const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

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

// Check for expiries and generate emails based on threshold constraints
const checkExpiries = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thresholds = [30, 7];
    const emailsSent = [];
    const skippedDuplicates = [];

    const transporter = await getTransporter();

    for (const days of thresholds) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + days);

        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Fetch docs expiring on the target threshold date
        const documents = await prisma.document.findMany({
            where: {
                expiryDate: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        for (const doc of documents) {
            // Check if notification record for this threshold exists
            const existingNotif = await prisma.notification.findUnique({
                where: {
                    documentId_daysBefore: {
                        documentId: doc.id,
                        daysBefore: days
                    }
                }
            });

            if (existingNotif) {
                skippedDuplicates.push({
                    id: doc.id,
                    title: doc.title,
                    daysBefore: days
                });
                continue;
            }

            const expiryStr = new Date(doc.expiryDate).toLocaleDateString();
            const subject = `⚠️ ACTION REQUIRED: Document "${doc.title}" Expires in ${days} Days`;
            const textContent = `Dear Compliance Officer,

This is an automated alert warning you that the following compliance document is reaching its expiration status threshold:

Document Details:
----------------------------------------
Title:        ${doc.title}
Category:     ${doc.category.toUpperCase().replace('_', ' ')}
Issue Date:   ${new Date(doc.issueDate).toLocaleDateString()}
Expiry Date:  ${expiryStr}
Description:  ${doc.description || 'No notes description provided.'}

This document will expire in exactly ${days} days. Please take appropriate update or renewal actions immediately.

Best regards,
DocShield Compliance Tracker Service`;

            try {
                await transporter.sendMail({
                    from: '"DocShield Expiries Reminders" <compliance@docshield.local>',
                    to: doc.notifyEmail,
                    subject: subject,
                    text: textContent
                });

                // Log notification entry to prevent duplicate sends
                await prisma.notification.create({
                    data: {
                        documentId: doc.id,
                        daysBefore: days
                    }
                });

                emailsSent.push({
                    id: doc.id,
                    title: doc.title,
                    email: doc.notifyEmail,
                    daysBefore: days
                });
            } catch (mailErr) {
                console.error(`[MAIL SERVICE] Failed to deliver email reminder for "${doc.title}" to ${doc.notifyEmail}:`, mailErr.message);
            }
        }
    }

    return {
        success: true,
        scannedThresholds: thresholds,
        emailsSent,
        skippedDuplicates
    };
};

// Scheduler config: runs once per day at 00:00 midnight
cron.schedule('0 0 * * *', async () => {
    console.log('[CRON SUPERVISOR] Initializing daily automatic compliance check scan...');
    try {
        const stats = await checkExpiries();
        console.log('[CRON SUPERVISOR] Executed. Emails sent:', stats.emailsSent.length, 'Duplicates skipped:', stats.skippedDuplicates.length);
    } catch (err) {
        console.error('[CRON SUPERVISOR] Error scanning compliance expiries:', err);
    }
});

module.exports = { checkExpiries };
