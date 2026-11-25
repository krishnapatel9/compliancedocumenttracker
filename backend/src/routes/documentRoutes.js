const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const verifyPdf = require('../middleware/verifyPdfMiddleware');
const { uuidParam, validateQuery } = require('../middleware/validate');
const { listDocumentsQuery } = require('../validators/documentQuery');
const { createDocument, getDocuments, getDocumentById, updateDocument, deleteDocument, restoreDocument, purgeDocumentNow, downloadDocumentFile } = require('../controllers/documentController');

router.post('/', protect, upload.single('file'), verifyPdf, createDocument);
router.get('/', protect, validateQuery(listDocumentsQuery), getDocuments);
router.get('/:id', protect, uuidParam(), getDocumentById);
router.put('/:id', protect, uuidParam(), upload.single('file'), verifyPdf, updateDocument);
router.delete('/:id', protect, uuidParam(), deleteDocument);
router.post('/:id/restore', protect, uuidParam(), restoreDocument);
router.delete('/:id/permanent', protect, uuidParam(), purgeDocumentNow);
router.get('/:id/file', protect, uuidParam(), downloadDocumentFile);

module.exports = router;
