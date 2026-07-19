const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { createDocument, getDocuments, getDocumentById, updateDocument, deleteDocument, downloadDocumentFile } = require('../controllers/documentController');

router.post('/', protect, upload.single('file'), createDocument);
router.get('/', protect, getDocuments);
router.get('/:id', protect, getDocumentById);
router.put('/:id', protect, upload.single('file'), updateDocument);
router.delete('/:id', protect, deleteDocument);
router.get('/:id/file', protect, downloadDocumentFile);

module.exports = router;
