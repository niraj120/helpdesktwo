import { Request, Response } from "express";
import { sendOTPEmail } from "../utils/emailService";
import { sendOTPSMS } from "../utils/smsService";
import otpStore from "../utils/otpStore";

/**
 * Generate a 6-digit OTP
 */
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP to phone number (SMS)
 */
export const sendPhoneOtp = async (req: Request, res: Response) => {
  try {
    const { phone, projectId, name } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number is required" });
    }

    if (!projectId) {
      return res
        .status(400)
        .json({ success: false, message: "Project ID is required" });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP with phone as identifier
    const otpKey = await otpStore.createOtp(phone, otp, 10 * 60, {
      purpose: "field_verification",
      type: "phone",
      projectId,
    });

    // Send OTP via SMS
    const result = await sendOTPSMS(projectId, phone, otp, name);

    if (result.success) {
      console.log(
        `📱 OTP sent to phone ${phone.slice(-4).padStart(phone.length, "*")}`,
      );
      return res.json({
        success: true,
        message: "OTP sent successfully",
        otpKey,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error || "Failed to send OTP",
      });
    }
  } catch (error) {
    console.error("Error sending phone OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

/**
 * Send OTP to email address
 */
export const sendEmailOtp = async (req: Request, res: Response) => {
  try {
    const { email, projectId } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    if (!projectId) {
      return res
        .status(400)
        .json({ success: false, message: "Project ID is required" });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP with email as identifier
    const otpKey = await otpStore.createOtp(email, otp, 10 * 60, {
      purpose: "field_verification",
      type: "email",
      projectId,
    });

    // Send OTP via Email
    const success = await sendOTPEmail(email, otp, projectId);

    if (success) {
      console.log(
        `📧 OTP sent to email ${email.replace(/(.{2}).*@/, "$1***@")}`,
      );
      return res.json({
        success: true,
        message: "OTP sent successfully",
        otpKey,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }
  } catch (error) {
    console.error("Error sending email OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

/**
 * Verify OTP
 */
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { otpKey, otp, type, value } = req.body;

    if (!otpKey || !otp) {
      return res.status(400).json({
        success: false,
        message: "OTP key and OTP value are required",
      });
    }

    // Verify OTP
    const isValid = await otpStore.verifyOtpByKey(otpKey, otp);

    if (isValid) {
      console.log(
        `✅ OTP verified for ${type}: ${value?.slice?.(-4)?.padStart?.(value?.length || 4, "*") || "unknown"}`,
      );
      return res.json({
        success: true,
        message: "OTP verified successfully",
        verified: true,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
        verified: false,
      });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
};
