import express from 'express';
import {
  getPublicArticles,
  getPublicArticleById,
  searchPublicArticles,
} from '../controllers/kbPublicController';
import { publicAuth } from '../middleware/auth';

const router = express.Router();

// Public routes - no authentication required (for submit-ticket page)
// Uses publicAuth so it works for both logged-in and public users
router.get('/articles', publicAuth, getPublicArticles);

// Search public articles - also public
router.get('/articles/search', publicAuth, searchPublicArticles);

// Get single public article - also public
router.get('/articles/:id', publicAuth, getPublicArticleById);

export default router;
