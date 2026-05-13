import nodemailer from "nodemailer";
import { FeedbackForm } from "../models/FeedbackForm";
import { Ticket } from "../models/Ticket";
import { User } from "../models/User";
import EmailConfig from "../models/EmailConfig";
import { decrypt, isEncrypted } from "../utils/encryption";

// Helper to get transporter and sender info from database config
const getEmailTransporter = async (projectId?: string) => {
  // Query only enabled configs, scoped to project first then any
  const emailConfig = projectId
    ? await EmailConfig.findOne({ projectId, enabled: true })
    : await EmailConfig.findOne({ enabled: true });

  if (!emailConfig || !emailConfig.smtpHost || !emailConfig.smtpUser) {
    // Fallback to environment variables
    console.log(
      "⚠️ No enabled email config found, using environment variables",
    );
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    const fromEmail =
      process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@helpdesk.com";
    const fromName = process.env.SMTP_FROM_NAME || "SAC Helpdesk";
    return { transporter, fromEmail, fromName };
  }

  console.log(`📧 Using email config for project: ${projectId}`);
  console.log(`   SMTP Host: ${emailConfig.smtpHost}:${emailConfig.smtpPort}`);

  // Decrypt password — it is stored encrypted in the database
  let smtpPassword = emailConfig.smtpPassword;
  if (isEncrypted(smtpPassword)) {
    try {
      smtpPassword = decrypt(smtpPassword);
    } catch (err) {
      console.error(
        "❌ Failed to decrypt SMTP password for feedback email:",
        err,
      );
      throw new Error("Failed to decrypt SMTP password");
    }
  }

  const transporter = nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpSecure,
    auth: {
      user: emailConfig.smtpUser,
      pass: smtpPassword,
    },
  });
  const fromEmail =
    emailConfig.fromEmail || emailConfig.smtpUser || "noreply@helpdesk.com";
  const fromName = emailConfig.fromName || "SAC Helpdesk";
  return { transporter, fromEmail, fromName };
};

export const sendFeedbackEmail = async (ticketId: string, formId?: string) => {
  try {
    // Get ticket details
    const ticket = await Ticket.findById(ticketId);

    if (!ticket || !ticket.metadata?.studentEmail) {
      console.log("Ticket or student email not found");
      return;
    }

    // Get transporter and sender info for this project
    const { transporter, fromEmail, fromName } = await getEmailTransporter(
      ticket.metadata.projectId?.toString(),
    );

    // Get student details
    const student = await User.findOne({ email: ticket.metadata.studentEmail });

    if (!student) {
      console.log(
        `Student not found for email: ${ticket.metadata.studentEmail}`,
      );
      return;
    }

    // Get project details
    const { Project } = require("../models/Project");
    const project = await Project.findById(ticket.metadata.projectId);

    // Get the specific feedback form (by formId if provided) or fall back to first active form
    const feedbackForm = formId
      ? await FeedbackForm.findById(formId)
      : await FeedbackForm.findOne({
          projectId: ticket.metadata.projectId,
          isActive: true,
        });

    if (!feedbackForm) {
      console.log("No active feedback form found for this project");
      return;
    }

    // Check if email notification is enabled
    if (feedbackForm.settings?.sendEmailNotification === false) {
      console.log("Email notification is disabled for this feedback form");
      return;
    }

    // Build feedback link with token for unauthenticated access
    const crypto = require("crypto");
    const feedbackToken = crypto
      .createHash("sha256")
      .update(`${ticket._id}-${student._id}-${Date.now()}`)
      .digest("hex");

    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    const projectUrlPath =
      project.branding?.customUrlPath || project.customUrlPath;
    const feedbackLink = `${baseUrl}/${projectUrlPath}/feedback/${ticket._id}?studentId=${student._id}&ticketNumber=${ticket.ticketNumber}&token=${feedbackToken}`;

    // Replace placeholders in email template
    const subject =
      feedbackForm.emailTemplate?.subject
        ?.replace("{ticketNumber}", ticket.ticketNumber)
        ?.replace(
          "{studentName}",
          `${student.firstName} ${student.lastName}`,
        ) || `Please share your feedback on Ticket #${ticket.ticketNumber}`;

    const body =
      feedbackForm.emailTemplate?.body
        ?.replace("{ticketNumber}", ticket.ticketNumber)
        ?.replace("{studentName}", `${student.firstName} ${student.lastName}`)
        ?.replace("{feedbackLink}", feedbackLink)
        ?.replace("{projectName}", project?.name || "Support") ||
      `Dear ${student.firstName} ${student.lastName},\n\nYour ticket #${ticket.ticketNumber} has been resolved. We would love to hear your feedback.\n\nPlease click the link below to share your experience:\n${feedbackLink}\n\nThank you for your time!`;

    // Send email
    const mailOptions = {
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: student.email,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    };

    await transporter.sendMail(mailOptions);

    console.log(
      `Feedback email sent to ${student.email} for ticket ${ticket.ticketNumber}`,
    );
  } catch (error) {
    console.error("Error sending feedback email:", error);
  }
};

export const scheduleFeedbackEmail = async (
  ticketId: string,
  delayMinutes: number = 0,
  formId?: string,
) => {
  if (delayMinutes > 0) {
    setTimeout(
      () => {
        sendFeedbackEmail(ticketId, formId);
      },
      delayMinutes * 60 * 1000,
    );
  } else {
    await sendFeedbackEmail(ticketId, formId);
  }
};
