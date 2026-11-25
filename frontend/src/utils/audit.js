// One-line, human-readable descriptions of audit log entries.
const FIELD_LABELS = { title: 'title', category: 'category', issueDate: 'issue date', expiryDate: 'expiry date', notifyEmail: 'notify email', description: 'description' };

export const ACTION_LABELS = {
    LOGIN_SUCCESS: 'Signed in',
    LOGIN_FAILED: 'Failed sign-in',
    DOCUMENT_CREATED: 'Document created',
    DOCUMENT_UPDATED: 'Document updated',
    DOCUMENT_DOWNLOADED: 'PDF downloaded',
    DOCUMENT_DELETED: 'Moved to trash',
    DOCUMENT_RESTORED: 'Restored from trash',
    DOCUMENT_PURGED: 'Permanently deleted',
    FRAMEWORK_LINKED: 'Linked to framework control',
    FRAMEWORK_UNLINKED: 'Unlinked from framework control',
    EXPIRY_SCAN_RUN: 'Expiry scan run',
};

const show = (v) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));

export const describeEntry = (e) => {
    const d = e.details || {};
    switch (e.action) {
        case 'DOCUMENT_UPDATED': {
            const parts = Object.entries(d.changes || {}).map(([f, c]) => `${FIELD_LABELS[f] || f}: ${show(c.from)} → ${show(c.to)}`);
            if (d.fileReplaced) parts.push('PDF replaced');
            return `Updated (${parts.join('; ') || 'no field changes'})`;
        }
        case 'FRAMEWORK_LINKED':
        case 'FRAMEWORK_UNLINKED':
            return `${ACTION_LABELS[e.action]}: ${d.framework} ${d.controlCode}`;
        case 'EXPIRY_SCAN_RUN':
            return `Expiry scan ${d.success ? 'succeeded' : 'reported a problem'}: ${d.sent ?? 0} sent, ${d.duplicates ?? 0} already sent, ${d.failed ?? 0} failed${d.error ? ` (${d.error})` : ''}`;
        case 'LOGIN_FAILED':
            return `Failed sign-in (${d.reason || 'rejected'})`;
        case 'DOCUMENT_PURGED':
            return `Permanently deleted (${d.reason || 'purged'})`;
        default:
            return ACTION_LABELS[e.action] || e.action;
    }
};
