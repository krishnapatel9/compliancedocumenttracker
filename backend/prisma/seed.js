// DEMO DATA ONLY. Creates a default admin and sample documents with real PDFs.
// Never runs automatically and refuses to run in production unless ALLOW_SEED=true.
//   SEED_REFRESH_DATES=true  re-bases the seeded documents' dates on today (explicit opt-in)
//   DEMO_NOTIFY_EMAIL        recipient for seeded documents' reminders (use an inbox you own)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');
const { todayDateOnly, addDays: addDateDays } = require('../src/utils/dates');
const { buildSamplePdf } = require('../src/utils/samplePdf');

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.error('Refusing to seed in production. Use `npm run db:create-admin` to create the admin.');
    process.exit(1);
}

async function main() {
    console.log('Seeding database...');

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@compliance.com').toLowerCase();
    const defaultPassword = process.env.ADMIN_PASSWORD || 'adminpassword';

    // 1. Seed Admin
    let admin = await prisma.admin.findUnique({
        where: { email: adminEmail }
    });

    if (!admin) {
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        admin = await prisma.admin.create({
            data: {
                email: adminEmail,
                passwordHash: passwordHash
            }
        });
        console.log(`Admin account seeded successfully: ${admin.email}`);
    } else {
        console.log('Admin account already exists, skipping.');
    }

    // 3. Define 10 realistic documents with varying expirations
    const today = todayDateOnly();
    const addDays = (days) => addDateDays(today, days);
    const demoEmail = process.env.DEMO_NOTIFY_EMAIL;
    const refreshDates = process.env.SEED_REFRESH_DATES === 'true';

    const docSeeds = [
        // Expired docs
        {
            title: "Municipal Business Permit 2025",
            category: "permit",
            issueDate: addDays(-400),
            expiryDate: addDays(-35),
            notifyEmail: "legal@docshield.com",
            description: "Annual municipal operating permit token issued by local city corporate authority. Needs immediate update."
        },
        {
            title: "ISO 9001 Quality Certificate",
            category: "certificate",
            issueDate: addDays(-730),
            expiryDate: addDays(-5),
            notifyEmail: "quality@docshield.com",
            description: "Audited quality management certificate. Renewal requires onsite compliance inspection."
        },
        {
            title: "Commercial Auto Fleet Insurance",
            category: "insurance",
            issueDate: addDays(-365),
            expiryDate: addDays(-10),
            notifyEmail: "finance@docshield.com",
            description: "Primary auto liability shield for standard organizational transport vehicles."
        },
        // Expiring Soon
        {
            title: "General Umbrella Facility Liability",
            category: "insurance",
            issueDate: addDays(-350),
            expiryDate: addDays(15),
            notifyEmail: "alerts@docshield.com",
            description: "Excess general umbrella liability coverage contract. Premium renewal invoice ready."
        },
        {
            title: "State Environmental Waste Permit",
            category: "permit",
            issueDate: addDays(-180),
            expiryDate: addDays(4),
            notifyEmail: "safety@docshield.com",
            description: "Environmental water discharge and waste safety operating permit. Warning alert sent."
        },
        {
            title: "Corporate HQ Leasing Contract",
            category: "contract",
            issueDate: addDays(-1000),
            expiryDate: addDays(25),
            notifyEmail: "realestate@docshield.com",
            description: "Commercial tenancy agreement for Suite 400 Headquarters building."
        },
        // Active
        {
            title: "Professional Indemnity Shield",
            category: "insurance",
            issueDate: addDays(-50),
            expiryDate: addDays(315),
            notifyEmail: "legal@docshield.com",
            description: "Claims-made professional negligence indemnity policy."
        },
        {
            title: "HIPAA Patient Privacy Certificate",
            category: "certificate",
            issueDate: addDays(-100),
            expiryDate: addDays(265),
            notifyEmail: "hipaa@docshield.com",
            description: "Standard cybersecurity compliance audit certifying patient health ledger standards."
        },
        {
            title: "AWS Cloud Services Agreement",
            category: "contract",
            issueDate: addDays(-30),
            expiryDate: addDays(700),
            notifyEmail: "devops@docshield.com",
            description: "Enterprise web hosting discount tier support subscription contract."
        },
        {
            title: "State Board Franchise Tax License",
            category: "tax_document",
            issueDate: addDays(-60),
            expiryDate: addDays(120),
            notifyEmail: "accounting@docshield.com",
            description: "Active status franchise tax clearance filing with state board."
        }
    ];

    console.log('Seeding compliance documents...');
    let docsCreated = 0;
    for (const item of docSeeds) {
        const notifyEmail = demoEmail || item.notifyEmail;
        const pdf = buildSamplePdf([item.title, `Category: ${item.category}`, 'Sample document generated by the DocShield seed.']);
        const file = { fileName: `${item.title.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`, size: pdf.length, data: pdf };

        const existing = await prisma.document.findFirst({ where: { title: item.title }, include: { file: { select: { documentId: true } } } });

        if (existing) {
            const data = {};
            if (refreshDates) Object.assign(data, { issueDate: item.issueDate, expiryDate: item.expiryDate });
            if (demoEmail) data.notifyEmail = demoEmail;
            if (!existing.file) data.file = { create: file };
            if (Object.keys(data).length) await prisma.document.update({ where: { id: existing.id }, data });
            continue;
        }

        await prisma.document.create({
            data: {
                title: item.title,
                category: item.category,
                issueDate: item.issueDate,
                expiryDate: item.expiryDate,
                notifyEmail,
                description: item.description,
                file: { create: file }
            }
        });
        docsCreated++;
    }

    console.log(`Seeding finished. Added ${docsCreated} new documents.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
