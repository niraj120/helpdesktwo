import { Request, Response } from 'express';
import EmailConfig from '../models/EmailConfig';
import nodemailer from 'nodemailer';

// Get email configuration for a project
export const getEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { showPassword } = req.query; // Allow fetching real password

    let config = await EmailConfig.findOne({ projectId });

    if (!config) {
      // Create default config if doesn't exist
      config = await EmailConfig.create({
        projectId,
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'SAC Helpdesk',
      });
    }

    // Mask password unless explicitly requested
    const configData = config.toObject();
    if (showPassword !== 'true') {
      configData.smtpPassword = configData.smtpPassword ? '********' : '';
    }

    return res.status(200).json({
      success: true,
      data: configData,
    });
  } catch (error) {
    console.error('Get email config error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get email configuration',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update email configuration
export const updateEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;

    // If password is '********', don't update it
    if (updates.smtpPassword === '********') {
      delete updates.smtpPassword;
    }

    const config = await EmailConfig.findOneAndUpdate(
      { projectId },
      { $set: updates },
      { new: true, upsert: true }
    );

    // Don't send password to frontend
    const configData = config.toObject();
    configData.smtpPassword = configData.smtpPassword ? '********' : '';

    return res.status(200).json({
      success: true,
      message: 'Email configuration updated successfully',
      data: configData,
    });
  } catch (error) {
    console.error('Update email config error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update email configuration',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Test email configuration
export const testEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required',
      });
    }

    const config = await EmailConfig.findOne({ projectId });

    if (!config || !config.smtpHost || !config.smtpUser) {
      return res.status(400).json({
        success: false,
        message: 'Email configuration is incomplete',
      });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword,
      },
    });

    // Send test email
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: testEmail,
      subject: 'Test Email from SAC Helpdesk',
      text: 'This is a test email to verify your email configuration.',
      html: '<p>This is a test email to verify your email configuration.</p><p>If you received this, your email settings are working correctly!</p>',
    });

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error) {
    console.error('Test email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update specific email trigger
export const updateEmailTrigger = async (req: Request, res: Response) => {
  try {
    const { projectId, triggerName } = req.params;
    const updates = req.body;

    const config = await EmailConfig.findOneAndUpdate(
      { projectId },
      { $set: { [`triggers.${triggerName}`]: updates } },
      { new: true }
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Email trigger updated successfully',
      data: config.triggers,
    });
  } catch (error) {
    console.error('Update email trigger error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update email trigger',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export default {
  getEmailConfig,
  updateEmailConfig,
  testEmailConfig,
  updateEmailTrigger,
};
