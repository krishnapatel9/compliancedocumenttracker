/**
 * Calendar-date helpers.
 *
 * Issue and expiry dates are calendar dates (no time, no zone), stored in
 * Postgres as DATE. Every value here is a JS Date at UTC midnight, so it maps
 * 1:1 to the DATE column whatever the server's time zone is. Never use local
 * time methods (setHours, getDate) on these values: on a UTC+5:30 machine
 * local midnight is the previous UTC day, which shifted dates by one.
 *
 * "Today" is taken in the business time zone (APP_TIMEZONE, default
 * Asia/Kolkata), so the day rolls over at local midnight for the users.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

const businessTimeZone = () => process.env.APP_TIMEZONE || 'Asia/Kolkata';

/**
 * Converts 'YYYY-MM-DD', an ISO string or a Date into a Date at UTC midnight.
 * Date objects are read with UTC getters (Prisma returns DATE columns as UTC midnight).
 * Returns null for anything that is not a valid date.
 */
const toDateOnly = (value) => {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }

    const match = DATE_ONLY_RE.exec(String(value).trim());
    if (!match) return null;
    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    // Reject rollovers like 2026-02-31
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
};

/** Today's calendar date in the business time zone, as UTC midnight. */
const todayDateOnly = (now = new Date(), timeZone = businessTimeZone()) => {
    // en-CA formats as YYYY-MM-DD
    const ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
    return toDateOnly(ymd);
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

/** Whole days from `from` to `to` (both date-only). Negative when `to` is earlier. */
const daysBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

/** 'YYYY-MM-DD' for a date-only value, for emails and logs. */
const formatDateOnly = (date) => toDateOnly(date).toISOString().slice(0, 10);

module.exports = {
    DAY_MS,
    toDateOnly,
    todayDateOnly,
    addDays,
    daysBetween,
    formatDateOnly,
};
