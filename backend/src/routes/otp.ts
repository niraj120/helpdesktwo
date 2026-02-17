import { Router } from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { sendPhoneOtp, sendEmailOtp, verifyOtp } from '../controllers/otpController';

const router = Router();

// @desc    Send OTP to phone number (SMS)
// @route   POST /api/otp/send-phone
// @access  Public
router.post('/send-phone', [
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required'),
  body('projectId')
    .notEmpty()
    .withMessage('Project ID is required'),
  validateRequest
], sendPhoneOtp);

// @desc    Send OTP to email address
// @route   POST /api/otp/send-email
// @access  Public
router.post('/send-email', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('projectId')
    .notEmpty()
    .withMessage('Project ID is required'),
  validateRequest
], sendEmailOtp);

// @desc    Verify OTP
// @route   POST /api/otp/verify
// @access  Public
router.post('/verify', [
  body('otpKey')
    .notEmpty()
    .withMessage('OTP key is required'),
  body('otp')
    .notEmpty()
    .withMessage('OTP is required'),
  validateRequest
], verifyOtp);

export default router;
