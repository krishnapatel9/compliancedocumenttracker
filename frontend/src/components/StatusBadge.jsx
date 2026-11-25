import React from 'react';

const LABELS = { active: 'In date', expiring_soon: 'Expiring soon', expired: 'Expired' };
const CLASSES = { active: 'ok', expiring_soon: 'soon', expired: 'late' };

export const dueText = (days) => {
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
    if (days === 0) return 'today';
    return `in ${days} day${days === 1 ? '' : 's'}`;
};

/** Status is always text plus colour, never colour alone. */
function StatusBadge({ status, days, showDays = true }) {
    return (
        <span>
            <span className={`status ${CLASSES[status] || 'ok'}`}>{LABELS[status] || status}</span>
            {showDays && typeof days === 'number' && <span className="status-days">{status === 'expired' ? 'Expired' : 'Expires'} {dueText(days)}</span>}
        </span>
    );
}

export default StatusBadge;
