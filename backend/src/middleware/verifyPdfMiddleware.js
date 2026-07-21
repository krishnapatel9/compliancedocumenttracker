const fs = require('fs');
const path = require('path');
const { deleteFile } = require('../utils/storage');

/**
 * Express middleware to verify that the uploaded file starts with the PDF magic bytes.
 */
const verifyPdf = (req, res, next) => {
    if (!req.file) {
        return next();
    }

    try {
        const filePath = req.file.path;

        // Read first 4 bytes of the uploaded file
        const buffer = Buffer.alloc(4);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);

        // PDF magic bytes: %PDF (25 50 44 46 in hex)
        const magicBytes = buffer.toString('hex').toLowerCase();
        if (magicBytes !== '25504446') {
            // Delete the invalid file using storage helper
            deleteFile(filePath);
            return res.status(400).json({
                error: 'Validation failed',
                details: { file: ['Invalid file format. The file structure is not a valid PDF document.'] }
            });
        }

        next();
    } catch (error) {
        if (req.file && req.file.path) {
            deleteFile(req.file.path);
        }
        return res.status(500).json({ error: 'Server error during file verification', details: error.message });
    }
};

module.exports = verifyPdf;
