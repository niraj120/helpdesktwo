import nodemailer from 'nodemailer';
import EmailConfig from '../models/EmailConfig';
import EmailLog from '../models/EmailLog';
import { Project } from '../models/Project';
import { decrypt, isEncrypted } from './encryption';

// Helper function to log email attempts
const logEmail = async (params: {
  projectId?: string;
  recipient: string;
  subject: string;
  body?: string;
  type: 'otp' | 'ticket_created' | 'student_welcome' | 'password_reset' | 'ticket_update' | 'other';
  status: 'sent' | 'failed' | 'blocked' | 'simulated';
  error?: string;
  metadata?: any;
  smtpHost?: string;
  fromEmail?: string;
}) => {
  try {
    let projectName: string | undefined;

    if (params.projectId) {
      const project = await Project.findById(params.projectId);
      projectName = project?.name;
    }

    const emailLog = new EmailLog({
      projectId: params.projectId,
      projectName,
      recipient: params.recipient,
      subject: params.subject,
      body: params.body,
      type: params.type,
      status: params.status,
      error: params.error,
      metadata: params.metadata,
      smtpHost: params.smtpHost,
      fromEmail: params.fromEmail,
      sentAt: new Date()
    });

    await emailLog.save();
    console.log(`📝 Email log saved: ${params.status} - ${params.type} to ${params.recipient}`);
  } catch (error) {
    console.error('❌ Failed to save email log:', error);
    // Don't throw - logging failures shouldn't break email sending
  }
};

// Get email transporter from database configuration
const getEmailTransporter = async (projectId?: string) => {
  try {
    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});

    if (!emailConfig || !emailConfig.smtpHost || !emailConfig.smtpUser || !emailConfig.smtpPassword) {
      console.log('⚠️  Email configuration not found or incomplete, using simulation mode');
      return null;
    }

    // Decrypt SMTP password if it's encrypted
    let smtpPassword = emailConfig.smtpPassword;
    if (isEncrypted(smtpPassword)) {
      try {
        smtpPassword = decrypt(smtpPassword);
      } catch (error) {
        console.error('Failed to decrypt SMTP password:', error);
        return null;
      }
    }

    return nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort || 587,
      secure: emailConfig.smtpSecure || false,
      auth: {
        user: emailConfig.smtpUser,
        pass: smtpPassword,
      },
    });
  } catch (error) {
    console.error('Failed to get email transporter:', error);
    return null;
  }
};

export const sendOTPEmail = async (email: string, otp: string, projectId?: string): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending OTP to ${email}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});

    // Check if email integration is enabled
    if (emailConfig && !emailConfig.enabled) {
      console.log(`⚠️  [EMAIL SERVICE] Email sending is disabled for project ${projectId || 'default'}`);
      return false;
    }

    const transporter = await getEmailTransporter(projectId);

    // Get project name for replacement
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    // Default templates
    const defaultSubject = `Your OTP for {{projectName}}`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello {{studentName}},</p>
        <p>Your OTP for login is: {{otp}}</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          {{otp}}
        </div>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
        <p>Thank you!</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `;

    // Get the student OTP trigger settings
    const trigger = emailConfig?.triggers?.studentOTP;

    // Use template from config or default, then replace variables
    let subject = (trigger?.subject || defaultSubject)
      .replace(/\{\{otp\}\}/g, otp)
      .replace(/\{\{projectName\}\}/g, projectName);

    let body = (trigger?.body || defaultBody)
      .replace(/\{\{studentName\}\}/g, email.split('@')[0])
      .replace(/\{\{otp\}\}/g, otp)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      console.log('✅ Email sent successfully (simulated)');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'otp',
        status: 'simulated'
      });
      return true;
    }

    // Check if email trigger is enabled
    if (!trigger?.enabled) {
      console.log('⚠️  Student OTP email trigger is disabled');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'otp',
        status: 'blocked',
        error: 'Trigger disabled'
      });
      return false;
    }

    console.log(`📧 Sending OTP email with subject: ${subject}`);

    await transporter.sendMail({
      from: `"${emailConfig?.fromName || 'SAC Helpdesk'}" <${emailConfig?.fromEmail || emailConfig?.smtpUser}>`,
      to: email,
      subject: subject,
      html: body,
    });

    console.log('✅ OTP email sent successfully via SMTP');
    await logEmail({
      projectId,
      recipient: email,
      subject,
      body,
      type: 'otp',
      status: 'sent',
      smtpHost: emailConfig?.smtpHost,
      fromEmail: emailConfig?.fromEmail || emailConfig?.smtpUser
    });
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send OTP email:', error);
    console.error('Error details:', error);

    await logEmail({
      projectId,
      recipient: email,
      subject: `Your OTP for SAC Helpdesk`,
      type: 'otp',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
};

export const sendVerificationEmail = async (email: string, token: string): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending verification email to ${email}`);
    // Do not log verification tokens in plaintext
    console.log('✅ Email send simulated (verification token generated)');

    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send verification email:', error);
    return false;
  }
};

