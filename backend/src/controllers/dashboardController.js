const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const plus7Days = new Date(today);
        plus7Days.setDate(today.getDate() + 7);
        plus7Days.setHours(23, 59, 59, 999);

        const plus30Days = new Date(today);
        plus30Days.setDate(today.getDate() + 30);
        plus30Days.setHours(23, 59, 59, 999);

        const total = await prisma.document.count();

        const expired = await prisma.document.count({
            where: { expiryDate: { lt: today } }
        });

        const expiring7d = await prisma.document.count({
            where: {
                expiryDate: {
                    gte: today,
                    lte: plus7Days
                }
            }
        });

        const expiring30d = await prisma.document.count({
            where: {
                expiryDate: {
                    gte: today,
                    lte: plus30Days
                }
            }
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

        return res.status(200).json({
            total,
            expired,
            expiring7d,
            expiring30d,
            categories
        });
    } catch (error) {
        return res.status(500).json({ error: 'Database error in dashboard stats', details: error.message });
    }
};

module.exports = { getDashboardStats };
