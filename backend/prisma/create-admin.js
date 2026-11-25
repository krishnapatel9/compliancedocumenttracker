// Creates (or resets the password of) the admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long password' npm run db:create-admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');

async function main() {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!email || password.length < 12) {
        throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.admin.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash } });
    console.log(`Admin account ready: ${email}`);
}

main()
    .catch((e) => { console.error(e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