export const sendWelcomeEmail = async (email: string, name: string): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending welcome email to ${name} (${email})`);
    console.log('✅ Email sent successfully (simulated)');

    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send welcome email:', error);
    return false;
  }
};

export const sendTicketCreatedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  projectId?: string,
  additionalData?: {
    studentName?: string;
    status?: string;
    priority?: string;
  }
): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending ticket confirmation to ${email}`);
    console.log(`🎫 Ticket Number: ${ticketNumber}`);
    console.log(`📄 Ticket Title: ${ticketTitle}`);
    console.log(`🏢 Project ID: ${projectId}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);

    // Prepare replacement values
    const studentName = additionalData?.studentName || 'Student';
    const status = additionalData?.status || 'Open';
    const priority = additionalData?.priority || 'Medium';

    // Default templates
    const defaultSubject = `Ticket Created - {{ticketNumber}}`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Ticket Created Successfully</h2>
        <p>Hello {{studentName}},</p>
        <p>Your support ticket has been created and our team will review it shortly.</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Status:</strong> {{ticketStatus}}</p>
          <p><strong>Priority:</strong> {{ticketPriority}}</p>
        </div>
        <p>We will update you via email when there are any changes to your ticket.</p>
        <p>Thank you for contacting us!</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `;

    // Get the ticket created trigger settings
    const trigger = emailConfig?.triggers?.ticketCreatedStudent || emailConfig?.triggers?.ticketCreatedOnline;

    // Use template from config or default, then replace variables
    let subject = (trigger?.subject || defaultSubject)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{ticketSubject\}\}/g, ticketTitle);

    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{ticketSubject\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{ticketStatus\}\}/g, status)
      .replace(/\{\{ticketPriority\}\}/g, priority);

    // Convert plain text newlines to HTML if body doesn't contain HTML tags
    if (!body.includes('<') && !body.includes('>')) {
      body = body
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('');
    }

    if (!transporter) {
      console.log('✅ Email sent successfully (simulated)');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'ticket_created',
        status: 'simulated',
        metadata: { ticketNumber, ticketTitle, status, priority }
      });
      return true;
    }

    // Check if email trigger is enabled
    if (!trigger?.enabled) {
      console.log('⚠️  Ticket creation email trigger is disabled');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'ticket_created',
        status: 'blocked',
        error: 'Trigger disabled',
        metadata: { ticketNumber, ticketTitle, status, priority }
      });
      return false;
    }

    console.log(`📧 Sending email with subject: ${subject}`);

    await transporter.sendMail({
      from: `"${emailConfig?.fromName || 'SAC Helpdesk'}" <${emailConfig?.fromEmail || emailConfig?.smtpUser}>`,
      to: email,
      subject: subject,
      html: body,
    });

    console.log('✅ Ticket creation email sent successfully via SMTP');
    await logEmail({
      projectId,
      recipient: email,
      subject,
      body,
      type: 'ticket_created',
      status: 'sent',
      smtpHost: emailConfig?.smtpHost,
      fromEmail: emailConfig?.fromEmail || emailConfig?.smtpUser,
      metadata: { ticketNumber, ticketTitle, status, priority }
    });
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send ticket creation email:', error);
    console.error('Error details:', error);

    await logEmail({
      projectId,
      recipient: email,
      subject: `Ticket Created - ${ticketNumber}`,
      type: 'ticket_created',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { ticketNumber, ticketTitle }
    });
    return false;
  }
};

