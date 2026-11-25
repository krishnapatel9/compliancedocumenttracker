const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authorized, no token provided' });
    }

    try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.adminId = decoded.id;
        req.adminEmail = decoded.email;
        return next();
    } catch (error) {
        const msg = error.name === 'TokenExpiredError'
            ? 'Not authorized, token expired'
            : 'Not authorized, token invalid';
        return res.status(401).json({ error: msg });
    }
};

/** Guard for machine callers (external scheduler): constant-time compare of x-cron-secret. */
const crypto = require('crypto');
const cronSecret = (req, res, next) => {
    const expected = process.env.CRON_SECRET;
    const provided = req.headers['x-cron-secret'];
    if (!expected || typeof provided !== 'string') {
        return res.status(401).json({ error: 'Not authorized' });
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'Not authorized' });
    }
    next();
};

module.exports = { protect, cronSecret };
