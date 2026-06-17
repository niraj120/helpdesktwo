import express from 'express';
import { sendOTP, verifyOTP, setPassword, login, checkUser } from '../controllers/studentAuthController';
import { authRateLimiter } from '../middleware/authRateLimiter';

const router = express.Router();

/**
 * Student Authentication Routes
 * All routes are public (no auth middleware required).
 * Rate-limited per client IP to deter brute force / account enumeration
 * (VAPT CODE-1).
 */
router.use(authRateLimiter);

// Check if user exists and their setup status
router.post('/check-user', checkUser);

// Send OTP to email for first-time setup
router.post('/send-otp', sendOTP);

// Verify OTP and get temporary token
router.post('/verify-otp', verifyOTP);

// Set password for first-time users (requires temp token from verify-otp)
router.post('/set-password', setPassword);

// Login with email and password
router.post('/login', login);

export default router;
