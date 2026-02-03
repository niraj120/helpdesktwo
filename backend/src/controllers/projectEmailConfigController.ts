import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ProjectEmailConfig from '../models/ProjectEmailConfig';
import { Project } from '../models/Project';
import { Ticket } from '../models/Ticket';
import Imap from 'imap';
import nodemailer from 'nodemailer';

/**
 * Test IMAP connection
 */
const testImapConnection = async (
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: username,
      password: password,
      host: host,
      port: port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 5000,
    });

    const timeout = setTimeout(() => {
      imap.end();
      resolve({ success: false, error: 'Connection timeout' });
    }, 10000);

    imap.once('ready', () => {
      clearTimeout(timeout);
      imap.end();
      resolve({ success: true });
    });

    imap.once('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    try {
      imap.connect();
    } catch (error: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
};

/**
 * Test SMTP connection
 */
const testSmtpConnection = async (
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: {
        user: username,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Connection timeout' });
    }, 10000);

    transporter.verify((error, success) => {
      clearTimeout(timeout);
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
};

/**
 * POST /api/projects/:projectId/email-configs
 * Add email configuration for a project
 */
export const addEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      email_address,
      imap_host,
      imap_port,
      imap_username,
      imap_password,
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
    } = req.body;

    // Validate required fields
    if (
      !email_address ||
      !imap_host ||
      !imap_port ||
      !imap_username ||
      !imap_password ||
      !smtp_host ||
      !smtp_port ||
      !smtp_username ||
      !smtp_password
    ) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Validate project ID format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID',
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email_address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Check if email already exists for this project
    const existingConfig = await ProjectEmailConfig.findOne({
      projectId,
      emailAddress: email_address.toLowerCase(),
    });

    if (existingConfig) {
      return res.status(409).json({
        success: false,
        message: 'Email address already configured for this project',
      });
    }

    // Validate port numbers
    if (imap_port < 1 || imap_port > 65535 || smtp_port < 1 || smtp_port > 65535) {
      return res.status(400).json({
        success: false,
        message: 'Invalid port number (must be between 1 and 65535)',
      });
    }

    // Test IMAP connection
    console.log(`Testing IMAP connection for ${email_address}...`);
    const imapTest = await testImapConnection(
      imap_host,
      imap_port,
      imap_username,
      imap_password
    );

    if (!imapTest.success) {
      return res.status(400).json({
        success: false,
        message: 'IMAP connection failed',
        error: imapTest.error,
      });
    }

    // Test SMTP connection
    console.log(`Testing SMTP connection for ${email_address}...`);
    const smtpTest = await testSmtpConnection(
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password
    );

    if (!smtpTest.success) {
      return res.status(400).json({
        success: false,
        message: 'SMTP connection failed',
        error: smtpTest.error,
      });
    }

    // Create email configuration
    // Note: Passwords will be encrypted by pre-save hook in the model
    const emailConfig = new ProjectEmailConfig({
      projectId,
      emailAddress: email_address.toLowerCase(),
      imapHost: imap_host,
      imapPort: imap_port,
      imapUsername: imap_username,
      imapPassword: imap_password, // Will be encrypted by pre-save hook
      smtpHost: smtp_host,
      smtpPort: smtp_port,
      smtpUsername: smtp_username,
      smtpPassword: smtp_password, // Will be encrypted by pre-save hook
      lastCheckedAt: new Date(),
      lastCheckStatus: 'success',
    });

    await emailConfig.save();

    console.log(`✅ Email configuration added for ${email_address}`);

    return res.status(201).json({
      success: true,
      message: 'Email configuration added successfully',
      data: {
        id: emailConfig._id,
        projectId: emailConfig.projectId,
        emailAddress: emailConfig.emailAddress,
        imapHost: emailConfig.imapHost,
        imapPort: emailConfig.imapPort,
        smtpHost: emailConfig.smtpHost,
        smtpPort: emailConfig.smtpPort,
        isEnabled: emailConfig.isEnabled,
        lastCheckedAt: emailConfig.lastCheckedAt,
        lastCheckStatus: emailConfig.lastCheckStatus,
      },
    });
  } catch (error: any) {
    console.error('Error adding email configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add email configuration',
      error: error.message,
    });
  }
};

