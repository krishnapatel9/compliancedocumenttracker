/**
 * Pure rules for expiry warnings (no database or mail access), so they can be unit-tested.
 */
const { formatDateOnly } = require('../utils/dates');

// Warning thresholds in days before expiry. 0 means "expired or expires today".
const THRESHOLDS = [30, 15, 7, 0];

/**
 * The most urgent threshold a document has crossed, or null if it is not yet due.
 * State-based on purpose: a document is warned once it is inside a threshold,
 * not only on the exact day, so missed cron runs and late uploads still get warned.
 */
const pickThreshold = (daysRemaining) => {
    const crossed = THRESHOLDS.filter((t) => daysRemaining <= t);
    return crossed.length ? Math.min(...crossed) : null;
};

const buildEmail = (doc, threshold, daysRemaining) => {
    const expiryStr = formatDateOnly(doc.expiryDate);
    let timing;
    if (daysRemaining < 0) {
        timing = `expired ${Math.abs(daysRemaining)} day(s) ago`;
    } else if (daysRemaining === 0) {
        timing = 'expires today';
    } else {
        timing = `expires in ${daysRemaining} day(s)`;
    }

    const subject = threshold === 0
        ? `⚠️ ACTION REQUIRED: Document "${doc.title}" has expired`
        : `⚠️ ACTION REQUIRED: Document "${doc.title}" ${timing}`;

    const text = `Dear Compliance Officer,

This is an automated alert: the following compliance document ${timing}.

Document Details:
----------------------------------------
Title:        ${doc.title}
Category:     ${doc.category.toUpperCase().replace('_', ' ')}
Issue Date:   ${formatDateOnly(doc.issueDate)}
Expiry Date:  ${expiryStr}
Description:  ${doc.description || 'No notes description provided.'}

Please take appropriate update or renewal actions.

Best regards,
DocShield Compliance Tracker Service`;

    return { subject, text };
};

module.exports = { THRESHOLDS, pickThreshold, buildEmail };
