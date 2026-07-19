const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const cronRoutes = require('./routes/cronRoutes');
const swaggerRoutes = require('./routes/swaggerRoutes');

// Load cron service to initialize node-cron schedules
require('./services/cronService');

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', dashboardRoutes);
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
