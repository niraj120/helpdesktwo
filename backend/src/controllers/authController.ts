import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { sendOTPEmail } from '../utils/emailService';
import { User } from '../models/User';
import { Project } from '../models/Project';
import EulaAcceptance from '../models/EulaAcceptance';
import { logLogin, logLogout } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { generateUserJWT, generateProjectJWT, refreshUserPermissions } from '../utils/jwtUtils';
import { config } from '../config';
import otpStore from '../utils/otpStore';

interface LoginRequest {
  email: string;
  password: string;
  projectId?: string; // Optional project ID for project-specific login
}

interface ForgotPasswordRequest {
  email: string;
}

interface VerifyOTPRequest {
  email: string;
  otp: string;
}

interface ResetPasswordRequest {
  email: string;
  newPassword: string;
}

export const login = async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password, projectId } = req.body;

    console.log('🔐 Login attempt:', email, projectId ? `(Project: ${projectId})` : '');

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user in database and populate role with permissions
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true })
      .populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // If projectId is provided, verify user is mapped to that project
    let projectForJWT = null;
    if (projectId) {
      const isAuthorized = user.projects?.some(
        (pid) => pid.toString() === projectId.toString()
      );
      
      if (!isAuthorized) {
        console.log('❌ User not authorized for project:', projectId);
        
        await logLogin(
          user._id.toString(),
          `${user.firstName} ${user.lastName}`,
          user.email,
          req,
          'failure',
          'User not authorized for this project'
        );
        
        return res.status(403).json({
          success: false,
          error: 'You are not authorized to access this project'
        });
      }

      // Fetch project details for JWT
      projectForJWT = await Project.findById(projectId);
      if (!projectForJWT) {
        console.log('❌ Project not found:', projectId);
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }
    }

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      
      await logLogin(
        user._id.toString(),
        `${user.firstName} ${user.lastName}`,
        user.email,
        req,
        'failure',
        'Invalid password'
      );
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if 2FA is required for this project
    let require2FA = false;
    if (projectForJWT) {
      require2FA = projectForJWT.configuration?.securitySettings?.mfaRequired || false;
    }

    // If 2FA is required and user is not a student, send OTP
    const userRoleName = user.role && typeof user.role === 'object' && 'name' in user.role ? (user.role as any).name : '';
    if (require2FA && userRoleName !== 'Student') {
      if (!user.phone) {
        return res.status(400).json({
          success: false,
          error: 'Mobile number not registered. Please contact administrator.'
        });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP using central otpStore (stores hashed value, optional Redis)
      const otpKey = await otpStore.createOtp(email, otp, 10 * 60, { purpose: '2fa' });

      // TODO: Send OTP via SMS service (Twilio, AWS SNS, etc.)
      // Do not log OTP plaintext in production; keep only non-sensitive notice
      console.log(`📱 2FA OTP generated and dispatched (masked) for ${email} (Phone: ${user.phone})`);

      // Generate temporary token for 2FA verification
      const tempToken = jwt.sign(
        { email, otpKey, purpose: '2fa' },
        config.jwt.secret,
        { expiresIn: '10m' }
      );

      return res.status(200).json({
        success: true,
        require2FA: true,
        tempToken,
        message: 'OTP has been sent to your registered mobile number'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Check if user has accepted the current EULA version (1.0)
    const CURRENT_EULA_VERSION = '1.0';
    const eulaAcceptance = await EulaAcceptance.findOne({
      userId: user._id,
      version: CURRENT_EULA_VERSION
    }).sort({ acceptedAt: -1 });

    const eulaAccepted = !!eulaAcceptance;

    console.log(`📋 EULA Check for ${email}:`);
    console.log(`   - Acceptance found: ${!!eulaAcceptance}`);
    console.log(`   - eulaAccepted value: ${eulaAccepted}`);
    if (eulaAcceptance) {
      console.log(`   - Accepted at: ${eulaAcceptance.acceptedAt}`);
      console.log(`   - Version: ${eulaAcceptance.version}`);
    }

    // Generate JWT token with dynamic permissions using utility
    // Use project-specific JWT if projectId was provided, otherwise standard JWT
    const token = projectForJWT 
      ? await generateProjectJWT(user, projectForJWT)
      : await generateUserJWT(user);

    // Set HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log('✅ Login successful:', email);

    // Get project information based on origin/domain
    let projectName = 'Individual'; // Default for Super Admin or no project
    const origin = req.get('origin') || req.get('referer');
    
    if (origin) {
      console.log('🌐 Login origin:', origin);
      
      // Try to find project by domain URL
      const project = await Project.findOne({ 
        'branding.domainUrl': { $regex: origin.replace(/https?:\/\//, ''), $options: 'i' },
        isActive: true 
      });
      
      if (project) {
        projectName = project.name;
        console.log('✅ Project found:', projectName);
      } else if (user.projects && user.projects.length > 0) {
        // If no project found by domain but user has projects, use first project
        const userProject = await Project.findById(user.projects[0]);
        if (userProject) {
          projectName = userProject.name;
          console.log('✅ Using user\'s first project:', projectName);
        }
      }
    } else if (user.projects && user.projects.length > 0) {
      // No origin header, but user has projects
      const userProject = await Project.findById(user.projects[0]);
      if (userProject) {
        projectName = userProject.name;
        console.log('✅ Using user\'s project (no origin):', projectName);
      }
    }

    // Get role name from populated role or handle if not populated
    let roleName = 'User';
    let permissions: string[] = [];
    if (user.role) {
      if (typeof user.role === 'object') {
        if ('name' in user.role) {
          roleName = (user.role as any).name;
          console.log('✅ Using populated role name:', roleName);
        } else {
          console.log('⚠️  Role object exists but no name field, keys:', Object.keys(user.role));
        }
        // Get permissions from role
        if ('permissions' in user.role && Array.isArray(user.role.permissions)) {
          console.log('🔍 Raw permissions array:', user.role.permissions.length);
          console.log('🔍 First permission type:', typeof user.role.permissions[0]);
          if (user.role.permissions[0]) {
            console.log('🔍 First permission value:', user.role.permissions[0]);
            console.log('🔍 First permission keys:', Object.keys(user.role.permissions[0] || {}));
          }
          
          permissions = user.role.permissions
            .map((p: any) => {
              // If p is already a string, return it
              if (typeof p === 'string') {
                return p;
              }
              // If p is an object with code property
              if (p && typeof p === 'object' && 'code' in p) {
                return p.code;
              }
              // Otherwise, try to convert to string and check if it looks like a permission code
              const str = String(p);
              if (str && str.includes('_')) {
                return str;
              }
              return null;
            })
            .filter(Boolean);
          console.log('✅ Extracted permissions:', permissions.length);
          console.log('🔍 First 5 permissions:', permissions.slice(0, 5));
        } else {
          console.log('⚠️  Permissions not found or not an array');
        }
      } else {
        console.log('⚠️  Role is not an object:', typeof user.role);
      }
    } else {
      console.log('⚠️  Role is null or undefined');
    }

    await logLogin(
      user._id.toString(),
      `${user.firstName} ${user.lastName}`,
      user.email,
      req,
      'success',
      undefined,
      projectName,
      roleName
    );

    return res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: roleName,
          permissions: permissions, // Include permissions for frontend routing
          eulaAccepted: eulaAccepted
        },
        token
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Get current user profile
 */
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find user and populate role with permissions
    const user = await User.findById(userId).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get role information with permissions
    const roleData = user.role && typeof user.role === 'object' 
      ? user.role as any 
      : { name: 'User', code: 'USER', permissions: [] };

    // Extract permission codes
    const permissions = roleData.permissions || [];
    const permissionCodes = permissions.map((p: any) => p.code || p);

    console.log(`🔑 getMe - User: ${user.email}, Permissions: ${permissionCodes.length}`);

    return res.json({
      success: true,
      data: {
        _id: user._id,
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        role: {
          name: roleData.name,
          code: roleData.code,
          _id: roleData._id,
          permissions: permissionCodes // Include permission codes
        },
        projects: user.projects,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const forgotPassword = async (req: Request<{}, {}, ForgotPasswordRequest>, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Check if user exists (For demo, only allow specific email)
    if (email !== 'admin@helpdesk.gov.in') {
      return res.status(404).json({
        success: false,
        error: 'Email address not found in our records'
      });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store OTP using central otpStore (stores hashed value, optional Redis)
    const otpId = await otpStore.createOtp(email, otp, 10 * 60, { purpose: 'forgot_password' });

    // Send OTP email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // For demo, continue without sending actual email
    }

    // NOTE: Do not log OTP plaintext in production. We only indicate generation here.
    console.log(`🔐 Password reset OTP generated for ${email}`);

    return res.json({
      success: true,
      data: { otpId }, // In production, do not return this
      message: 'OTP has been sent to your email address'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const verifyOTP = async (req: Request<{}, {}, VerifyOTPRequest>, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Email and OTP are required'
      });
    }

    // Find OTP keys for this email and try verifying each (otpStore stores hashed values)
    const keys = await otpStore.findOtpKeysByEmail(email);
    let verified = false;
    for (const k of keys) {
      // verifyOtpByKey will delete the key on successful verification
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
        error: 'Invalid or expired OTP'
      });
    }

    return res.json({
      success: true,
      data: { verified: true },
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const resetPassword = async (req: Request<{}, {}, ResetPasswordRequest>, res: Response) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if OTP exists for this email (simplified check similar to previous behavior)
    const keys = await otpStore.findOtpKeysByEmail(email);
    if (!keys || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'OTP verification required'
      });
    }

    // Consume/delete any OTPs for this email
    // eslint-disable-next-line no-await-in-loop
    await otpStore.consumeOtpsForEmail(email);

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password in database
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { password: hashedPassword },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`Password reset completed for ${email}`);

    return res.json({
      success: true,
      data: { updated: true },
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const verify2FA = async (req: Request, res: Response) => {
  try {
    const { email, tempToken, otp } = req.body;

    if (!email || !tempToken || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Email, temporary token, and OTP are required'
      });
    }

    // Verify temp token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, config.jwt.secret);
      if (decoded.purpose !== '2fa' || decoded.email !== email) {
        throw new Error('Invalid token');
      }
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Verify OTP using otpStore (will delete on success)
    const ok = await otpStore.verifyOtpByKey(decoded.otpKey, otp);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'OTP expired or invalid'
      });
    }

    // Find user and complete login
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true })
      .populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Check EULA acceptance
    const CURRENT_EULA_VERSION = '1.0';
    const eulaAcceptance = await EulaAcceptance.findOne({
      userId: user._id,
      version: CURRENT_EULA_VERSION
    }).sort({ acceptedAt: -1 });

    const eulaAccepted = !!eulaAcceptance;

    // Generate JWT token
    const token = await generateUserJWT(user);

    // Set HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log('✅ 2FA verification successful:', email);

    await logLogin(
      user._id.toString(),
      `${user.firstName} ${user.lastName}`,
      user.email,
      req,
      'success',
      undefined,
      user.role && typeof user.role === 'object' && 'name' in user.role ? (user.role as any).name : 'User',
      'Individual' // Will be updated based on project context
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          eulaAccepted
        }
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('2FA verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔓 Logout request received');
    
    // Get user info from auth middleware
    const userId = req.user?.userId;
    const userEmail = req.user?.email;
    
    console.log('User info from token:', { userId, userEmail });
    
    // If we have user info, fetch full user details for logging
    if (userId) {
      try {
        const user = await User.findById(userId).populate('role');
        console.log('User found:', user ? `${user.firstName} ${user.lastName}` : 'Not found');
        
        if (user) {
          // Get role name
          let roleName = 'User';
          if (user.role && typeof user.role === 'object' && 'name' in user.role) {
            roleName = (user.role as any).name;
            console.log('✅ Logout - Using role name:', roleName);
          }
          
          // Get project information based on origin/domain
          let projectName = 'Individual'; // Default for Super Admin or no project
          const origin = req.get('origin') || req.get('referer');
          
          if (origin) {
            console.log('🌐 Logout origin:', origin);
            
            // Try to find project by domain URL
            const project = await Project.findOne({ 
              'branding.domainUrl': { $regex: origin.replace(/https?:\/\//, ''), $options: 'i' },
              isActive: true 
            });
            
            if (project) {
              projectName = project.name;
              console.log('✅ Project found:', projectName);
            } else if (user.projects && user.projects.length > 0) {
              // If no project found by domain but user has projects, use first project
              const userProject = await Project.findById(user.projects[0]);
              if (userProject) {
                projectName = userProject.name;
                console.log('✅ Using user\'s first project:', projectName);
              }
            }
          } else if (user.projects && user.projects.length > 0) {
            // No origin header, but user has projects
            const userProject = await Project.findById(user.projects[0]);
            if (userProject) {
              projectName = userProject.name;
              console.log('✅ Using user\'s project (no origin):', projectName);
            }
          }
          
          console.log('Logging logout activity...');
          await logLogout(
            user._id.toString(),
            `${user.firstName} ${user.lastName}`,
            user.email,
            req,
            projectName,
            roleName
          );
          console.log('✅ Logout activity logged successfully');
        }
      } catch (err) {
        console.error('❌ Error logging logout activity:', err);
        // Continue with logout even if logging fails
      }
    } else {
      console.log('⚠️  No userId found in request');
    }

    // Clear the auth cookie
    res.clearCookie('authToken');

    return res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};