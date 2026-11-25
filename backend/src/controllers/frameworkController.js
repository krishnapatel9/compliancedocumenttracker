const { z } = require('zod');
const prisma = require('../db');
const { actorFrom, record } = require('../services/audit');
const { todayDateOnly } = require('../utils/dates');
const { computeStatus } = require('../utils/documentStatus');

// Predefined core requirements for compliance frameworks
const STATIC_CONTROLS = [
    {
        framework: 'SOC2',
        controlCode: 'CC1.1',
        name: 'Integrity and Ethical Values',
        description: 'The organization demonstrates a commitment to integrity and ethical values through policy definitions.'
    },
    {
        framework: 'SOC2',
        controlCode: 'CC6.1',
        name: 'Access Authorization Management',
        description: 'Access credentials to endpoints and file assets are restricted based on authorized roles.'
    },
    {
        framework: 'SOC2',
        controlCode: 'CC6.3',
        name: 'Privilege Access Control',
        description: 'Granting of superuser and management privileges is monitored and audited periodically.'
    },
    {
        framework: 'SOC2',
        controlCode: 'CC7.1',
        name: 'Security Incident Response',
        description: 'The entity outlines threat alerts detections, reporting, and incident triage runbooks.'
    },
    {
        framework: 'SOC2',
        controlCode: 'CC8.1',
        name: 'System Alteration Controls',
        description: 'Modifications to active software codebases or server infrastructure follow standard change requests.'
    },

    {
        framework: 'ISO27001',
        controlCode: 'A.9.1.1',
        name: 'Access Control Policy',
        description: 'Policies limiting operational access to secure files and databases are configured.'
    },
    {
        framework: 'ISO27001',
        controlCode: 'A.12.4.1',
        name: 'Event Logging and Records',
        description: 'Server access paths, upload events, and client logins are audited and logged.'
    },
    {
        framework: 'ISO27001',
        controlCode: 'A.12.6.1',
        name: 'Technical Vulnerabilities Management',
        description: 'Security middleware patches are applied to minimize exploitation vectors.'
    },
    {
        framework: 'ISO27001',
        controlCode: 'A.14.2.1',
        name: 'Secure Systems Engineering',
        description: 'Designs and builds prevent common data leaks or structural buffer overflows.'
    },
    {
        framework: 'ISO27001',
        controlCode: 'A.18.1.1',
        name: 'Compliance Regulations Check',
        description: 'Evaluations confirming that the application matches host regulations laws.'
    },

    {
        framework: 'GDPR',
        controlCode: 'Article 5',
        name: 'Integrity and Confidentiality',
        description: 'Personal records inputs are stored securely under encryption and protected layers.'
    },
    {
        framework: 'GDPR',
        controlCode: 'Article 25',
        name: 'Protection by Design & Default',
        description: 'Data minimization schemas limit user records exposure by default settings.'
    },
    {
        framework: 'GDPR',
        controlCode: 'Article 30',
        name: 'Processing Activities Records (ROPA)',
        description: 'Register tracking what data gets uploaded, accessed, or modified.'
    },
    {
        framework: 'GDPR',
        controlCode: 'Article 32',
        name: 'Processing Security Audits',
        description: 'Evaluations testing network safeguards and vulnerability masks.'
    },
    {
        framework: 'GDPR',
        controlCode: 'Article 33',
        name: 'Data Breach Notifications',
        description: 'Schedules ensuring regulatory boards are updated within 72 hours of a breach.'
    }
];

/**
 * Get all controls merged with active document links from the database
 */
const getFrameworkControls = async (req, res, next) => {
    try {
        const linkedControls = await prisma.frameworkControl.findMany({
            include: {
                document: true
            }
        });

        const today = todayDateOnly();

        const controlMap = {};
        linkedControls.forEach(item => {
            const key = `${item.framework}-${item.controlCode}`;

            let docDetails = null;
            if (item.document && !item.document.deletedAt) {
                const { status: computedStatus, daysRemaining } = computeStatus(item.document.expiryDate, today);

                docDetails = {
                    id: item.document.id,
                    title: item.document.title,
                    category: item.document.category,
                    expiryDate: item.document.expiryDate,
                    status: computedStatus,
                    daysRemaining
                };
            }

            controlMap[key] = {
                id: item.id,
                documentId: item.documentId,
                linkedAt: item.linkedAt,
                document: docDetails
            };
        });

        const mergedControls = STATIC_CONTROLS.map(ctrl => {
            const key = `${ctrl.framework}-${ctrl.controlCode}`;
            const linked = controlMap[key] || { id: null, documentId: null, linkedAt: null, document: null };
            return {
                ...ctrl,
                ...linked
            };
        });

        res.status(200).json(mergedControls);
    } catch (error) {
        next(error);
    }
};

const linkSchema = z.object({
    framework: z.string().min(1),
    controlCode: z.string().min(1),
    documentId: z.uuid().nullable().optional()
});

/**
 * Link (or unlink, with documentId null) a document to a framework control.
 * Only controls from the catalog above can be linked.
 */
const linkDocumentToControl = async (req, res, next) => {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: z.flattenError(parsed.error).fieldErrors });
    }
    const { framework, controlCode, documentId } = parsed.data;

    const control = STATIC_CONTROLS.find((c) => c.framework === framework && c.controlCode === controlCode);
    if (!control) {
        return res.status(400).json({ error: 'Validation failed', details: { controlCode: ['Unknown framework control'] } });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            let doc = null;
            if (documentId) {
                doc = await tx.document.findFirst({ where: { id: documentId, deletedAt: null }, select: { id: true, title: true } });
                if (!doc) return { notFound: true };
            }

            const previous = await tx.frameworkControl.findUnique({
                where: { framework_controlCode: { framework, controlCode } },
                include: { document: { select: { id: true, title: true } } }
            });

            const data = { documentId: documentId || null, linkedAt: documentId ? new Date() : null };
            const saved = await tx.frameworkControl.upsert({
                where: { framework_controlCode: { framework, controlCode } },
                update: data,
                create: { framework, controlCode, name: control.name, description: control.description, ...data },
                include: { document: { select: { id: true, title: true, category: true, expiryDate: true } } }
            });

            const previousDoc = previous && previous.document;
            if (doc) {
                await record(tx, actorFrom(req), {
                    action: 'FRAMEWORK_LINKED', entityType: 'framework_control', entityId: saved.id,
                    documentTitle: doc.title,
                    details: { framework, controlCode, documentId: doc.id, replacedDocumentId: previousDoc && previousDoc.id !== doc.id ? previousDoc.id : null }
                });
            } else if (previousDoc) {
                await record(tx, actorFrom(req), {
                    action: 'FRAMEWORK_UNLINKED', entityType: 'framework_control', entityId: saved.id,
                    documentTitle: previousDoc.title,
                    details: { framework, controlCode, documentId: previousDoc.id }
                });
            }
            return { saved };
        });

        if (result.notFound) return res.status(404).json({ error: 'Document not found' });
        return res.status(200).json(result.saved);
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getFrameworkControls,
    linkDocumentToControl
};
