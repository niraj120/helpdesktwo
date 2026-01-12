import { Request, Response } from 'express';
import EmailConfig from '../models/EmailConfig';
import SMSConfig from '../models/SMSConfig';
import WhatsAppConfig from '../models/WhatsAppConfig';
import { sendGupshupSMS } from '../utils/smsService';
import { sendWhatsAppTemplateMessage, getSampleParametersForTrigger } from '../utils/whatsappService';
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

    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'Email configuration is missing',
      });
    }

    if (!config.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Email integration is disabled',
      });
    }

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email configuration is incomplete',
      });
    }

    if (!config.fromEmail) {
      return res.status(400).json({
        success: false,
        message: 'From email is missing',
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

// Test Email + WhatsApp + SMS together (toggle per channel)
export const testNotificationBundle = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { sendEmail, sendSMS, sendWhatsApp, testEmail, testPhone } = req.body as {
    sendEmail?: boolean;
    sendSMS?: boolean;
    sendWhatsApp?: boolean;
    testEmail?: string;
    testPhone?: string;
  };

  const results: Record<string, { success: boolean; message: string }> = {};

  try {
    if (!sendEmail && !sendSMS && !sendWhatsApp) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one channel to test',
        results,
      });
    }

    // Email test
    if (sendEmail) {
      if (!testEmail) {
        results.email = { success: false, message: 'Test email is required' };
      } else {
        try {
          const config = await EmailConfig.findOne({ projectId });
          if (!config) {
            results.email = { success: false, message: 'Email config not found' };
          } else if (!config.enabled) {
            results.email = { success: false, message: 'Email integration is disabled' };
          } else if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
            results.email = { success: false, message: 'Email config incomplete (missing SMTP host, user, or password)' };
          } else if (!config.fromEmail) {
            results.email = { success: false, message: 'From email is missing' };
          } else {
            const transporter = nodemailer.createTransport({
              host: config.smtpHost,
              port: config.smtpPort,
              secure: config.smtpSecure,
              auth: { user: config.smtpUser, pass: config.smtpPassword },
            });

            await transporter.sendMail({
              from: `"${config.fromName}" <${config.fromEmail}>`,
              to: testEmail,
              subject: 'Test Notification - Verify Email Configuration',
              text: `Hello,\n\nThis is a test email notification from your helpdesk system.\n\nYour verification code is: 987654\n\nIf you received this email, your email configuration is working correctly!\n\nThank you,\n${config.fromName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #333;">Test Notification</h2>
                  <p>Hello,</p>
                  <p>This is a test email notification from your helpdesk system.</p>
                  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Your verification code is:</p>
                    <h1 style="margin: 10px 0; color: #3b82f6; font-size: 36px; letter-spacing: 8px;">987654</h1>
                  </div>
                  <p style="color: #10b981;">✅ If you received this email, your email configuration is working correctly!</p>
                  <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">Thank you,<br>${config.fromName}</p>
                </div>
              `
            });

            results.email = { success: true, message: 'Test email sent' };
          }
        } catch (err: any) {
          results.email = { success: false, message: err?.message || 'Email send failed' };
        }
      }
    }

    // SMS test
    if (sendSMS) {
      if (!testPhone) {
        results.sms = { success: false, message: 'Test phone is required for SMS' };
      } else {
        try {
          const smsConfig = await SMSConfig.findOne({ projectId });
          if (!smsConfig) {
            results.sms = { success: false, message: 'SMS config not found' };
          } else if (!smsConfig.enabled) {
            results.sms = { success: false, message: 'SMS integration is disabled' };
          } else if (!smsConfig.userId || !smsConfig.password) {
            results.sms = { success: false, message: 'SMS credentials (User ID or Password) are missing' };
          } else {
            const smsResult = await sendGupshupSMS(testPhone, 'Test SMS from SAC Helpdesk', smsConfig);
            results.sms = smsResult.success
              ? { success: true, message: 'Test SMS sent' }
              : { success: false, message: smsResult.error || 'SMS send failed' };
          }
        } catch (err: any) {
          results.sms = { success: false, message: err?.message || 'SMS send failed' };
        }
      }
    }

    // WhatsApp test
    if (sendWhatsApp) {
      if (!testPhone) {
        results.whatsapp = { success: false, message: 'Test phone is required for WhatsApp' };
      } else {
        try {
          const waConfig = await WhatsAppConfig.findOne({ projectId });
          if (!waConfig) {
            results.whatsapp = { success: false, message: 'WhatsApp config not found' };
          } else if (!waConfig.enabled) {
            results.whatsapp = { success: false, message: 'WhatsApp integration is disabled' };
          } else if (!waConfig.apiBaseUrl || !waConfig.accessToken) {
            results.whatsapp = { success: false, message: 'WhatsApp credentials are incomplete (missing API Base URL or Access Token)' };
          } else {
            const triggers = waConfig.triggers as any;
            // Pick first ENABLED trigger that has numberId, fallback to any trigger with numberId
            let candidate = Object.values(triggers || {}).find(
              (t: any) => t?.numberId && t?.enabled
            );

            // If no enabled trigger found, use any trigger with numberId
            if (!candidate) {
              candidate = Object.values(triggers || {}).find(
                (t: any) => t?.numberId
              );
            }

            if (!candidate) {
              results.whatsapp = {
                success: false,
                message: 'No WhatsApp trigger configured. Please configure at least one trigger with numberId in WhatsApp Triggers tab'
              };
            } else {
              // Type assertion for candidate
              const triggerCandidate = candidate as { templateName?: string; numberId?: string; templateLanguage?: string; enabled?: boolean };

              // Use Number ID as template name if template name is not provided (same logic as individual trigger test)
              const templateName = triggerCandidate.templateName || triggerCandidate.numberId || '';
              const language = triggerCandidate.templateLanguage || 'en';

              // Find the trigger name from the triggers object
              const triggerName = Object.keys(triggers || {}).find(
                key => triggers[key] === candidate
              ) || 'studentOTP';

              // Get sample parameters for this trigger (e.g., OTP code for studentOTP)
              const sampleParams = getSampleParametersForTrigger(triggerName);

              const waResult = await sendWhatsAppTemplateMessage(
                triggerCandidate.numberId || '',
                testPhone,
                templateName,
                language,
                sampleParams.bodyParams,      // Use sample parameters from trigger definition
                sampleParams.buttonParams,    // Include button params for OTP etc
                waConfig,
                projectId,
                { triggerType: 'test', triggerName }
              );

              results.whatsapp = waResult.success
                ? { success: true, message: 'Test WhatsApp sent' }
                : { success: false, message: waResult.error || 'WhatsApp send failed' };
            }
          }
        } catch (err: any) {
          results.whatsapp = { success: false, message: err?.message || 'WhatsApp send failed' };
        }
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('Test notification bundle error:', error);
    return res.status(500).json({ success: false, message: 'Failed to run tests' });
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
  testNotificationBundle,
  updateEmailTrigger,
};
