import { Request, Response } from "express";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { Project } from "../models/Project";
import { validatePasswordPolicy } from "../utils/passwordPolicyUtils";
import { generateProjectJWT, generateUserJWT } from "../utils/jwtUtils";
import { sendOTPEmail } from "../utils/emailService";
import { sendOTPWhatsApp } from "../utils/whatsappService";
import { sendOTPSMS } from "../utils/smsService";
import otpStore from "../utils/otpStore";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config";

// Use centralized config for JWT secret
const getJwtSecret = () => config.jwt.secret;
const JWT_EXPIRY = "7d";

/**
 * Pre-computed bcrypt hash used to perform a "wasted" password comparison when
 * an account does not exist (or has no password yet). This keeps login response
 * timing constant regardless of whether the account exists, preventing timing
 * based user enumeration (VAPT CODE-1 / CWE-204).
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "account-enumeration-timing-guard",
  10,
);

/**
 * Send OTP to student email for first-time login
 */
export const sendOTP = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  // SECURITY (VAPT CODE-1 / CWE-204): every outcome returns this identical
  // generic response so an attacker cannot infer whether an account exists, is
  // a student, or is locked. An OTP is only actually dispatched for eligible
  // accounts.
  const generic = () =>
    res.status(200).json({
      success: true,
      message: "If an account exists for this email, an OTP has been sent.",
    });

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).populate(
      "role",
    );

    const role = user ? (user.role as any) : null;
    const isStudent = !!role && role.code === "STUDENT";

    // Only dispatch an OTP for an existing, student, non-locked account.
    if (user && isStudent && !user.isResetPasswordLocked()) {
      // Generate OTP locally (do not persist plaintext OTP to DB)
      const otp = crypto.randomInt(100000, 999999).toString();

      const projectId =
        user.projects && user.projects.length > 0
          ? user.projects[0].toString()
          : undefined;
      await otpStore.createOtp(email.toLowerCase(), otp, 10 * 60, {
        projectId,
        purpose: "student_password_setup",
      });

      // Do not log OTP plaintext in production; indicate generation only
      console.log(`📧 OTP generated for ${email} (dispatched)`);

      const promises: Promise<unknown>[] = [];

      // 1. Email
      promises.push(
        (async () => {
          try {
            await sendOTPEmail(email, otp, projectId);
          } catch (emailError) {
            console.error("Failed to send OTP email:", emailError);
          }
        })(),
      );

      // 2. WhatsApp + 3. SMS (if phone and project available)
      if (projectId && user.phone) {
        promises.push(
          (async () => {
            try {
              await sendOTPWhatsApp(projectId, user.phone!, otp);
            } catch (waError) {
              console.error("Failed to send OTP WhatsApp:", waError);
            }
          })(),
        );
        promises.push(
          (async () => {
            try {
              await sendOTPSMS(projectId, user.phone!, otp, user.firstName);
            } catch (smsError) {
              console.error("Failed to send OTP SMS:", smsError);
            }
          })(),
        );
      }

      // Wait for all to settle (don't fail if one fails)
      await Promise.allSettled(promises);
    }

    return generic();
  } catch (error) {
    // Stay generic even on internal error so failures can't leak existence.
    console.error("Send OTP error:", error);
    return generic();
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
        message: "Email and OTP are required",
      });
    }

    // Find user by email
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    }).populate("role");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
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
        message: "Invalid or expired OTP",
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
        type: "password-setup",
      },
      getJwtSecret(),
      { expiresIn: "15m" },
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: {
        tempToken,
        requirePasswordSetup: user.requirePasswordSetup,
        firstName: user.firstName,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error instanceof Error ? error.message : "Unknown error",
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
        message: "Password and confirmation are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Validate password against project policy
    const projectForPolicy = customUrlPath
      ? await Project.findOne({ "branding.customUrlPath": customUrlPath })
      : null;
    const policyResult = validatePasswordPolicy(
      password,
      (projectForPolicy as any)?.configuration?.securitySettings
        ?.passwordPolicy,
    );
    if (!policyResult.valid) {
      return res.status(400).json({
        success: false,
        message: policyResult.errors[0],
      });
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Temporary token required",
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
        message: "Invalid or expired token",
      });
    }

    if (decoded.type !== "password-setup") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    // Find user and set password
    const user = await User.findById(decoded.userId).populate("role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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
      "branding.customUrlPath": customUrlPath,
    });
    const token = project
      ? await generateProjectJWT(user, project)
      : await generateUserJWT(user);

    return res.status(200).json({
      success: true,
      message: "Password set successfully",
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
    console.error("Set password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to set password",
      error: error instanceof Error ? error.message : "Unknown error",
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
        message: "Email and password are required",
      });
    }

    // Find student user
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    }).populate({
      path: "role",
      populate: {
        path: "permissions",
      },
    });

    const role = user ? (user.role as any) : null;
    const isStudent = !!role && role.code === "STUDENT";

    // SECURITY (VAPT CODE-1 / CWE-204): always run a bcrypt comparison — against
    // the real hash when possible, otherwise a dummy hash — so response timing
    // is constant whether or not the account exists / has a password set.
    const canCheckPassword = !!user && !user.requirePasswordSetup;
    const passwordMatches = canCheckPassword
      ? await user!.comparePassword(password)
      : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

    // Every failure mode — unknown account, non-student, pending password setup,
    // or wrong password — returns the SAME generic 401 with identical body.
    if (!user || !isStudent || user.requirePasswordSetup || !passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log(`🔑 Student login successful: ${email}`);

    // Generate JWT token with proper permission structure using utility
    const token = await generateUserJWT(user);

    // Extract permission codes from populated permissions
    const permissions = role.permissions
      ? role.permissions.map((p: any) => p.code || p).filter(Boolean)
      : [];

    console.log(`📋 Student permissions: ${permissions.join(", ")}`);

    return res.status(200).json({
      success: true,
      message: "Login successful",
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
            permissions: permissions, // Include permissions array
          },
        },
      },
    });
  } catch (error) {
    console.error("Student login error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to login",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Check if user exists and requires password setup
 */
export const checkUser = async (req: Request, res: Response) => {
  // SECURITY (VAPT CODE-1 / CWE-204): this endpoint must NOT reveal whether an
  // account exists, its role, or its password-setup state. It returns an
  // identical, generic response for every input. The login UI no longer branches
  // on it; it is retained only for backward compatibility with older clients.
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  return res.status(200).json({
    success: true,
    message:
      "If an account exists for this email, you can continue to log in or set up a password.",
  });
};
