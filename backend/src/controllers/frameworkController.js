const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
const getFrameworkControls = async (req, res) => {
    try {
        const linkedControls = await prisma.frameworkControl.findMany({
            include: {
                document: true
            }
        });

        // Compute days remaining and status inline for each linked document
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const controlMap = {};
        linkedControls.forEach(item => {
            const key = `${item.framework}-${item.controlCode}`;

            let docDetails = null;
            if (item.document) {
                const expiry = new Date(item.document.expiryDate);
                expiry.setHours(0, 0, 0, 0);

                const diffTime = expiry.getTime() - today.getTime();
                const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let computedStatus = 'active';
                if (daysRemaining < 0) {
                    computedStatus = 'expired';
                } else if (daysRemaining <= 30) {
                    computedStatus = 'expiring_soon';
                }

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
        console.error('Error fetching framework controls:', error);
        res.status(500).json({ error: 'Server error fetching frameworks data', details: error.message });
    }
};

/**
 * Link a document to a framework control
 */
const linkDocumentToControl = async (req, res) => {
    const { framework, controlCode, documentId } = req.body;

    if (!framework || !controlCode) {
        return res.status(400).json({ error: 'Validation failed', details: { framework: 'Framework and controlCode are required.' } });
    }

    try {
        // Validate if document exists (if documentId is provided)
        if (documentId) {
            const doc = await prisma.document.findUnique({
                where: { id: documentId }
            });
            if (!doc) {
                return res.status(404).json({ error: 'Document not found' });
            }
        }

        // Find existing mapper
        const existing = await prisma.frameworkControl.findFirst({
            where: { framework, controlCode }
        });

        let result;
        if (existing) {
            result = await prisma.frameworkControl.update({
                where: { id: existing.id },
                data: {
                    documentId: documentId || null,
                    linkedAt: documentId ? new Date() : null
                },
                include: {
                    document: true
                }
            });
        } else {
            result = await prisma.frameworkControl.create({
                data: {
                    framework,
                    controlCode,
                    name: STATIC_CONTROLS.find(c => c.framework === framework && c.controlCode === controlCode)?.name || 'Standard Control',
                    description: STATIC_CONTROLS.find(c => c.framework === framework && c.controlCode === controlCode)?.description || '',
                    documentId: documentId || null,
                    linkedAt: documentId ? new Date() : null
                },
                include: {
                    document: true
                }
            });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error('Error linking document to control:', error);
        res.status(500).json({ error: 'Server error linking document to control', details: error.message });
    }
};

module.exports = {
    getFrameworkControls,
    linkDocumentToControl
};
