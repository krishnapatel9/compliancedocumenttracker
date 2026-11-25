/**
 * Audit trail helpers. Entries are append-only (a database trigger enforces it) and are
 * written in the same transaction as the change they describe, so a change can never
 * exist without its record, nor a record without its change.
 */
const prisma = require('../db');
const { formatDateOnly } = require('../utils/dates');

const ACTIONS = [
    'LOGIN_SUCCESS', 'LOGIN_FAILED',
    'DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'DOCUMENT_DOWNLOADED',
    'DOCUMENT_DELETED', 'DOCUMENT_RESTORED', 'DOCUMENT_PURGED',
    'FRAMEWORK_LINKED', 'FRAMEWORK_UNLINKED',
    'EXPIRY_SCAN_RUN'
];

const SYSTEM_ACTOR = { actorId: null, actorEmail: 'system', ip: null };

/** Who is making this request (set by the `protect` middleware). */
const actorFrom = (req) => ({
    actorId: req.adminId || null,
    actorEmail: req.adminEmail || 'unknown',
    ip: req.ip || null
});

/**
 * Writes one entry. Pass a transaction client as `db` to make it atomic with the change;
 * defaults to the shared client.
 */
const record = (db, actor, { action, entityType, entityId = null, documentTitle = null, details = null }) => {
    if (!ACTIONS.includes(action)) throw new Error(`Unknown audit action: ${action}`);
    return (db || prisma).auditLog.create({
        data: {
            actorId: actor.actorId,
            actorEmail: String(actor.actorEmail).slice(0, 254),
            ip: actor.ip,
            action,
            entityType,
            entityId,
            documentTitle,
            details: details === null ? undefined : details
        }
    });
};

const TRACKED_FIELDS = ['title', 'category', 'issueDate', 'expiryDate', 'notifyEmail', 'description'];
const DATE_FIELDS = new Set(['issueDate', 'expiryDate']);

const printable = (field, value) => {
    if (value === null || value === undefined) return null;
    return DATE_FIELDS.has(field) ? formatDateOnly(value) : value;
};

/** { field: { from, to } } for the fields that actually changed (dates as YYYY-MM-DD). */
const diffDocument = (before, after) => {
    const changes = {};
    for (const field of TRACKED_FIELDS) {
        const from = printable(field, before[field]);
        const to = printable(field, after[field]);
        if (from !== to) changes[field] = { from, to };
    }
    return changes;
};

module.exports = { ACTIONS, SYSTEM_ACTOR, actorFrom, record, diffDocument };
