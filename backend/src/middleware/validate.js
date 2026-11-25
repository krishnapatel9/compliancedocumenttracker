const { z } = require('zod');

const uuidSchema = z.uuid();

/** Router param guard: a malformed id is a 404, not a Prisma 500. */
const uuidParam = (name = 'id') => (req, res, next) => {
    if (!uuidSchema.safeParse(req.params[name]).success) {
        return res.status(404).json({ error: 'Document not found' });
    }
    next();
};

/** Validates req.query with a zod schema and stores the parsed result on req.validatedQuery. */
const validateQuery = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
        return res.status(400).json({ error: 'Validation failed', details: z.flattenError(result.error).fieldErrors });
    }
    req.validatedQuery = result.data;
    next();
};

module.exports = { uuidParam, validateQuery };
