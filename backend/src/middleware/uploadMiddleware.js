const multer = require('multer');

// Files stay in memory and go straight into Postgres (see DocumentFile in schema.prisma).
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        const err = new Error('PDF files only are allowed (application/pdf)');
        err.code = 'INVALID_FILE_TYPE';
        cb(err, false);
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 } // 5MB
});

module.exports = upload;
