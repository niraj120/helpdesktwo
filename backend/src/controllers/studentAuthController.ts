import { Request, Response } from 'express';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Project } from '../models/Project';
import { generateProjectJWT, generateUserJWT } from '../utils/jwtUtils';
import { sendOTPEmail } from '../utils/emailService';
import otpStore from '../utils/otpStore';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';

// Use centralized config for JWT secret
const getJwtSecret = () => config.jwt.secret;
const JWT_EXPIRY = '7d';

/**
 * Send OTP to student email for first-time login
 */
export const sendOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find student user
    const user = await User.findOne({ email: email.toLowerCase() }).populate('role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email. Please submit a ticket first to create an account.',
      });
    }

    // Check if user is a student
    const role = user.role as any;
    if (role.code !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'This login is for students only. Please use the admin login.',
      });
    }

    // Check if account is locked
    if (user.isResetPasswordLocked()) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP attempts. Please try again later.',
      });
    }

    // Generate OTP locally (do not persist plaintext OTP to DB)
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store OTP using centralized otpStore (hashed, optional Redis)
    const projectId = user.projects && user.projects.length > 0 ? user.projects[0].toString() : undefined;
    await otpStore.createOtp(email.toLowerCase(), otp, 10 * 60, { projectId, purpose: 'student_password_setup' });

    // Do not log OTP plaintext in production; indicate generation only
    console.log(`📧 OTP generated for ${email} (dispatched)`);

    // Send email with OTP
    try {
      const emailSent = await sendOTPEmail(email, otp, projectId);
      if (emailSent) {
        console.log(`✅ OTP email sent to ${email}`);
      } else {
        console.log(`⚠️  OTP email not sent (email config might be disabled)`);
      }
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
    }

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your email. Please check your inbox.',
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Verify OTP and return temporary token for password setup
 */
export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    // Find user by email
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    }).populate('role');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    // Verify OTP via centralized otpStore
    const keys = await otpStore.findOtpKeysByEmail(email.toLowerCase());
    let verified = false;
    for (const k of keys) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await otpStore.verifyOtpByKey(k, otp);
      if (ok) {
        verified = true;
        break;
      }
    }

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    // Clear any setup flags on user (if present)
    user.resetPasswordAttempts = 0;
    await user.save();

    console.log(`✅ OTP verified for ${email}`);

    // Generate temporary token for password setup (15 minutes expiry)
    const tempToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        type: 'password-setup'
      },
      getJwtSecret(),
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        tempToken,
        requirePasswordSetup: user.requirePasswordSetup,
        firstName: user.firstName,
      },
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Set password for first-time student users
 */
export const setPassword = async (req: Request, res: Response) => {
  try {
    const { password, confirmPassword } = req.body;
    const { customUrlPath } = req.params; // Extract from URL params
    const authHeader = req.headers.authorization;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password and confirmation are required',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Temporary token required',
      });
    }

    const tempToken = authHeader.substring(7);

    // Verify temporary token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, getJwtSecret());
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    if (decoded.type !== 'password-setup') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
      });
    }

    // Find user and set password
    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Cast role for proper typing
    const role = user.role as any;

    // Set password and remove setup flag
    user.password = password; // Will be hashed by pre-save hook
    user.requirePasswordSetup = false;
    await user.save();

    console.log(`🔐 Password set for ${user.email}`);

    // Generate JWT token with dynamic permissions using utility
    const project = await Project.findOne({ 
      'branding.customUrlPath': customUrlPath 
    });
    const token = project ? 
      await generateProjectJWT(user, project) : 
      await generateUserJWT(user);

    return res.status(200).json({
      success: true,
      message: 'Password set successfully',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: {
            _id: role._id,
            code: role.code,
            name: role.name,
          },
        },
      },
    });

  } catch (error) {
    console.error('Set password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set password',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Student login with email and password
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find student user
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      isActive: true,
    }).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if user is a student
    const role = user.role as any;
    if (role.code !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'This login is for students only. Please use the admin login.',
      });
    }

    // Check if password setup is required
    if (user.requirePasswordSetup) {
      return res.status(403).json({
        success: false,
        message: 'Please set up your password first using OTP verification',
        requirePasswordSetup: true,
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log(`🔑 Student login successful: ${email}`);

    // Generate JWT token with proper permission structure using utility
    const token = await generateUserJWT(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: {
            _id: role._id,
            code: role.code,
            name: role.name,
          },
        },
      },
    });

  } catch (error) {
    console.error('Student login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Check if user exists and requires password setup
 */
export const checkUser = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).populate('role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found. Please submit a ticket first.',
        userExists: false,
      });
    }

    const role = user.role as any;
    if (!role || role.code !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'This is not a student account.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        userExists: true,
        requirePasswordSetup: user.requirePasswordSetup,
        firstName: user.firstName,
      },
    });

  } catch (error) {
    console.error('Check user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check user',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
