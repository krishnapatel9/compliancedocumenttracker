const prisma = require('../db');
const { todayDateOnly } = require('../utils/dates');
const { computeStatus } = require('../utils/documentStatus');

/**
 * Get all sent email notifications with computed document statuses
 */
const getNotificationsLog = async (req, res, next) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { document: { deletedAt: null } },
            include: {
                document: true
            },
            orderBy: {
                sentAt: 'desc'
            },
            take: 500
        });

        const today = todayDateOnly();

        const logs = notifications.map(notif => {
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
        next(error);
    }
};

module.exports = {
    getNotificationsLog
};
