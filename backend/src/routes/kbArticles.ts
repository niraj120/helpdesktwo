import express from 'express';
import multer from 'multer';
import {
  createArticle,
  getArticles,
  getArticleById,
  updateArticle,
  deleteArticle,
  searchArticles,
  uploadEditorImage,
} from '../controllers/kbArticleController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf') {
      // Accept only PDFs
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    } else if (file.fieldname === 'image') {
      // Accept only images
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    } else {
      cb(null, true);
    }
  },
});

// All routes require authentication
router.use(authMiddleware);

// GET routes - allow KB_VIEW_CONTENT or KB_MANAGE permission
// Get all KB Articles (with pagination)
router.get('/', checkPermission(['KB_VIEW_CONTENT', 'KB_MANAGE']), getArticles);

// Search KB Articles
router.get('/search', checkPermission(['KB_VIEW_CONTENT', 'KB_MANAGE']), searchArticles);

// Upload image for editor - requires KB_MANAGE
router.post('/upload-image', checkPermission('KB_MANAGE'), upload.single('image'), uploadEditorImage);

// Create KB Article (with PDF upload) - requires KB_MANAGE
router.post('/', checkPermission('KB_MANAGE'), upload.single('pdf'), createArticle);

// Get single KB Article - allow KB_VIEW_CONTENT or KB_MANAGE permission
router.get('/:id', checkPermission(['KB_VIEW_CONTENT', 'KB_MANAGE']), getArticleById);

// Update KB Article (with PDF upload) - requires KB_MANAGE
router.put('/:id', checkPermission('KB_MANAGE'), upload.single('pdf'), updateArticle);

// Delete KB Article - requires KB_MANAGE
router.delete('/:id', checkPermission('KB_MANAGE'), deleteArticle);

export default router;
