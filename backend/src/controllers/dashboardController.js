const prisma = require('../db');
const { todayDateOnly, addDays, formatDateOnly } = require('../utils/dates');
const { EXPIRING_SOON_DAYS } = require('../utils/documentStatus');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORIES = ['license', 'certificate', 'insurance', 'contract', 'permit', 'tax_document'];

/** The last `count` calendar months ending with today's month, as [{ key: 'YYYY-MM', label }]. */
const lastMonths = (today, count = 6) => {
    const months = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        months.push({ key, label: MONTHS[d.getUTCMonth()], start: d });
    }
    return months;
};

const getDashboardStats = async (req, res, next) => {
    try {
        const today = todayDateOnly();
        const t = formatDateOnly(today);
        const d7 = formatDateOnly(addDays(today, 7));
        const d30 = formatDateOnly(addDays(today, EXPIRING_SOON_DAYS));
        const d60 = formatDateOnly(addDays(today, 60));
        const d90 = formatDateOnly(addDays(today, 90));
        const tz = process.env.APP_TIMEZONE || 'Asia/Kolkata';

        const months = lastMonths(today);
        // One day of slack either side; exact bucketing happens in SQL in the business time zone.
        const trendFrom = addDays(months[0].start, -1);

        const [counts, categoriesGroup, warningsCount, monthly] = await Promise.all([
            prisma.$queryRaw`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE expiry_date < ${t}::date)::int AS expired,
                    COUNT(*) FILTER (WHERE expiry_date >= ${t}::date AND expiry_date <= ${d30}::date)::int AS expiring_soon,
                    COUNT(*) FILTER (WHERE expiry_date > ${d30}::date)::int AS active,
                    COUNT(*) FILTER (WHERE expiry_date >= ${t}::date AND expiry_date <= ${d7}::date)::int AS expiring7d,
                    COUNT(*) FILTER (WHERE expiry_date >= ${t}::date AND expiry_date <= ${d30}::date)::int AS expiring30d,
                    COUNT(*) FILTER (WHERE expiry_date >= ${t}::date AND expiry_date <= ${d60}::date)::int AS expiring60d,
                    COUNT(*) FILTER (WHERE expiry_date >= ${t}::date AND expiry_date <= ${d90}::date)::int AS expiring90d
                FROM documents
                WHERE deleted_at IS NULL`,
            prisma.document.groupBy({ by: ['category'], where: { deletedAt: null }, _count: { id: true } }),
            prisma.notification.count({ where: { document: { deletedAt: null } } }),
            prisma.$queryRaw`
                SELECT to_char(date_trunc('month', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM') AS ym,
                       COUNT(*)::int AS count
                FROM documents
                WHERE deleted_at IS NULL AND created_at >= ${trendFrom}
                GROUP BY 1`
        ]);

        const c = counts[0];
        const categories = Object.fromEntries(CATEGORIES.map((k) => [k, 0]));
        categoriesGroup.forEach((g) => { categories[g.category] = g._count.id; });

        const byMonth = Object.fromEntries(monthly.map((m) => [m.ym, m.count]));
        const monthlyUploads = months.map((m) => ({ month: m.label, count: byMonth[m.key] || 0 }));

        // Share of documents that are not expired.
        const healthRate = c.total > 0 ? Math.round(((c.total - c.expired) / c.total) * 100) : 100;

        return res.status(200).json({
            total: c.total,
            active: c.active,
            expiringSoon: c.expiring_soon,
            expired: c.expired,
            expiring7d: c.expiring7d,
            expiring30d: c.expiring30d,
            expiring60d: c.expiring60d,
            expiring90d: c.expiring90d,
            categories,
            healthRate,
            warningsCount,
            monthlyUploads
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getDashboardStats };
