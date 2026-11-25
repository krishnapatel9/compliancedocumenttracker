const { z } = require('zod');
const prisma = require('../db');
const { createDocumentSchema, updateDocumentSchema } = require('../validators/documentValidator');
const { toDateOnly, todayDateOnly } = require('../utils/dates');
const { computeStatus, statusWhere } = require('../utils/documentStatus');
const { actorFrom, record, diffDocument } = require('../services/audit');
const { purgeAt, purgeDocument, retentionDays } = require('../services/retention');

// Never select the PDF bytes for list/detail responses.
const FILE_META = { select: { fileName: true, size: true } };

const present = (doc, today) => {
    const { file, ...rest } = doc;
    const statusInfo = computeStatus(doc.expiryDate, today);
    return {
        ...rest,
        purgeAt: doc.deletedAt ? purgeAt(doc.deletedAt) : null,
        hasFile: Boolean(file),
        file: file ? { fileName: file.fileName, size: file.size } : null,
        status: statusInfo.status,
        daysRemaining: statusInfo.daysRemaining
    };
};

const fail = (res, field, message, status = 400) =>
    res.status(status).json({ error: 'Validation failed', details: { [field]: [message] } });

const fileRecord = (file) => ({
    fileName: (file.originalname || 'document.pdf').slice(0, 255),
    mimeType: 'application/pdf',
    size: file.size,
    data: file.buffer
});

const createDocument = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: 'PDF file upload is required' });
    }

    const result = createDocumentSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: 'Validation failed', details: z.flattenError(result.error).fieldErrors });
    }

    const { title, category, issueDate, expiryDate, notifyEmail, description } = result.data;

    const today = todayDateOnly();
    const issue = toDateOnly(issueDate);
    const expiry = toDateOnly(expiryDate);

    if (!issue || !expiry) return fail(res, 'issueDate', 'Dates must be valid YYYY-MM-DD values');
    if (issue > today) return fail(res, 'issueDate', 'Issue date cannot be in the future');
    if (expiry <= issue) return fail(res, 'expiryDate', 'Expiry date must be after the issue date');

    try {
        const document = await prisma.$transaction(async (tx) => {
            const created = await tx.document.create({
                data: {
                    title,
                    category,
                    issueDate: issue,
                    expiryDate: expiry,
                    notifyEmail,
                    description: description || null,
                    file: { create: fileRecord(req.file) }
                },
                include: { file: FILE_META }
            });
            await record(tx, actorFrom(req), {
                action: 'DOCUMENT_CREATED',
                entityType: 'document',
                entityId: created.id,
                documentTitle: created.title,
                details: { category, issueDate, expiryDate, notifyEmail, fileName: req.file.originalname, fileSize: req.file.size }
            });
            return created;
        });

        return res.status(201).json({ message: 'Document created successfully', document: present(document, today) });
    } catch (error) {
        return next(error);
    }
};

const getDocuments = async (req, res, next) => {
    try {
        const { search, category, status, page, limit, sort, order, trash } = req.validatedQuery;
        const today = todayDateOnly();

        // The trash lists soft-deleted documents; everything else only sees live ones.
        const where = { deletedAt: trash === 'true' ? { not: null } : null };
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (category) where.category = category;
        if (status) where.expiryDate = statusWhere(status, today);

        const [totalItems, documents] = await Promise.all([
            prisma.document.count({ where }),
            prisma.document.findMany({
                where,
                include: { file: FILE_META },
                orderBy: [{ [sort]: order }, { id: 'asc' }],
                skip: (page - 1) * limit,
                take: limit
            })
        ]);

        return res.status(200).json({
            items: documents.map((d) => present(d, today)),
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
            page,
            limit
        });
    } catch (error) {
        return next(error);
    }
};

const getDocumentById = async (req, res, next) => {
    try {
        const document = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { file: FILE_META } });
        if (!document) return res.status(404).json({ error: 'Document not found' });
        return res.status(200).json(present(document, todayDateOnly()));
    } catch (error) {
        return next(error);
    }
};

