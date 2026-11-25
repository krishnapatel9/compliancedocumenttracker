/**
 * Verifies the uploaded file starts with the PDF magic bytes ("%PDF"), regardless of the
 * client-supplied mimetype.
 */
const verifyPdf = (req, res, next) => {
    if (!req.file) return next();

    if (!req.file.buffer || req.file.buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
        return res.status(400).json({
            error: 'Validation failed',
            details: { file: ['Invalid file format. The file structure is not a valid PDF document.'] }
        });
    }
    next();
};

module.exports = verifyPdf;
