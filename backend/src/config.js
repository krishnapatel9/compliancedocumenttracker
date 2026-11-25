/**
 * Startup configuration checks. Fail fast instead of failing on the first login.
 */
const isProduction = () => process.env.NODE_ENV === 'production';

const requireJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET must be set and at least 32 characters long.');
    }
    return secret;
};

/** Express `trust proxy` value from TRUST_PROXY: a hop count ("2"), "true"/"false", or a subnet list. */
const trustProxySetting = () => {
    const raw = process.env.TRUST_PROXY;
    if (raw === undefined || raw === '') return false;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    return raw;
};

/** CORS origins from CORS_ORIGINS (comma separated). Empty means same-origin only. */
const corsOrigins = () =>
    (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

module.exports = { isProduction, requireJwtSecret, trustProxySetting, corsOrigins };
