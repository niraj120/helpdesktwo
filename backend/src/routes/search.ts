import { Router } from 'express';
import { universalSearch } from '../controllers/searchController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// @desc    Universal search across all projects
// @route   GET /api/search/universal
// @access  Private
router.get('/universal', authMiddleware, universalSearch);

export default router;
