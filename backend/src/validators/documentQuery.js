const { z } = require('zod');

const SORT_FIELDS = ['createdAt', 'expiryDate', 'issueDate', 'title', 'deletedAt'];

const listDocumentsQuery = z.object({
    search: z.string().trim().max(150).optional(),
    category: z.enum(['license', 'certificate', 'insurance', 'contract', 'permit', 'tax_document']).optional(),
    status: z.enum(['active', 'expiring_soon', 'expired']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sort: z.enum(SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    trash: z.enum(['true', 'false']).default('false'),
});

module.exports = { listDocumentsQuery };
