/**
 * Report Email Service
 *
 * Sends scheduled dashboard reports via email using existing EmailConfig SMTP settings.
 */

import nodemailer from "nodemailer";
import mongoose from "mongoose";
import { isEncrypted, decrypt } from "../../utils/encryption";
import EmailConfig from "../../models/EmailConfig";
import { IDashScheduledReport } from "../../models/dashboard/DashScheduledReport";

interface ReportAttachment {
  content: Buffer;
  mimeType: string;
  filename: string;
  inlineHtml?: string;
}

async function getTransporter(tenantId: string) {
  const emailConfig = await EmailConfig.findOne({
    projectId: new mongoose.Types.ObjectId(tenantId),
    enabled: true,
  });

  if (!emailConfig || !emailConfig.smtpHost || !emailConfig.smtpUser) {
    // Fallback to environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return {
      transporter,
      fromEmail:
        process.env.SMTP_FROM ??
        process.env.SMTP_USER ??
        "noreply@helpdesk.com",
      fromName: process.env.SMTP_FROM_NAME ?? "SAC Helpdesk",
    };
  }

  let smtpPassword = emailConfig.smtpPassword;
  if (isEncrypted(smtpPassword)) {
    smtpPassword = decrypt(smtpPassword);
  }

  const transporter = nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpSecure,
    auth: { user: emailConfig.smtpUser, pass: smtpPassword },
  });

  return {
    transporter,
    fromEmail:
      emailConfig.fromEmail ?? emailConfig.smtpUser ?? "noreply@helpdesk.com",
    fromName: emailConfig.fromName ?? "SAC Helpdesk",
  };
}

function interpolateTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? `{{${key}}}`,
  );
}

export async function sendReportEmail(
  report: IDashScheduledReport,
  attachment: ReportAttachment,
  dashboardName: string,
  tenantId: string,
): Promise<void> {
  if (!report.recipients || report.recipients.length === 0) return;

  const { transporter, fromEmail, fromName } = await getTransporter(tenantId);

  const now = new Date();
  const periodEnd = new Date(now);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (report.date_range_days ?? 7));

  const templateVars: Record<string, string> = {
    dashboard_name: dashboardName,
    date: now.toLocaleDateString("en-IN"),
    period: `${periodStart.toLocaleDateString("en-IN")} – ${periodEnd.toLocaleDateString("en-IN")}`,
    report_name: report.name,
  };

  const subject = interpolateTemplate(
    report.subject_template ??
      "Dashboard Report: {{dashboard_name}} — {{date}}",
    templateVars,
  );

  const bodyText = interpolateTemplate(
    report.body_template ??
      "Please find attached the dashboard report for {{dashboard_name}} covering the period {{period}}.",
    templateVars,
  );

  const toAddresses = report.recipients.map((r) =>
    r.name ? `"${r.name}" <${r.email}>` : r.email,
  );

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: toAddresses,
    subject,
  };

  if (report.format === "email_inline" && attachment.inlineHtml) {
    mailOptions.html = attachment.inlineHtml;
    mailOptions.text = bodyText;
  } else {
    mailOptions.text = bodyText;
    mailOptions.html = `<p>${bodyText.replace(/\n/g, "<br>")}</p>`;
    mailOptions.attachments = [
      {
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.mimeType,
      },
    ];
  }

  await transporter.sendMail(mailOptions);
}
