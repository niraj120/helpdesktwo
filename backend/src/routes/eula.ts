import { Router } from 'express';
import { auth } from '../middleware/auth';
import {
  acceptEula,
  getLatestEula,
  hasAcceptedEula,
} from '../controllers/eulaController';

const router = Router();

// @desc    Get latest EULA
// @route   GET /api/auth/eula/latest
// @access  Public
router.get('/eula/latest', getLatestEula);

// @desc    Check if user has accepted EULA
// @route   GET /api/auth/eula/check
// @access  Private
router.get('/eula/check', auth, hasAcceptedEula);

// @desc    Accept EULA
// @route   POST /api/auth/eula/accept
// @access  Private
router.post('/eula/accept', auth, acceptEula);

export default router;
