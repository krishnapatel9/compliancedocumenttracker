const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const { deleteFile, saveFile } = require('../utils/storage');
const { createDocumentSchema } = require('../validators/documentValidator');

const prisma = new PrismaClient();

const computeStatus = (expiryDate) => {
    const expiry = new Date(expiryDate);
    const current = new Date();
    expiry.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);

    const diffTime = expiry - current;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { status: 'expired', daysRemaining: diffDays };
    } else if (diffDays <= 30) {
        return { status: 'expiring_soon', daysRemaining: diffDays };
    } else {
        return { status: 'active', daysRemaining: diffDays };
    }
};

const createDocument = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'PDF file upload is required' });
    }

    const result = createDocumentSchema.safeParse(req.body);
    if (!result.success) {
        deleteFile(req.file.path);
        return res.status(400).json({
            error: 'Validation failed',
            details: result.error.flatten().fieldErrors
        });
    }

    const { title, category, issueDate, expiryDate, notifyEmail, description } = result.data;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const issue = new Date(issueDate);
    issue.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    if (issue > today) {
        deleteFile(req.file.path);
        return res.status(400).json({ error: 'Validation failed', details: { issueDate: ['Issue date cannot be in the future'] } });
    }

    if (expiry <= issue) {
        deleteFile(req.file.path);
        return res.status(400).json({ error: 'Validation failed', details: { expiryDate: ['Expiry date must be after the issue date'] } });
    }

    try {
        const storedPath = await saveFile(req.file);

        const document = await prisma.document.create({
            data: {
                title,
                category,
                issueDate: issue,
                expiryDate: expiry,
                notifyEmail,
                description: description || null,
                filePath: storedPath
            }
        });

        const statusInfo = computeStatus(document.expiryDate);

        return res.status(201).json({
            message: 'Document created successfully',
            document: {
                ...document,
                status: statusInfo.status,
                daysRemaining: statusInfo.daysRemaining
            }
        });
    } catch (error) {
        deleteFile(req.file.path);
        return res.status(500).json({ error: 'Database error during document creation', details: error.message });
    }
};

const getDocuments = async (req, res) => {
    try {
        const { search, category, status, page = 1, limit = 10 } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const plus30Days = new Date(today);
        plus30Days.setDate(today.getDate() + 30);
        plus30Days.setHours(23, 59, 59, 999);

        const where = {};

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (category) {
            where.category = category;
        }

        if (status) {
            if (status === 'expired') {
                where.expiryDate = { lt: today };
            } else if (status === 'expiring_soon') {
                where.expiryDate = { gte: today, lte: plus30Days };
            } else if (status === 'active') {
                where.expiryDate = { gt: plus30Days };
            }
        }

        const totalItems = await prisma.document.count({ where });
        const documents = await prisma.document.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum
        });

        const mapped = documents.map(doc => {
            const statusInfo = computeStatus(doc.expiryDate);
            return {
                ...doc,
                status: statusInfo.status,
                daysRemaining: statusInfo.daysRemaining
            };
        });

        const totalPages = Math.ceil(totalItems / limitNum);

        return res.status(200).json({
            items: mapped,
            totalItems,
            totalPages,
            page: pageNum,
            limit: limitNum
        });
    } catch (error) {
        return res.status(500).json({ error: 'Database error during fetch', details: error.message });
    }
};

const getDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await prisma.document.findUnique({
            where: { id }
        });
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const statusInfo = computeStatus(document.expiryDate);
        return res.status(200).json({
            ...document,
            status: statusInfo.status,
            daysRemaining: statusInfo.daysRemaining
        });
    } catch (error) {
        return res.status(500).json({ error: 'Database error', details: error.message });
    }
};

const updateDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { updateDocumentSchema } = require('../validators/documentValidator');

        const existingDoc = await prisma.document.findUnique({ where: { id } });
        if (!existingDoc) {
            if (req.file) deleteFile(req.file.path);
            return res.status(404).json({ error: 'Document not found' });
        }

        const result = updateDocumentSchema.safeParse(req.body);
        if (!result.success) {
            if (req.file) deleteFile(req.file.path);
            return res.status(400).json({
                error: 'Validation failed',
                details: result.error.flatten().fieldErrors
            });
        }

        const updateData = { ...result.data };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const issue = updateData.issueDate ? new Date(updateData.issueDate) : new Date(existingDoc.issueDate);
        issue.setHours(0, 0, 0, 0);

        const expiry = updateData.expiryDate ? new Date(updateData.expiryDate) : new Date(existingDoc.expiryDate);
        expiry.setHours(0, 0, 0, 0);

        if (updateData.issueDate && issue > today) {
            if (req.file) deleteFile(req.file.path);
            return res.status(400).json({ error: 'Validation failed', details: { issueDate: ['Issue date cannot be in the future'] } });
        }

        if (expiry <= issue) {
            if (req.file) deleteFile(req.file.path);
            return res.status(400).json({ error: 'Validation failed', details: { expiryDate: ['Expiry date must be after the issue date'] } });
        }

        if (updateData.issueDate) updateData.issueDate = issue;
        if (updateData.expiryDate) updateData.expiryDate = expiry;

        let oldFilePath = null;
        if (req.file) {
            oldFilePath = existingDoc.filePath;
            updateData.filePath = await saveFile(req.file);
        }

        const updated = await prisma.document.update({
            where: { id },
            data: updateData
        });

        if (oldFilePath) {
            deleteFile(oldFilePath);
        }

        const statusInfo = computeStatus(updated.expiryDate);

        return res.status(200).json({
            message: 'Document updated successfully',
            document: {
                ...updated,
                status: statusInfo.status,
                daysRemaining: statusInfo.daysRemaining
            }
        });

    } catch (error) {
        if (req.file) {
            deleteFile(req.file.path);
        }
        return res.status(500).json({ error: 'Database error during update', details: error.message });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await prisma.document.findUnique({
            where: { id }
        });
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        await prisma.document.delete({
            where: { id }
        });

        deleteFile(document.filePath);

        return res.status(200).json({ message: 'Document and associated files deleted successfully' });
    } catch (error) {
        return res.status(500).json({ error: 'Database error during delete', details: error.message });
    }
};

const downloadDocumentFile = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await prisma.document.findUnique({
            where: { id }
        });
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        if (!fs.existsSync(document.filePath)) {
            return res.status(404).json({ error: 'Physical file not found on server' });
        }

        const path = require('path');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${document.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
        );

        const fileStream = fs.createReadStream(document.filePath);
        fileStream.pipe(res);
    } catch (error) {
        return res.status(500).json({ error: 'Server error during download', details: error.message });
    }
};

module.exports = {
    createDocument,
    getDocuments,
    getDocumentById,
    updateDocument,
    deleteDocument,
    downloadDocumentFile,
    computeStatus
};
