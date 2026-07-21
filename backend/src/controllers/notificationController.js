const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

        // Compute days remaining and status inline for each linked document
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const logs = notifications.map(notif => {
            if (!notif.document) return notif;

            const expiry = new Date(notif.document.expiryDate);
            expiry.setHours(0, 0, 0, 0);

            const diffTime = expiry.getTime() - today.getTime();
            const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let computedStatus = 'active';
            if (daysRemaining < 0) {
                computedStatus = 'expired';
            } else if (daysRemaining <= 30) {
                computedStatus = 'expiring_soon';
            }

            return {
                id: notif.id,
                sentAt: notif.sentAt,
                daysBefore: notif.daysBefore,
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
