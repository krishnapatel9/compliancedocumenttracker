// One shared Prisma client for the whole process (each client opens its own connection pool,
// which exhausts the small connection caps on free Postgres tiers).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
