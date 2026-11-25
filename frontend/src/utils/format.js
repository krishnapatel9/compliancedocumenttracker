// DATE columns arrive as UTC-midnight ISO strings. Format them in UTC so the calendar day
// never shifts with the viewer's time zone (toLocaleDateString() showed the previous day
// for viewers west of UTC).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// new Date(null) is the 1970 epoch, so empty values must be rejected before parsing
const parse = (value) => (value === null || value === undefined || value === '' ? new Date(NaN) : new Date(value));

export const formatDate = (value) => {
    const d = parse(value);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** YYYY-MM-DD for <input type="date">. */
export const toInputDate = (value) => {
    const d = parse(value);
    return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
};

export const formatDateTime = (value) => {
    const d = parse(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

/** Parses a JSON response without throwing on HTML/empty bodies (proxy errors, cold starts). */
export const readJson = async (res) => {
    try {
        return await res.json();
    } catch {
        return {};
    }
};
