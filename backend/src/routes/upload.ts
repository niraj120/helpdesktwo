import express from 'express';
import { uploadKBPdf, uploadPdfMiddleware, deleteKBPdf } from '../controllers/kbPdfUploadController';
import { auth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Upload KB PDF
router.post(
  '/kb-pdf',
  auth,
  checkPermission('KB_CREATE'),
  uploadPdfMiddleware,
  uploadKBPdf
);

// Delete KB PDF
router.delete(
  '/kb-pdf/:filename',
  auth,
  checkPermission('KB_DELETE'),
  deleteKBPdf
);

export default router;
