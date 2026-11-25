const { isProduction } = require('../config');

const notFound = (req, res) => res.status(404).json({ error: 'Route not found' });

/**
 * Single place that turns thrown errors into JSON. Internal messages are never sent to
 * clients (they leak table and column names); they are logged with a request id instead.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err && err.name === 'MulterError') {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Maximum size is 5 MB.' : err.message;
        return res.status(status).json({ error: message });
    }

    if (err && err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: err.message });
    }

    // express.json() parse failure
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large' });
    }

    if (err && err.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    if (err && err.code === 'P2002') return res.status(409).json({ error: 'Record already exists' });

    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    console.error(`[ERROR ${requestId}] ${req.method} ${req.originalUrl}`, err);
    const body = { error: 'Internal server error', requestId };
    if (!isProduction() && err && err.message) body.details = err.message;
    return res.status(500).json(body);
};

module.exports = { notFound, errorHandler };
