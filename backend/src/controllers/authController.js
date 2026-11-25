const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { record } = require('../services/audit');

const login = async (req, res, next) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const admin = await prisma.admin.findUnique({ where: { email: email.trim().toLowerCase() } });

        // Always run a hash comparison so response time doesn't reveal whether the email exists.
        const hash = admin ? admin.passwordHash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
        const isMatch = await bcrypt.compare(password, hash);
        const ip = req.ip || null;
        if (!admin || !isMatch) {
            await record(null, { actorId: null, actorEmail: email.trim().toLowerCase(), ip }, {
                action: 'LOGIN_FAILED',
                entityType: 'admin',
                details: { reason: admin ? 'wrong password' : 'unknown email' }
            });
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        await record(null, { actorId: admin.id, actorEmail: admin.email, ip }, {
            action: 'LOGIN_SUCCESS',
            entityType: 'admin',
            entityId: admin.id
        });

        const expiresIn = process.env.JWT_EXPIRES_IN || '12h';
        const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, {
            algorithm: 'HS256',
            expiresIn
        });
        const decoded = jwt.decode(token);

        return res.status(200).json({
            message: 'Login successful',
            token,
            expiresAt: decoded.exp * 1000,
            admin: { id: admin.id, email: admin.email }
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { login };
