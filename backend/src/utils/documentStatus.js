/**
 * Single source of truth for a document's expiry status.
 * Used by every controller so list, filters, dashboard and framework views agree.
 */
const { toDateOnly, todayDateOnly, addDays, daysBetween } = require('./dates');

const EXPIRING_SOON_DAYS = 30;

/** Status for one expiry date: expired (< today), expiring_soon (0..30 days), active (> 30 days). */
const computeStatus = (expiryDate, today = todayDateOnly()) => {
    const daysRemaining = daysBetween(today, toDateOnly(expiryDate));

    if (daysRemaining < 0) return { status: 'expired', daysRemaining };
    if (daysRemaining <= EXPIRING_SOON_DAYS) return { status: 'expiring_soon', daysRemaining };
    return { status: 'active', daysRemaining };
};

/** Prisma `expiryDate` filter matching computeStatus exactly. Returns undefined for unknown status. */
const statusWhere = (status, today = todayDateOnly()) => {
    const soonEnd = addDays(today, EXPIRING_SOON_DAYS);
    switch (status) {
        case 'expired':
            return { lt: today };
        case 'expiring_soon':
            return { gte: today, lte: soonEnd };
        case 'active':
            return { gt: soonEnd };
        default:
            return undefined;
    }
};

/** Filter for documents expiring between today and today + days (inclusive). */
const expiringWithinWhere = (days, today = todayDateOnly()) => ({
    gte: today,
    lte: addDays(today, days),
});

module.exports = {
    EXPIRING_SOON_DAYS,
    computeStatus,
    statusWhere,
    expiringWithinWhere,
};
