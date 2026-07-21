const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Configure Helmet with Swagger-dist CSP allowances
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "unpkg.com"],
            "style-src": ["'self'", "'unsafe-inline'", "unpkg.com"],
            "img-src": ["'self'", "data:", "unpkg.com"],
        },
    },
}));

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const cronRoutes = require('./routes/cronRoutes');
const swaggerRoutes = require('./routes/swaggerRoutes');
const frameworkRoutes = require('./routes/frameworkRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Load cron service to initialize node-cron schedules
require('./services/cronService');

// Apply rate limiting to login endpoint specifically
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit IP to 5 requests per windowMs
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/frameworks', frameworkRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/services/cron', cronRoutes);
app.use('/api-docs', swaggerRoutes);

app.get('/api/health', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
        // Check if database is accessible
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'connected';
    } catch (error) {
        dbStatus = `disconnected: ${error.message}`;
    }

    res.status(200).json({
        status: 'ok',
        message: 'Hello World from Compliance Document Tracker API!',
        timestamp: new Date(),
        database: dbStatus
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