/**
 * GET /api/projects/:projectId/email-configs
 * Get all email configurations for a project (Task 2.2)
 * Supports pagination via query params: page, limit
 */
export const getEmailConfigs = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { page = '1', limit = '10', includeDisabled = 'true' } = req.query;

    // Validate project ID format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID',
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Build query
    const query: any = { projectId };
    if (includeDisabled === 'false') {
      query.isEnabled = true;
    }

    // Parse pagination params
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await ProjectEmailConfig.countDocuments(query);

    // Get configs with pagination
    const configs = await ProjectEmailConfig.find(query)
      .select('-imapPassword -smtpPassword') // Exclude passwords
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Transform data to include connection status
    const transformedConfigs = configs.map((config: any) => ({
      _id: config._id,  // Changed from 'id' to '_id' for frontend compatibility
      projectId: config.projectId,
      emailAddress: config.emailAddress,
      isEnabled: config.isEnabled,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapUsername: config.imapUsername,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUsername: config.smtpUsername,
      // Task 8.2: Connection status tracking (flat structure for frontend)
      connectionStatus: config.connectionStatus || 'untested',
      lastConnectionTest: config.lastConnectionTest || null,
      lastConnectionError: config.lastConnectionError || null,
      failedAttempts: config.failedAttempts || 0,
      nextRetryAt: config.nextRetryAt || null,
      lastSuccessfulConnection: config.lastSuccessfulConnection || null,
      // Legacy status fields (for backward compatibility)
      lastCheckedAt: config.lastCheckedAt || null,
      lastCheckStatus: config.lastCheckStatus || 'unknown',
      lastCheckError: config.lastCheckError || null,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return res.status(200).json({
      success: true,
      data: transformedConfigs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error('Error fetching email configurations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch email configurations',
      error: error.message,
    });
  }
};

/**
 * PUT /api/projects/:projectId/email-configs/:configId
 * Update email configuration
 */
export const updateEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId, configId } = req.params;
    const {
      email_address,
      imap_host,
      imap_port,
      imap_username,
      imap_password,
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      isEnabled,
    } = req.body;

    console.log('📝 Update email config request:');
    console.log('   Project ID:', projectId);
    console.log('   Config ID:', configId);
    console.log('   Email address:', email_address);

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(configId)) {
      console.log('   ❌ Invalid ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID or config ID',
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findOne({
      _id: configId,
      projectId,
    });

    if (!config) {
      console.log('   ❌ Config not found');
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found',
      });
    }

    // Check if email is being changed and if it's already used by another config
    if (email_address && email_address !== config.emailAddress) {
      const existingConfig = await ProjectEmailConfig.findOne({
        emailAddress: email_address.toLowerCase(),
        projectId,
        _id: { $ne: configId }, // Exclude current config
      });

      if (existingConfig) {
        console.log('   ❌ Email already in use');
        return res.status(400).json({
          success: false,
          message: 'Email address is already configured for this project',
        });
      }
    }

    // Update fields if provided
    if (email_address !== undefined) config.emailAddress = email_address.toLowerCase();
    if (imap_host !== undefined) config.imapHost = imap_host;
    if (imap_port !== undefined) config.imapPort = Number(imap_port);
    if (imap_username !== undefined) config.imapUsername = imap_username;
    if (smtp_host !== undefined) config.smtpHost = smtp_host;
    if (smtp_port !== undefined) config.smtpPort = Number(smtp_port);
    if (smtp_username !== undefined) config.smtpUsername = smtp_username;
    if (typeof isEnabled === 'boolean') config.isEnabled = isEnabled;

    // Only update passwords if provided (they are optional in updates)
    // Passwords will be encrypted by pre-save hook in the model
    if (imap_password) {
      config.imapPassword = imap_password;
    }
    if (smtp_password) {
      config.smtpPassword = smtp_password;
    }

    await config.save();

    console.log(`✅ Updated email config: ${config.emailAddress}`);

    return res.status(200).json({
      success: true,
      message: 'Email configuration updated successfully',
      data: {
        id: config._id,
        emailAddress: config.emailAddress,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        imapUsername: config.imapUsername,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUsername: config.smtpUsername,
        isEnabled: config.isEnabled,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error updating email configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update email configuration',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/email-configs/:configId/toggle
 * Toggle email configuration on/off (Task 2.3)
 * Toggles the isEnabled field
 */
export const toggleEmailConfig = async (req: Request, res: Response) => {
  try {
    const { configId } = req.params;

    // Validate config ID format
    if (!mongoose.Types.ObjectId.isValid(configId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration ID',
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findById(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found',
      });
    }

    // Store old value for logging
    const oldValue = config.isEnabled;

    // Toggle isEnabled
    config.isEnabled = !config.isEnabled;
    await config.save();

    console.log(
      `🔄 Toggled email config ${config.emailAddress}: ${oldValue} → ${config.isEnabled}`
    );

    return res.status(200).json({
      success: true,
      message: `Email configuration ${config.isEnabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        id: config._id,
        projectId: config.projectId,
        emailAddress: config.emailAddress,
        isEnabled: config.isEnabled,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error toggling email configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle email configuration',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/projects/:projectId/email-configs/:configId
 * Delete email configuration
 */
export const deleteEmailConfig = async (req: Request, res: Response) => {
  try {
    const { projectId, configId } = req.params;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(configId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID or config ID',
      });
    }

    // Find and delete config
    // Find config first to get email address
    const config = await ProjectEmailConfig.findOne({
      _id: configId,
      projectId,
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found',
      });
    }

    const emailAddress = config.emailAddress;

    // Delete the config
    await ProjectEmailConfig.findOneAndDelete({
      _id: configId,
      projectId,
    });

    console.log(`🗑️ Deleted email configuration for ${emailAddress}`);

    return res.status(200).json({
      success: true,
      message: 'Email configuration deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting email configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete email configuration',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/email-configs/:configId
 * Delete email configuration with ticket check (Task 2.4)
 */
export const deleteEmailConfigById = async (req: Request, res: Response) => {
  try {
    const { configId } = req.params;
    const { force = 'false' } = req.query;

    // Validate config ID format
    if (!mongoose.Types.ObjectId.isValid(configId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration ID',
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findById(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found',
      });
    }

    // Check if any tickets were created using this email
    const ticketCount = await Ticket.countDocuments({
      sourceEmail: config.emailAddress.toLowerCase(),
    });

    if (ticketCount > 0 && force !== 'true') {
      return res.status(409).json({
        success: false,
        message: `Cannot delete email configuration. ${ticketCount} ticket(s) were created using this email.`,
        data: {
          ticketCount,
          emailAddress: config.emailAddress,
          suggestion: 'Consider disabling instead, or use ?force=true to delete anyway',
        },
      });
    }

    // Store email for logging
    const emailAddress = config.emailAddress;
    const projectId = config.projectId;

    // Hard delete
    await ProjectEmailConfig.findByIdAndDelete(configId);

    console.log(
      `🗑️ Deleted email configuration: ${emailAddress} (${ticketCount} related tickets)`
    );

    return res.status(200).json({
      success: true,
      message: 'Email configuration deleted successfully',
      data: {
        deletedEmail: emailAddress,
        projectId,
        relatedTickets: ticketCount,
      },
    });
  } catch (error: any) {
    console.error('Error deleting email configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete email configuration',
      error: error.message,
    });
  }
};

/**
 * POST /api/email-configs/:configId/test
 * Test email configuration connection (Task 2.5)
 */
export const testEmailConfigConnection = async (req: Request, res: Response) => {
  try {
    const { configId } = req.params;

    console.log('🔍 Test connection request received');
    console.log('   Config ID:', configId);
    console.log('   Config ID type:', typeof configId);
    console.log('   Is valid ObjectId:', mongoose.Types.ObjectId.isValid(configId));

    // Validate config ID format
    if (!configId || !mongoose.Types.ObjectId.isValid(configId)) {
      console.log('   ❌ Invalid config ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration ID',
      });
    }

    // Find config
    const config = await ProjectEmailConfig.findById(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found',
      });
    }

    console.log(`🔌 Testing email configuration: ${config.emailAddress}`);

    // Get decrypted passwords
    const imapPassword = config.getDecryptedImapPassword();
    const smtpPassword = config.getDecryptedSmtpPassword();

    // Test IMAP connection
    console.log('  📥 Testing IMAP connection...');
    const imapResult = await testImapConnection(
      config.imapHost,
      config.imapPort,
      config.imapUsername,
      imapPassword
    );

    // Test SMTP connection
    console.log('  📤 Testing SMTP connection...');
    const smtpResult = await testSmtpConnection(
      config.smtpHost,
      config.smtpPort,
      config.smtpUsername,
      smtpPassword
    );

    // Determine overall success
    const overallSuccess = imapResult.success && smtpResult.success;

    // Update connection status in database (Task 8.2)
    config.lastCheckedAt = new Date();
    config.lastConnectionTest = new Date();
    
    if (overallSuccess) {
      config.lastCheckStatus = 'success';
      config.lastCheckError = undefined;
      config.connectionStatus = 'connected'; // Task 8.2: Update connection status
      config.lastSuccessfulConnection = new Date();
      config.failedAttempts = 0;
      config.nextRetryAt = undefined;
      config.lastConnectionError = undefined;
    } else {
      config.lastCheckStatus = 'failed';
      const errors = [];
      if (!imapResult.success) errors.push(`IMAP: ${imapResult.error}`);
      if (!smtpResult.success) errors.push(`SMTP: ${smtpResult.error}`);
      config.lastCheckError = errors.join('; ');
      config.connectionStatus = 'error'; // Task 8.2: Update connection status
      config.lastConnectionError = errors.join('; ');
      config.failedAttempts = (config.failedAttempts || 0) + 1;
    }
    await config.save();

    console.log(
      `  ${overallSuccess ? '✅' : '❌'} Connection test ${
        overallSuccess ? 'passed' : 'failed'
      }`
    );

    return res.status(200).json({
      success: overallSuccess,
      message: overallSuccess
        ? 'Email connection test successful'
        : 'Email connection test failed',
      data: {
        emailAddress: config.emailAddress,
        imap: {
          success: imapResult.success,
          error: imapResult.error,
          host: config.imapHost,
          port: config.imapPort,
        },
        smtp: {
          success: smtpResult.success,
          error: smtpResult.error,
          host: config.smtpHost,
          port: config.smtpPort,
        },
        testedAt: config.lastCheckedAt,
      },
    });
  } catch (error: any) {
    console.error('Error testing email configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to test email configuration',
      error: error.message,
    });
  }
};

/**
 * POST /api/projects/:projectId/email-configs/test-credentials
 * Test email credentials without saving (for use in add/edit modals)
 */
export const testEmailCredentials = async (req: Request, res: Response) => {
  try {
    const {
      imapHost,
      imapPort,
      imapUsername,
      imapPassword,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
    } = req.body;

    // Validate required fields
    if (!imapHost || !imapPort || !imapUsername || !imapPassword) {
      return res.status(400).json({
        success: false,
        message: 'Missing required IMAP credentials',
      });
    }

    if (!smtpHost || !smtpPort || !smtpUsername || !smtpPassword) {
      return res.status(400).json({
        success: false,
        message: 'Missing required SMTP credentials',
      });
    }

    console.log(`🔌 Testing email credentials (IMAP: ${imapHost}:${imapPort}, SMTP: ${smtpHost}:${smtpPort})`);

    // Test IMAP connection
    console.log('  📥 Testing IMAP connection...');
    const imapResult = await testImapConnection(
      imapHost,
      Number(imapPort),
      imapUsername,
      imapPassword
    );

    // Test SMTP connection
    console.log('  📤 Testing SMTP connection...');
    const smtpResult = await testSmtpConnection(
      smtpHost,
      Number(smtpPort),
      smtpUsername,
      smtpPassword
    );

    // Determine overall status
    const overallSuccess = imapResult.success && smtpResult.success;

    console.log(`  ${overallSuccess ? '✅' : '❌'} Test result: ${overallSuccess ? 'Success' : 'Failed'}`);

    return res.status(200).json({
      success: overallSuccess,
      message: overallSuccess
        ? 'Both IMAP and SMTP connections successful'
        : 'One or more connections failed',
      data: {
        imap: {
          success: imapResult.success,
          error: imapResult.error,
          host: imapHost,
          port: Number(imapPort),
        },
        smtp: {
          success: smtpResult.success,
          error: smtpResult.error,
          host: smtpHost,
          port: Number(smtpPort),
        },
        testedAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error('Error testing email credentials:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to test email credentials',
      error: error.message,
    });
  }
};
