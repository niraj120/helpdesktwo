import nodemailer from 'nodemailer';
import { FeedbackForm } from '../models/FeedbackForm';
import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import EmailConfig from '../models/EmailConfig';

// Helper to get transporter from database config
const getEmailTransporter = async (projectId?: string) => {
  const emailConfig = await EmailConfig.findOne(projectId ? { projectId } : {});
  
  if (!emailConfig || !emailConfig.smtpHost) {
    // Fallback to environment variables
    console.log('⚠️ No email config found, using environment variables');
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  console.log(`📧 Using email config for project: ${projectId}`);
  console.log(`   SMTP Host: ${emailConfig.smtpHost}:${emailConfig.smtpPort}`);
  
  return nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpSecure,
    auth: {
      user: emailConfig.smtpUser,
      pass: emailConfig.smtpPassword
    }
  });
};

export const sendFeedbackEmail = async (ticketId: string) => {
  try {
    // Get ticket details
    const ticket = await Ticket.findById(ticketId);

    if (!ticket || !ticket.metadata?.studentEmail) {
      console.log('Ticket or student email not found');
      return;
    }
    
    // Get transporter for this project
    const transporter = await getEmailTransporter(ticket.metadata.projectId?.toString());

    // Get student details from User model
    const { User } = require('../models/User');
    const student = await User.findOne({ email: ticket.metadata.studentEmail });

    if (!student) {
      console.log('Student not found');
      return;
    }

    // Get project details
    const { Project } = require('../models/Project');
    const project = await Project.findById(ticket.metadata.projectId);

    // Get active feedback form for the project (first active form)
    const feedbackForm = await FeedbackForm.findOne({
      projectId: ticket.metadata.projectId,
      isActive: true
    });

    if (!feedbackForm) {
      console.log('No active feedback form found for this project');
      return;
    }
    
    // Check if email notification is enabled
    if (feedbackForm.settings?.sendEmailNotification === false) {
      console.log('Email notification is disabled for this feedback form');
      return;
    }

    // Build feedback link with token for unauthenticated access
    const crypto = require('crypto');
    const feedbackToken = crypto.createHash('sha256')
      .update(`${ticket._id}-${student._id}-${Date.now()}`)
      .digest('hex');
    
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const feedbackLink = `${baseUrl}/${project.customUrlPath}/student/ticket/${ticket._id}?feedback=true&token=${feedbackToken}&studentId=${student._id}&ticketNumber=${ticket.ticketNumber}`;

    // Replace placeholders in email template
    const subject = feedbackForm.emailTemplate?.subject
      ?.replace('{ticketNumber}', ticket.ticketNumber)
      ?.replace('{studentName}', `${student.firstName} ${student.lastName}`)
      || `Please share your feedback on Ticket #${ticket.ticketNumber}`;

    const body = feedbackForm.emailTemplate?.body
      ?.replace('{ticketNumber}', ticket.ticketNumber)
      ?.replace('{studentName}', `${student.firstName} ${student.lastName}`)
      ?.replace('{feedbackLink}', feedbackLink)
      ?.replace('{projectName}', project?.name || 'Support')
      || `Dear ${student.firstName} ${student.lastName},\n\nYour ticket #${ticket.ticketNumber} has been resolved. We would love to hear your feedback.\n\nPlease click the link below to share your experience:\n${feedbackLink}\n\nThank you for your time!`;

    // Send email
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@helpdesk.com',
      to: student.email,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>')
    };

    await transporter.sendMail(mailOptions);

    console.log(`Feedback email sent to ${student.email} for ticket ${ticket.ticketNumber}`);
  } catch (error) {
    console.error('Error sending feedback email:', error);
  }
};

export const scheduleFeedbackEmail = async (ticketId: string, delayMinutes: number = 0) => {
  if (delayMinutes > 0) {
    setTimeout(() => {
      sendFeedbackEmail(ticketId);
    }, delayMinutes * 60 * 1000);
  } else {
    await sendFeedbackEmail(ticketId);
  }
};