export const sendStudentWelcomeEmail = async (
  email: string,
  studentName: string,
  projectName: string,
  loginUrl: string,
  projectId?: string
): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending welcome email to new student: ${email}`);
    console.log(`👤 Student Name: ${studentName}`);
    console.log(`🏢 Project Name: ${projectName}`);
    console.log(`🔗 Login URL: ${loginUrl}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);

    // Default templates with placeholders
    const defaultSubject = `Welcome to {{projectName}} - Account Created`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to {{projectName}}!</h2>
        <p>Dear {{studentName}},</p>
        <p>Your account has been created successfully. You can now track and manage your support tickets online.</p>
        
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-left: 4px solid #4CAF50;">
          <h3 style="margin-top: 0;">Your Login Details</h3>
          <p><strong>Email:</strong> {{email}}</p>
          <p><strong>Login URL:</strong> <a href="{{loginUrl}}" style="color: #4CAF50;">{{loginUrl}}</a></p>
        </div>
        
        <div style="background-color: #fff3cd; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h4 style="margin-top: 0; color: #856404;">📌 Set Your Password</h4>
          <p style="color: #856404; margin-bottom: 0;">To set up your password and access your account:</p>
          <ol style="color: #856404;">
            <li>Click on the login link above</li>
            <li>Click on "Forgot Password"</li>
            <li>Enter your email address ({{email}})</li>
            <li>You will receive an OTP to create your password</li>
          </ol>
        </div>
        
        <p>Once you log in, you will be able to:</p>
        <ul>
          <li>View and track all your support tickets</li>
          <li>Create new support requests</li>
          <li>Communicate with support staff</li>
          <li>Upload documents and attachments</li>
        </ul>
        
        <p>If you have any questions, please don't hesitate to contact our support team.</p>
        
        <p>Best regards,<br>{{projectName}} Support Team</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `;

    // Get the account created trigger settings
    const trigger = emailConfig?.triggers?.accountCreated;

    // Use template from config or default, then replace ALL variables
    let subject = (trigger?.subject || defaultSubject)
      .replace(/\{\{projectName\}\}/g, projectName)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{loginUrl\}\}/g, loginUrl);

    let body = (trigger?.body || defaultBody)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{loginUrl\}\}/g, loginUrl)
      .replace(/\{\{projectName\}\}/g, projectName);

    // Convert plain text newlines to HTML if body doesn't contain HTML tags
    if (!body.includes('<') && !body.includes('>')) {
      body = body
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('');
    }

    if (!transporter) {
      console.log('✅ Welcome email sent successfully (simulated)');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'student_welcome',
        status: 'simulated',
        metadata: { studentName, projectName, loginUrl }
      });
      return true;
    }

    // Check if email trigger is enabled
    if (!trigger?.enabled) {
      console.log('⚠️  Account creation email trigger is disabled');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'student_welcome',
        status: 'blocked',
        error: 'Trigger disabled',
        metadata: { studentName, projectName, loginUrl }
      });
      return false;
    }

    console.log(`📧 Sending welcome email with subject: ${subject}`);

    await transporter.sendMail({
      from: `"${emailConfig?.fromName || projectName}" <${emailConfig?.fromEmail || emailConfig?.smtpUser}>`,
      to: email,
      subject: subject,
      html: body,
    });

    console.log('✅ Student welcome email sent successfully via SMTP');
    await logEmail({
      projectId,
      recipient: email,
      subject,
      body,
      type: 'student_welcome',
      status: 'sent',
      smtpHost: emailConfig?.smtpHost,
      fromEmail: emailConfig?.fromEmail || emailConfig?.smtpUser,
      metadata: { studentName, projectName, loginUrl }
    });
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send welcome email:', error);
    console.error('Error details:', error);

    await logEmail({
      projectId,
      recipient: email,
      subject: `Welcome to ${projectName} - Account Created`,
      type: 'student_welcome',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { studentName, projectName, loginUrl }
    });
    return false;
  }
};

/**
 * Send ticket status changed email
 */
export const sendTicketStatusChangedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  newStatus: string,
  previousStatus: string,
  projectId?: string,
  additionalData?: {
    studentName?: string;
  }
): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending status change email to ${email}`);
    console.log(`🎫 Ticket: ${ticketNumber} | ${previousStatus} → ${newStatus}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const studentName = additionalData?.studentName || 'Student';
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Ticket {{ticketNumber}} Status Updated`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Ticket Status Updated</h2>
        <p>Hello {{studentName}},</p>
        <p>Your support ticket status has been updated.</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Previous Status:</strong> {{previousStatus}}</p>
          <p><strong>New Status:</strong> <span style="color: #4CAF50; font-weight: bold;">{{newStatus}}</span></p>
        </div>
        <p>Thank you for your patience!</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from {{projectName}}.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketStatusChanged;

    let subject = (trigger?.subject || defaultSubject)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{newStatus\}\}/g, newStatus)
      .replace(/\{\{previousStatus\}\}/g, previousStatus);

    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{ticketSubject\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{newStatus\}\}/g, newStatus)
      .replace(/\{\{previousStatus\}\}/g, previousStatus)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      console.log('✅ Status change email sent (simulated)');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'ticket_update',
        status: 'simulated',
        metadata: { ticketNumber, ticketTitle, newStatus, previousStatus }
      });
      return true;
    }

    if (!trigger?.enabled) {
      console.log('⚠️  Ticket status change email trigger is disabled');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'ticket_update',
        status: 'blocked',
        error: 'Trigger disabled',
        metadata: { ticketNumber, ticketTitle, newStatus, previousStatus }
      });
      return false;
    }

    await transporter.sendMail({
      from: `"${emailConfig?.fromName || 'SAC Helpdesk'}" <${emailConfig?.fromEmail || emailConfig?.smtpUser}>`,
      to: email,
      subject,
      html: body,
    });

    console.log('✅ Status change email sent successfully');
    await logEmail({
      projectId,
      recipient: email,
      subject,
      body,
      type: 'ticket_update',
      status: 'sent',
      smtpHost: emailConfig?.smtpHost,
      fromEmail: emailConfig?.fromEmail || emailConfig?.smtpUser,
      metadata: { ticketNumber, ticketTitle, newStatus, previousStatus }
    });
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send status change email:', error);
    await logEmail({
      projectId,
      recipient: email,
      subject: `Ticket ${ticketNumber} Status Updated`,
      type: 'ticket_update',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { ticketNumber, ticketTitle, newStatus, previousStatus }
    });
    return false;
  }
};