const updateDocument = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existingDoc = await prisma.document.findFirst({ where: { id, deletedAt: null } });
        if (!existingDoc) return res.status(404).json({ error: 'Document not found' });

        const result = updateDocumentSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: 'Validation failed', details: z.flattenError(result.error).fieldErrors });
        }

        const updateData = { ...result.data };

        const today = todayDateOnly();
        const issue = toDateOnly(updateData.issueDate || existingDoc.issueDate);
        const expiry = toDateOnly(updateData.expiryDate || existingDoc.expiryDate);

        if (!issue || !expiry) return fail(res, 'issueDate', 'Dates must be valid YYYY-MM-DD values');
        if (updateData.issueDate && issue > today) return fail(res, 'issueDate', 'Issue date cannot be in the future');
        if (expiry <= issue) return fail(res, 'expiryDate', 'Expiry date must be after the issue date');

        if (updateData.issueDate) updateData.issueDate = issue;
        if (updateData.expiryDate) updateData.expiryDate = expiry;

        if (req.file) {
            const record = fileRecord(req.file);
            updateData.file = { upsert: { create: record, update: { ...record, uploadedAt: new Date() } } };
        }

        const updated = await prisma.$transaction(async (tx) => {
            const doc = await tx.document.update({
                where: { id },
                data: updateData,
                include: { file: FILE_META }
            });
            const changes = diffDocument(existingDoc, doc);
            if (Object.keys(changes).length > 0 || req.file) {
                await record(tx, actorFrom(req), {
                    action: 'DOCUMENT_UPDATED',
                    entityType: 'document',
                    entityId: id,
                    documentTitle: doc.title,
                    details: { changes, fileReplaced: Boolean(req.file), ...(req.file ? { fileName: req.file.originalname, fileSize: req.file.size } : {}) }
                });
            }
            return doc;
        });

        return res.status(200).json({ message: 'Document updated successfully', document: present(updated, today) });
    } catch (error) {
        return next(error);
    }
};

// Moves the document to the trash. It stays restorable for RETENTION_DAYS, then is purged.
const deleteDocument = async (req, res, next) => {
    try {
        const { id } = req.params;
        const deleted = await prisma.$transaction(async (tx) => {
            const doc = await tx.document.findFirst({ where: { id, deletedAt: null } });
            if (!doc) return null;
            const now = new Date();
            await tx.document.update({ where: { id }, data: { deletedAt: now } });
            await record(tx, actorFrom(req), {
                action: 'DOCUMENT_DELETED',
                entityType: 'document',
                entityId: id,
                documentTitle: doc.title,
                details: { expiryDate: doc.expiryDate, restorableUntil: purgeAt(now) }
            });
            return { doc, now };
        });
        if (!deleted) return res.status(404).json({ error: 'Document not found' });

        return res.status(200).json({
            message: `Document moved to trash. It can be restored for ${retentionDays()} days.`,
            restorableUntil: purgeAt(deleted.now)
        });
    } catch (error) {
        return next(error);
    }
};

const restoreDocument = async (req, res, next) => {
    try {
        const { id } = req.params;
        const restored = await prisma.$transaction(async (tx) => {
            const doc = await tx.document.findFirst({ where: { id, deletedAt: { not: null } } });
            if (!doc) return null;
            const updated = await tx.document.update({ where: { id }, data: { deletedAt: null }, include: { file: FILE_META } });
            await record(tx, actorFrom(req), {
                action: 'DOCUMENT_RESTORED',
                entityType: 'document',
                entityId: id,
                documentTitle: doc.title,
                details: { deletedAt: doc.deletedAt }
            });
            return updated;
        });
        if (!restored) return res.status(404).json({ error: 'Document not found in trash' });
        return res.status(200).json({ message: 'Document restored', document: present(restored, todayDateOnly()) });
    } catch (error) {
        return next(error);
    }
};

// Deletes a trashed document for good (file and reminder history included).
const purgeDocumentNow = async (req, res, next) => {
    try {
        const ok = await purgeDocument(req.params.id, actorFrom(req), 'permanently deleted by admin');
        if (!ok) return res.status(404).json({ error: 'Document not found in trash' });
        return res.status(200).json({ message: 'Document permanently deleted' });
    } catch (error) {
        return next(error);
    }
};

const downloadDocumentFile = async (req, res, next) => {
    try {
        const document = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true, title: true } });
        if (!document) return res.status(404).json({ error: 'Document not found' });

        const file = await prisma.documentFile.findUnique({ where: { documentId: document.id } });
        if (!file) return res.status(404).json({ error: 'No file stored for this document. Re-upload it via Edit.' });

        // Who accessed the evidence is part of the trail. Failing to record it fails the download.
        await record(null, actorFrom(req), {
            action: 'DOCUMENT_DOWNLOADED',
            entityType: 'document',
            entityId: document.id,
            documentTitle: document.title,
            details: { fileName: file.fileName, size: file.size }
        });

        const safeName = document.title.replace(/[^a-zA-Z0-9]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', file.size);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
        return res.status(200).end(Buffer.from(file.data));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    createDocument,
    getDocuments,
    getDocumentById,
    updateDocument,
    deleteDocument,
    restoreDocument,
    purgeDocumentNow,
    downloadDocumentFile
};
