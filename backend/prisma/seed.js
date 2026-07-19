const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    const adminEmail = 'admin@compliance.com';
    const defaultPassword = 'adminpassword';

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

    // 2. Prepare physical uploads staging folder and seed attachment
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const seedStubPath = path.join(uploadsDir, 'seed-stub-source.pdf');
    fs.writeFileSync(seedStubPath, '%PDF-1.4 Compliance Tracker Seed Attachment Stub File Content');

    // 3. Define 10 realistic documents with varying expirations
    const today = new Date();
    const addDays = (days) => {
        const d = new Date(today);
        d.setDate(today.getDate() + days);
        return d;
    };

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

    console.log('Seeding compliance documents table details...');
    let docsCreated = 0;
    for (let i = 0; i < docSeeds.length; i++) {
        const item = docSeeds[i];

        // Skip seeding if a document with exact title already exists (idempotent seeding)
        const existingDoc = await prisma.document.findFirst({
            where: { title: item.title }
        });

        if (existingDoc) continue;

        // Copy seed stub into unique local name
        const uniqueFileName = `seed-document-pdf-${i + 1}.pdf`;
        const physicalFilePath = path.join(uploadsDir, uniqueFileName);
        fs.copyFileSync(seedStubPath, physicalFilePath);

        // Store relative path in database format: uploads/filename
        const dbFilePath = `uploads/${uniqueFileName}`;

        await prisma.document.create({
            data: {
                title: item.title,
                category: item.category,
                issueDate: item.issueDate,
                expiryDate: item.expiryDate,
                notifyEmail: item.notifyEmail,
                description: item.description,
                filePath: dbFilePath
            }
        });
        docsCreated++;
    }

    // Safely remove initial stub source
    if (fs.existsSync(seedStubPath)) {
        fs.unlinkSync(seedStubPath);
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