/**
 * Send ticket closed email
 */
export const sendTicketClosedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  resolution: string,
  projectId?: string,
  additionalData?: {
    studentName?: string;
  }
): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending ticket closed email to ${email}`);
    console.log(`🎫 Ticket Closed: ${ticketNumber}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const studentName = additionalData?.studentName || 'Student';
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Ticket {{ticketNumber}} Closed`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">Ticket Closed</h2>
        <p>Hello {{studentName}},</p>
        <p>Your support ticket has been resolved and closed.</p>
        <div style="background-color: #e8f5e9; padding: 20px; margin: 20px 0; border-left: 4px solid #4CAF50;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Status:</strong> <span style="color: #4CAF50; font-weight: bold;">Closed</span></p>
          <p><strong>Resolution:</strong> {{resolution}}</p>
        </div>
        <p>If you have any further questions, feel free to create a new ticket.</p>
        <p>Thank you for using {{projectName}}!</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketClosed;

    let subject = (trigger?.subject || defaultSubject)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle);

    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{ticketSubject\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{resolution\}\}/g, resolution || 'Ticket resolved.')
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      console.log('✅ Ticket closed email sent (simulated)');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'ticket_update',
        status: 'simulated',
        metadata: { ticketNumber, ticketTitle, resolution }
      });
      return true;
    }

    if (!trigger?.enabled) {
      console.log('⚠️  Ticket closed email trigger is disabled');
      await logEmail({
        projectId,
        recipient: email,
        subject,
        body,
        type: 'ticket_update',
        status: 'blocked',
        error: 'Trigger disabled',
        metadata: { ticketNumber, ticketTitle, resolution }
      });
      return false;
    }

    await transporter.sendMail({
      from: `"${emailConfig?.fromName || 'SAC Helpdesk'}" <${emailConfig?.fromEmail || emailConfig?.smtpUser}>`,
      to: email,
      subject,
      html: body,
    });

    console.log('✅ Ticket closed email sent successfully');
    await logEmail({
      projectId,
      recipient: email,
      subject,
      body,
      type: 'ticket_update',
      status: 'sent',
      smtpHost: emailConfig?.smtpHost,
      fromEmail: emailConfig?.fromEmail || emailConfig?.smtpUser,
      metadata: { ticketNumber, ticketTitle, resolution }
    });
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send ticket closed email:', error);
    await logEmail({
      projectId,
      recipient: email,
      subject: `Ticket ${ticketNumber} Closed`,
      type: 'ticket_update',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { ticketNumber, ticketTitle, resolution }
    });
    return false;
  }
};

/**
 * Send ticket assigned email (to agent)
 */
export const sendTicketAssignedEmail = async (
  agentEmail: string,
  ticketNumber: string,
  ticketTitle: string,
  studentName: string,
  priority: string,
  projectId?: string
): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending ticket assigned email to agent ${agentEmail}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `New Ticket Assigned: {{ticketNumber}}`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Ticket Assigned to You</h2>
        <p>A new support ticket has been assigned to you.</p>
        <div style="background-color: #fff3e0; padding: 20px; margin: 20px 0; border-left: 4px solid #ff9800;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>From:</strong> {{studentName}}</p>
          <p><strong>Priority:</strong> <span style="color: #ff9800; font-weight: bold;">{{priority}}</span></p>
        </div>
        <p>Please review and respond to this ticket at your earliest convenience.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from {{projectName}}.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketAssigned;

    let subject = (trigger?.subject || defaultSubject)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber);

    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{ticketSubject\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{priority\}\}/g, priority)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      console.log('✅ Ticket assigned email sent (simulated)');
      await logEmail({
        projectId,
        recipient: agentEmail,
        subject,
        body,
        type: 'other',
        status: 'simulated',
        metadata: { ticketNumber, ticketTitle, studentName, priority }
      });
      return true;
    }

    if (!trigger?.enabled) {
      console.log('⚠️  Ticket assigned email trigger is disabled');
      await logEmail({
        projectId,
        recipient: agentEmail,
        subject,
        body,
        type: 'other',
        status: 'blocked',
        error: 'Trigger disabled',
        metadata: { ticketNumber, ticketTitle, studentName, priority }
      });
      return false;
    }

    await transporter.sendMail({
      from: `"${projectName}" <${emailConfig?.fromEmail || emailConfig?.smtpUser}>`,
      to: agentEmail,
      subject,
      html: body,
    });

    console.log('✅ Ticket assigned email sent successfully');
    await logEmail({
      projectId,
      recipient: agentEmail,
      subject,
      body,
      type: 'other',
      status: 'sent',
      smtpHost: emailConfig?.smtpHost,
      fromEmail: emailConfig?.fromEmail || emailConfig?.smtpUser,
      metadata: { ticketNumber, ticketTitle, studentName, priority }
    });
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send ticket assigned email:', error);
    await logEmail({
      projectId,
      recipient: agentEmail,
      subject: `New Ticket Assigned: ${ticketNumber}`,
      type: 'other',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { ticketNumber, ticketTitle, studentName, priority }
    });
    return false;
  }
};

/**
 * Send ticket rejected email
 */
export const sendTicketRejectedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  reason: string,
  projectId?: string,
  additionalData?: { studentName?: string }
): Promise<boolean> => {
  try {
    console.log(`📧 [EMAIL SERVICE] Sending ticket rejected email to ${email}`);

    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const studentName = additionalData?.studentName || 'Student';
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Ticket {{ticketNumber}} Rejected`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f44336;">Ticket Rejected</h2>
        <p>Hello {{studentName}},</p>
        <p>Your support ticket has been rejected.</p>
        <div style="background-color: #ffebee; padding: 20px; margin: 20px 0; border-left: 4px solid #f44336;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Reason:</strong> {{reason}}</p>
        </div>
        <p>If you believe this is an error, please create a new ticket with additional details.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from {{projectName}}.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketRejected;
    let subject = (trigger?.subject || defaultSubject).replace(/\{\{ticketNumber\}\}/g, ticketNumber);
    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{reason\}\}/g, reason)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'simulated', metadata: { ticketNumber, reason } });
      return true;
    }

    if (!trigger?.enabled) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'blocked', error: 'Trigger disabled' });
      return false;
    }

    await transporter.sendMail({ from: `"${projectName}" <${emailConfig?.fromEmail}>`, to: email, subject, html: body });
    await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'sent', smtpHost: emailConfig?.smtpHost });
    return true;
  } catch (error) {
    console.error('❌ Failed to send ticket rejected email:', error);
    return false;
  }
};

