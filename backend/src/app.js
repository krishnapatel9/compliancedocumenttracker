require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const prisma = require('./db');
const { isProduction, requireJwtSecret, trustProxySetting, corsOrigins } = require('./config');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { startScheduler, stopScheduler, getScanStatus } = require('./services/cronService');

const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const cronRoutes = require('./routes/cronRoutes');
const swaggerRoutes = require('./routes/swaggerRoutes');
const frameworkRoutes = require('./routes/frameworkRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');

const createApp = () => {
    const app = express();

    // Behind Vercel/Render proxies req.ip is the proxy unless this is set (TRUST_PROXY=<hops>).
    app.set('trust proxy', trustProxySetting());

    // Default helmet CSP, with scripts restricted to this origin (Swagger UI is served locally).
    app.use(helmet());

    const origins = corsOrigins();
    app.use(cors({ origin: origins.length ? origins : false }));
    app.use(express.json({ limit: '100kb' }));
    if (process.env.NODE_ENV !== 'test') app.use(morgan(isProduction() ? 'combined' : 'dev'));

    // Failed attempts only: successful logins must not lock the admin out.
    app.use('/api/auth/login', rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        skipSuccessfulRequests: true,
        message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
        standardHeaders: true,
        legacyHeaders: false,
    }));

    app.use('/api/auth', authRoutes);
    app.use('/api/documents', documentRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/frameworks', frameworkRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/audit-logs', auditRoutes);
    app.use('/api/services/cron', cronRoutes);
    app.use('/api-docs', swaggerRoutes);

    app.get('/api/health', async (req, res) => {
        let database = 'connected';
        try {
            await prisma.$queryRaw`SELECT 1`;
        } catch (error) {
            console.error('[HEALTH] Database check failed:', error.message);
            database = 'disconnected';
        }

        const scan = getScanStatus();
        res.status(database === 'connected' ? 200 : 503).json({
            status: database === 'connected' ? 'ok' : 'degraded',
            timestamp: new Date(),
            database,
            alerts: { lastRunAt: scan.lastRunAt, lastSuccessAt: scan.lastSuccessAt, lastError: scan.lastError }
        });
    });

    app.use(notFound);
    app.use(errorHandler);
    return app;
};

const start = () => {
    requireJwtSecret();
    const app = createApp();
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    startScheduler();

    const shutdown = (signal) => {
        console.log(`${signal} received, shutting down...`);
        server.close(async () => {
            await stopScheduler();
            await prisma.$disconnect();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

if (require.main === module) start();

module.exports = { createApp };
