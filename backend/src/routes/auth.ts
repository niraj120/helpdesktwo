import { Router } from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import {
  login,
  logout,
  forgotPassword,
  verifyOTP,
  resetPassword,
  verify2FA,
  getMe,
} from '../controllers/authController';
import { refreshPermissions } from '../controllers/permissionController';
import { auth, authMiddleware } from '../middleware/auth';

const router = Router();

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
  validateRequest,
], login);

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', authMiddleware, getMe);

// @desc    Refresh user permissions
// @route   POST /api/auth/refresh-permissions
// @access  Private
router.post('/refresh-permissions', authMiddleware, refreshPermissions);

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', auth, logout);

// @desc    Forgot password - Send OTP
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  validateRequest,
], forgotPassword);

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('otp').notEmpty().withMessage('OTP is required'),
  validateRequest,
], verifyOTP);

// @desc    Verify 2FA OTP
// @route   POST /api/auth/verify-2fa
// @access  Public
router.post('/verify-2fa', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('tempToken').notEmpty().withMessage('Temporary token is required'),
  body('otp').notEmpty().withMessage('OTP is required'),
  validateRequest,
], verify2FA);

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  validateRequest,
], resetPassword);

export default router;