/**
 * Send ticket reopened email
 */
export const sendTicketReopenedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  projectId?: string,
  additionalData?: { studentName?: string }
): Promise<boolean> => {
  try {
    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const studentName = additionalData?.studentName || 'Student';
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Ticket {{ticketNumber}} Reopened`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff9800;">Ticket Reopened</h2>
        <p>Hello {{studentName}},</p>
        <p>Your support ticket has been reopened.</p>
        <div style="background-color: #fff3e0; padding: 20px; margin: 20px 0; border-left: 4px solid #ff9800;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Status:</strong> <span style="color: #ff9800; font-weight: bold;">Reopened</span></p>
        </div>
        <p>Our team will review your ticket again.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketReopened;
    let subject = (trigger?.subject || defaultSubject).replace(/\{\{ticketNumber\}\}/g, ticketNumber);
    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'simulated' });
      return true;
    }

    if (!trigger?.enabled) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'blocked', error: 'Trigger disabled' });
      return false;
    }

    await transporter.sendMail({ from: `"${projectName}" <${emailConfig?.fromEmail}>`, to: email, subject, html: body });
    await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'sent' });
    return true;
  } catch (error) {
    console.error('❌ Failed to send ticket reopened email:', error);
    return false;
  }
};

/**
 * Send ticket comment added email
 */
export const sendTicketCommentAddedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  commentText: string,
  projectId?: string,
  additionalData?: { studentName?: string }
): Promise<boolean> => {
  try {
    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const studentName = additionalData?.studentName || 'Student';
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `New Comment on Ticket {{ticketNumber}}`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Comment on Your Ticket</h2>
        <p>Hello {{studentName}},</p>
        <p>A new comment has been added to your ticket.</p>
        <div style="background-color: #e3f2fd; padding: 20px; margin: 20px 0; border-left: 4px solid #2196f3;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Comment:</strong></p>
          <p style="background: #fff; padding: 10px; border-radius: 4px;">{{commentText}}</p>
        </div>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketCommentAdded;
    let subject = (trigger?.subject || defaultSubject).replace(/\{\{ticketNumber\}\}/g, ticketNumber);
    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{commentText\}\}/g, commentText)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'simulated' });
      return true;
    }

    if (!trigger?.enabled) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'blocked', error: 'Trigger disabled' });
      return false;
    }

    await transporter.sendMail({ from: `"${projectName}" <${emailConfig?.fromEmail}>`, to: email, subject, html: body });
    await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'sent' });
    return true;
  } catch (error) {
    console.error('❌ Failed to send ticket comment email:', error);
    return false;
  }
};

/**
 * Send ticket replied email
 */
export const sendTicketRepliedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  projectId?: string,
  additionalData?: { studentName?: string }
): Promise<boolean> => {
  try {
    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const studentName = additionalData?.studentName || 'Student';
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Reply to Ticket {{ticketNumber}}`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Reply on Your Ticket</h2>
        <p>Hello {{studentName}},</p>
        <p>There's a new reply on your support ticket.</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
        </div>
        <p>Please log in to view the full reply.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketReplied;
    let subject = (trigger?.subject || defaultSubject).replace(/\{\{ticketNumber\}\}/g, ticketNumber);
    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{studentName\}\}/g, studentName)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'simulated' });
      return true;
    }

    if (!trigger?.enabled) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'blocked', error: 'Trigger disabled' });
      return false;
    }

    await transporter.sendMail({ from: `"${projectName}" <${emailConfig?.fromEmail}>`, to: email, subject, html: body });
    await logEmail({ projectId, recipient: email, subject, body, type: 'ticket_update', status: 'sent' });
    return true;
  } catch (error) {
    console.error('❌ Failed to send ticket replied email:', error);
    return false;
  }
};

