const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayDateOnly } = require('../utils/dates');
const { computeStatus } = require('../utils/documentStatus');

/**
 * Get all sent email notifications with computed document statuses
 */
const getNotificationsLog = async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            include: {
                document: true
            },
            orderBy: {
                sentAt: 'desc'
            }
        });

        const today = todayDateOnly();

        const logs = notifications.map(notif => {
            if (!notif.document) return notif;

            const { status: computedStatus, daysRemaining } = computeStatus(notif.document.expiryDate, today);

            return {
                id: notif.id,
                sentAt: notif.sentAt,
                daysBefore: notif.daysBefore,
                expiryDate: notif.expiryDate,
                document: {
                    id: notif.document.id,
                    title: notif.document.title,
                    category: notif.document.category,
                    expiryDate: notif.document.expiryDate,
                    notifyEmail: notif.document.notifyEmail,
                    daysRemaining,
                    status: computedStatus
                }
            };
        });

        res.status(200).json(logs);
    } catch (error) {
        console.error('Error fetching notification logs:', error);
        res.status(500).json({ error: 'Server error fetching notification logs', details: error.message });
    }
};

module.exports = {
    getNotificationsLog
};
