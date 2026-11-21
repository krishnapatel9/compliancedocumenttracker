const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayDateOnly } = require('../utils/dates');
const { statusWhere, expiringWithinWhere } = require('../utils/documentStatus');

const getDashboardStats = async (req, res) => {
    try {
        const today = todayDateOnly();

        const total = await prisma.document.count();

        const expired = await prisma.document.count({
            where: { expiryDate: statusWhere('expired', today) }
        });

        const expiring7d = await prisma.document.count({
            where: { expiryDate: expiringWithinWhere(7, today) }
        });

        const expiring30d = await prisma.document.count({
            where: { expiryDate: expiringWithinWhere(30, today) }
        });

        const categoriesGroup = await prisma.document.groupBy({
            by: ['category'],
            _count: {
                id: true
            }
        });

        const categories = {
            license: 0,
            certificate: 0,
            insurance: 0,
            contract: 0,
            permit: 0,
            tax_document: 0
        };

        categoriesGroup.forEach(group => {
            categories[group.category] = group._count.id;
        });

        // 1. Calculate Health Rating (active % of total)
        const healthRate = total > 0 ? Math.round(((total - expired) / total) * 100) : 100;

        // 2. Count total warnings sent
        const warningsCount = await prisma.notification.count();

        // 3. Document distribution by future expiry time-windows
        const expiring60d = await prisma.document.count({
            where: { expiryDate: expiringWithinWhere(60, today) }
        });

        const expiring90d = await prisma.document.count({
            where: { expiryDate: expiringWithinWhere(90, today) }
        });

        // 4. Monthly uploads trend for past 6 months
        const monthlyUploads = [];
        for (let i = 5; i >= 0; i--) {
            const d1 = new Date();
            d1.setDate(1);
            d1.setHours(0, 0, 0, 0);
            d1.setMonth(d1.getMonth() - i);

            const d2 = new Date(d1);
            d2.setMonth(d1.getMonth() + 1);
            d2.setDate(0); // Last day of that month
            d2.setHours(23, 59, 59, 999);

            const count = await prisma.document.count({
                where: {
                    createdAt: {
                        gte: d1,
                        lte: d2
                    }
                }
            });

            monthlyUploads.push({
                month: d1.toLocaleString('default', { month: 'short' }),
                count
            });
        }

        return res.status(200).json({
            total,
            expired,
            expiring7d,
            expiring30d,
            expiring60d,
            expiring90d,
            categories,
            healthRate,
            warningsCount,
            monthlyUploads
        });
    } catch (error) {
        return res.status(500).json({ error: 'Database error in dashboard stats', details: error.message });
    }
};

module.exports = { getDashboardStats };