/**
 * Send ticket escalated email
 */
export const sendTicketEscalatedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  escalatedTo: string,
  projectId?: string
): Promise<boolean> => {
  try {
    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Ticket {{ticketNumber}} Escalated`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff5722;">Ticket Escalated</h2>
        <p>A ticket has been escalated to you for attention.</p>
        <div style="background-color: #fbe9e7; padding: 20px; margin: 20px 0; border-left: 4px solid #ff5722;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Escalated To:</strong> {{escalatedTo}}</p>
        </div>
        <p>Please review this ticket as soon as possible.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketEscalated;
    let subject = (trigger?.subject || defaultSubject).replace(/\{\{ticketNumber\}\}/g, ticketNumber);
    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{escalatedTo\}\}/g, escalatedTo)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'other', status: 'simulated' });
      return true;
    }

    if (!trigger?.enabled) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'other', status: 'blocked', error: 'Trigger disabled' });
      return false;
    }

    await transporter.sendMail({ from: `"${projectName}" <${emailConfig?.fromEmail}>`, to: email, subject, html: body });
    await logEmail({ projectId, recipient: email, subject, body, type: 'other', status: 'sent' });
    return true;
  } catch (error) {
    console.error('❌ Failed to send ticket escalated email:', error);
    return false;
  }
};

/**
 * Send ticket reassigned email
 */
export const sendTicketReassignedEmail = async (
  email: string,
  ticketNumber: string,
  ticketTitle: string,
  previousAgent: string,
  projectId?: string
): Promise<boolean> => {
  try {
    const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
    const transporter = await getEmailTransporter(projectId);
    const projectName = emailConfig?.fromName || 'SAC Helpdesk';

    const defaultSubject = `Ticket {{ticketNumber}} Reassigned to You`;
    const defaultBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Ticket Reassigned</h2>
        <p>A ticket has been reassigned to you.</p>
        <div style="background-color: #fff3e0; padding: 20px; margin: 20px 0; border-left: 4px solid #ff9800;">
          <p><strong>Ticket Number:</strong> {{ticketNumber}}</p>
          <p><strong>Subject:</strong> {{ticketTitle}}</p>
          <p><strong>Previous Agent:</strong> {{previousAgent}}</p>
        </div>
        <p>Please review this ticket.</p>
      </div>
    `;

    const trigger = emailConfig?.triggers?.ticketReassigned;
    let subject = (trigger?.subject || defaultSubject).replace(/\{\{ticketNumber\}\}/g, ticketNumber);
    let body = (trigger?.body || defaultBody)
      .replace(/\{\{ticketNumber\}\}/g, ticketNumber)
      .replace(/\{\{ticketTitle\}\}/g, ticketTitle)
      .replace(/\{\{previousAgent\}\}/g, previousAgent)
      .replace(/\{\{projectName\}\}/g, projectName);

    if (!transporter) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'other', status: 'simulated' });
      return true;
    }

    if (!trigger?.enabled) {
      await logEmail({ projectId, recipient: email, subject, body, type: 'other', status: 'blocked', error: 'Trigger disabled' });
      return false;
    }

    await transporter.sendMail({ from: `"${projectName}" <${emailConfig?.fromEmail}>`, to: email, subject, html: body });
    await logEmail({ projectId, recipient: email, subject, body, type: 'other', status: 'sent' });
    return true;
  } catch (error) {
    console.error('❌ Failed to send ticket reassigned email:', error);
    return false;
  }
};
