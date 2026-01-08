import { Router } from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { 
  getProjectBrandingByUrl, 
  projectLogin,
  projectLoginByUrl,
  projectForgotPassword,
  projectVerifyOTP,
  projectResetPassword
} from '../controllers/projectAuthController';

const router = Router();

// @desc    Get project branding by custom URL or domain
// @route   GET /api/project-auth/branding/:urlPath
// @access  Public (no authentication required)
router.get('/branding/:urlPath', getProjectBrandingByUrl);

// @desc    Project-specific login by custom URL path
// @route   POST /api/project-auth/:customUrlPath/login
// @access  Public
router.post('/:customUrlPath/login', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validateRequest
], projectLoginByUrl);

// @desc    Project-specific login
// @route   POST /api/project-auth/login
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('projectId')
    .notEmpty()
    .withMessage('Project ID is required'),
  validateRequest
], projectLogin);

// @desc    Project-specific forgot password by custom URL path
// @route   POST /api/project-auth/:customUrlPath/forgot-password
// @access  Public
router.post('/:customUrlPath/forgot-password', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  validateRequest
], projectForgotPassword);

// @desc    Project-specific verify OTP by custom URL path
// @route   POST /api/project-auth/:customUrlPath/verify-otp
// @access  Public
router.post('/:customUrlPath/verify-otp', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('otp')
    .notEmpty()
    .withMessage('OTP is required'),
  validateRequest
], projectVerifyOTP);

// @desc    Project-specific reset password by custom URL path
// @route   POST /api/project-auth/:customUrlPath/reset-password
// @access  Public
router.post('/:customUrlPath/reset-password', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  validateRequest
], projectResetPassword);

export default router;
