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

// All routes require authentication and KB management permission
router.use(authMiddleware);
router.use(checkPermission('KB_MANAGE'));

// Create KB Article (with PDF upload)
router.post('/', upload.single('pdf'), createArticle);

// Get all KB Articles (with pagination)
router.get('/', getArticles);

// Search KB Articles
router.get('/search', searchArticles);

// Upload image for editor
router.post('/upload-image', upload.single('image'), uploadEditorImage);

// Get single KB Article
router.get('/:id', getArticleById);

// Update KB Article (with PDF upload)
router.put('/:id', upload.single('pdf'), updateArticle);

// Delete KB Article
router.delete('/:id', deleteArticle);

export default router;
