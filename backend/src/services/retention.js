const prisma = require('../db');
const { record, SYSTEM_ACTOR } = require('./audit');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a deleted document stays restorable (RETENTION_DAYS, default 30). */
const retentionDays = () => {
    const n = parseInt(process.env.RETENTION_DAYS || '30', 10);
    return Number.isFinite(n) && n >= 1 ? n : 30;
};

const purgeAt = (deletedAt) => new Date(new Date(deletedAt).getTime() + retentionDays() * DAY_MS);

/**
 * Permanently removes one document that is already in the trash (its file and reminder
 * history go with it) and records who did it. Returns false if it is not in the trash.
 */
const purgeDocument = async (id, actor, reason) => {
    return prisma.$transaction(async (tx) => {
        const doc = await tx.document.findFirst({ where: { id, deletedAt: { not: null } } });
        if (!doc) return false;
        await record(tx, actor, {
            action: 'DOCUMENT_PURGED',
            entityType: 'document',
            entityId: id,
            documentTitle: doc.title,
            details: { reason, deletedAt: doc.deletedAt }
        });
        await tx.document.delete({ where: { id } });
        return true;
    });
};

/** Purges every document whose retention window has passed. Run daily by the scheduler. */
const purgeExpiredTrash = async (now = new Date()) => {
    const cutoff = new Date(now.getTime() - retentionDays() * DAY_MS);
    const stale = await prisma.document.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } });
    let purged = 0;
    for (const { id } of stale) {
        try {
            if (await purgeDocument(id, SYSTEM_ACTOR, `retention window of ${retentionDays()} days passed`)) purged++;
        } catch (err) {
            console.error(`[RETENTION] Failed to purge ${id}:`, err.message);
        }
    }
    return { purged, retentionDays: retentionDays() };
};

module.exports = { retentionDays, purgeAt, purgeDocument, purgeExpiredTrash };
