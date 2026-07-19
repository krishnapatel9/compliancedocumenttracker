const { z } = require('zod');

const DocumentCategoryEnum = z.enum([
    'license',
    'certificate',
    'insurance',
    'contract',
    'permit',
    'tax_document'
]);

const createDocumentSchema = z.object({
    title: z.string().min(3, "Title must be between 3 and 150 characters").max(150, "Title must be between 3 and 150 characters"),
    category: DocumentCategoryEnum,
    issueDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid issue date"),
    expiryDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid expiry date"),
    notifyEmail: z.string().email("Invalid notify email address"),
    description: z.string().optional().nullable()
});

const updateDocumentSchema = z.object({
    title: z.string().min(3, "Title must be between 3 and 150 characters").max(150, "Title must be between 3 and 150 characters").optional(),
    category: DocumentCategoryEnum.optional(),
    issueDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid issue date").optional(),
    expiryDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid expiry date").optional(),
    notifyEmail: z.string().email("Invalid notify email address").optional(),
    description: z.string().optional().nullable()
});

module.exports = { createDocumentSchema, updateDocumentSchema };
