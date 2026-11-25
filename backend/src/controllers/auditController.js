const { z } = require('zod');
const prisma = require('../db');
const { ACTIONS } = require('../services/audit');
const { zonedDayStart, toDateOnly, addDays, formatDateOnly } = require('../utils/dates');

const querySchema = z.object({
    action: z.enum(ACTIONS).optional(),
    entityId: z.string().max(100).optional(),
    actor: z.string().trim().max(254).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

const getAuditLogs = async (req, res, next) => {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Validation failed', details: z.flattenError(parsed.error).fieldErrors });
        }
        const { action, entityId, actor, from, to, page, limit } = parsed.data;

        const where = {};
        if (action) where.action = action;
        // A document's history also includes framework links that reference it.
        if (entityId) where.OR = [{ entityId }, { details: { path: ['documentId'], equals: entityId } }];
        if (actor) where.actorEmail = { contains: actor, mode: 'insensitive' };
        if (from || to) {
            where.createdAt = {};
            // Days are business-time-zone days (APP_TIMEZONE), like everywhere else in the app.
            if (from) where.createdAt.gte = zonedDayStart(from);
            if (to) where.createdAt.lt = zonedDayStart(formatDateOnly(addDays(toDateOnly(to), 1)));
        }

        const [totalItems, items] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
                where,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: (page - 1) * limit,
                take: limit
            })
        ]);

        return res.status(200).json({ items, totalItems, totalPages: Math.ceil(totalItems / limit), page, limit });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getAuditLogs };
