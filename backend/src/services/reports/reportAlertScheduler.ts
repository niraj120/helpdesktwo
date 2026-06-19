/**
 * Report Alert Scheduler
 *
 * Manages cron jobs for scheduled report alert delivery.
 * Each ReportAssignment with alertEnabled=true gets a cron job that:
 *   1. Runs the SavedReport query
 *   2. Builds a CSV attachment
 *   3. Sends the CSV to all assignedToUsers via their email addresses
 */

import cron from "node-cron";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { ReportAssignment } from "../../models/reports/ReportAssignment";
import { SavedReport } from "../../models/reports/SavedReport";
import { User } from "../../models/User";
import { ReportDataPoint } from "../../models/reports/ReportDataPoint";
import { runReportQuery } from "../reportQueryService";
import {
  computeFootfallByCenter,
  FOOTFALL_COLUMNS,
} from "../../controllers/reports/reportController";
import EmailConfig from "../../models/EmailConfig";
import { isEncrypted, decrypt } from "../../utils/encryption";

// In-memory map: reportId string → cron task
const alertTasks = new Map<string, ReturnType<typeof cron.schedule>>();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a cron expression from schedule fields.
 *   daily:   runs at scheduleTime every day           → "MM HH * * *"
 *   weekly:  runs at scheduleTime on scheduleDay       → "MM HH * * D"  (D=0 Sun … 6 Sat)
 *   monthly: runs at scheduleTime on scheduleDay/month → "MM HH D * *"  (D=1..31)
 */
function buildCronExpression(
  scheduleType: string,
  scheduleDay: number,
  scheduleTime: string,
): string {
  const [hh, mm] = scheduleTime.split(":").map(Number);
  const hour = isNaN(hh) ? 8 : hh;
  const minute = isNaN(mm) ? 0 : mm;
  switch (scheduleType) {
    case "weekly":
      return `${minute} ${hour} * * ${scheduleDay}`;
    case "monthly":
      return `${minute} ${hour} ${scheduleDay} * *`;
    case "daily":
    default:
      return `${minute} ${hour} * * *`;
  }
}

async function getTransporter(projectId?: string) {
  if (projectId) {
    try {
      const emailConfig = await EmailConfig.findOne({
        projectId: new mongoose.Types.ObjectId(projectId),
        enabled: true,
      });
      if (emailConfig?.smtpHost && emailConfig?.smtpUser) {
        let smtpPassword = emailConfig.smtpPassword;
        if (isEncrypted(smtpPassword)) smtpPassword = decrypt(smtpPassword);
        const transporter = nodemailer.createTransport({
          host: emailConfig.smtpHost,
          port: emailConfig.smtpPort,
          secure: emailConfig.smtpSecure,
          auth: { user: emailConfig.smtpUser, pass: smtpPassword },
        });
        return {
          transporter,
          fromEmail:
            emailConfig.fromEmail ??
            emailConfig.smtpUser ??
            "noreply@helpdesk.com",
          fromName: emailConfig.fromName ?? "SAC Helpdesk",
        };
      }
    } catch {
      // fall through to env vars
    }
  }
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
      process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@helpdesk.com",
    fromName: process.env.SMTP_FROM_NAME ?? "SAC Helpdesk",
  };
}

function rowsToCsv(headers: string[], rows: Record<string, any>[]): string {
  const escape = (v: any): string => {
    const s =
      v === null || v === undefined
        ? ""
        : Array.isArray(v)
          ? v.join("; ")
          : String(v);
    const escaped = s.replace(/"/g, '""');
    return /[,"\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };
  const csvLines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];
  return csvLines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job runner
// ─────────────────────────────────────────────────────────────────────────────

async function runAlertJob(assignmentId: string): Promise<void> {
  const assignment = await ReportAssignment.findById(assignmentId).lean();
  if (!assignment || !assignment.alertEnabled) return;

  const reportId = assignment.reportId;
  const report = await SavedReport.findById(reportId).lean();
  if (!report || !(report as any).isActive) {
    console.warn(
      `[ReportAlertScheduler] SavedReport ${reportId} not found or inactive — skipping alert.`,
    );
    return;
  }

  // Fetch all assigned users' emails (TO)
  const userDocs = await User.find({
    _id: { $in: assignment.assignedToUsers },
  })
    .select("email firstName lastName")
    .lean();

  const recipients = userDocs
    .filter((u: any) => u.email)
    .map((u: any) => ({
      email: u.email as string,
      name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
    }));

  // Build CC list: ccUsers (system users) + ccEmails (free-form)
  const ccUserDocs = assignment.ccUsers?.length
    ? await User.find({ _id: { $in: assignment.ccUsers } })
        .select("email firstName lastName")
        .lean()
    : [];
  const ccFromUsers: string[] = (ccUserDocs as any[])
    .filter((u) => u.email)
    .map((u) =>
      u.firstName || u.lastName
        ? `"${`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()}" <${u.email}>`
        : u.email,
    );
  const ccFromEmails: string[] = (assignment.ccEmails ?? []).filter(Boolean);
  const ccAddresses = [...ccFromUsers, ...ccFromEmails];

  if (recipients.length === 0 && ccAddresses.length === 0) {
    console.warn(
      `[ReportAlertScheduler] No email recipients for report "${(report as any).name}" — skipping.`,
    );
    return;
  }

  // Build the CSV — footfall reports are aggregated; everything else uses the
  // row-per-record query engine.
  let headers: string[];
  let labeledRows: Record<string, any>[];
  let rowCount: number;

  if ((report as any).reportType === "footfall") {
    const result = await computeFootfallByCenter({
      projectId: (report as any).projectId?.toString(),
      dateRangeDays: (report as any).footfallDays ?? 30,
    });
    headers = FOOTFALL_COLUMNS.map((c) => c.label);
    labeledRows = result.data.map((r: any) => {
      const out: Record<string, any> = {};
      for (const c of FOOTFALL_COLUMNS) out[c.label] = r[c.key];
      return out;
    });
    const t = result.totals || {};
    const totalRow: Record<string, any> = {
      [FOOTFALL_COLUMNS[0].label]: "TOTAL",
    };
    for (const c of FOOTFALL_COLUMNS.slice(1))
      totalRow[c.label] = (t as Record<string, any>)[c.key] ?? 0;
    labeledRows.push(totalRow);
    rowCount = result.data.length;
  } else {
    // Run the report query (all rows, no pagination limit for email)
    const dataPoints: string[] = (report as any).dataPoints ?? [];
    const { rows } = await runReportQuery(
      dataPoints,
      (report as any).filters ?? [],
      (report as any).sortBy,
      (report as any).sortOrder,
      (report as any).projectId?.toString(),
      1,
      10000, // reasonable cap for email attachment
    );

    // Build data-point label map for CSV headers
    const dpDocs = await ReportDataPoint.find({
      key: { $in: dataPoints },
    })
      .select("key label")
      .lean();
    const labelMap: Record<string, string> = {};
    dpDocs.forEach((d: any) => {
      labelMap[d.key] = d.label;
    });
    headers = dataPoints.map((k) => labelMap[k] ?? k);

    // Build rows using label-keyed headers for CSV columns
    labeledRows = rows.map((row: any) => {
      const out: Record<string, any> = {};
      dataPoints.forEach((k, i) => {
        out[headers[i]] = row[k];
      });
      return out;
    });
    rowCount = rows.length;
  }

  const csvContent = rowsToCsv(headers, labeledRows);
  const csvBuffer = Buffer.from(csvContent, "utf-8");

  const { transporter, fromEmail, fromName } = await getTransporter(
    (report as any).projectId?.toString(),
  );

  const reportName = (report as any).name ?? "Report";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN");

  // If no primary TO recipients, promote CC addresses to TO so email still goes out
  let toAddresses = recipients.map((r) =>
    r.name ? `"${r.name}" <${r.email}>` : r.email,
  );
  let finalCcAddresses = ccAddresses;
  if (toAddresses.length === 0) {
    toAddresses = ccAddresses;
    finalCcAddresses = [];
    console.warn(
      `[ReportAlertScheduler] No TO recipients for "${reportName}" — promoting CC addresses to TO.`,
    );
  }

  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to: toAddresses.join(", "),
    ...(finalCcAddresses.length > 0 ? { cc: finalCcAddresses.join(", ") } : {}),
    subject: `Scheduled Report: ${reportName} — ${dateStr}`,
    text: `Hi,\n\nPlease find attached the scheduled report "${reportName}" generated on ${dateStr}.\n\nThis report contains ${rowCount} row(s).\n\nRegards,\nSAC Helpdesk`,
    html: `<p>Hi,</p><p>Please find attached the scheduled report <strong>${reportName}</strong> generated on ${dateStr}.</p><p>This report contains <strong>${rowCount}</strong> row(s).</p><p>Regards,<br/>SAC Helpdesk</p>`,
    attachments: [
      {
        filename: `${reportName.replace(/[^a-z0-9]/gi, "_")}_${now.getTime()}.csv`,
        content: csvBuffer,
        contentType: "text/csv",
      },
    ],
  });

  // Update lastAlertSentAt
  await ReportAssignment.findByIdAndUpdate(assignmentId, {
    lastAlertSentAt: now,
  });

  console.log(
    `[ReportAlertScheduler] Sent alert for "${reportName}" to ${recipients.length} recipient(s).`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the scheduled report alert immediately (for testing / on-demand send).
 * Looks up the assignment by reportId and runs the job.
 */
export async function sendAlertNow(reportId: string): Promise<void> {
  const assignment = await ReportAssignment.findOne({ reportId }).lean();
  if (!assignment) throw new Error("No assignment found for this report");
  await runAlertJob(String(assignment._id));
}

export function registerReportAlertTask(assignment: any): void {
  const assignmentId = String(assignment._id);
  const reportId = String(assignment.reportId);

  // Remove any existing task for this report
  destroyReportAlertTask(reportId);

  if (!assignment.alertEnabled) return;

  const cronExpr = buildCronExpression(
    assignment.scheduleType ?? "daily",
    assignment.scheduleDay ?? 1,
    assignment.scheduleTime ?? "08:00",
  );

  if (!cron.validate(cronExpr)) {
    console.warn(
      `[ReportAlertScheduler] Invalid cron expression "${cronExpr}" for assignment ${assignmentId}`,
    );
    return;
  }

  const task = cron.schedule(
    cronExpr,
    () => {
      runAlertJob(assignmentId).catch((err) =>
        console.error(
          `[ReportAlertScheduler] Error running alert for assignment ${assignmentId}:`,
          err,
        ),
      );
    },
    { timezone: "Asia/Kolkata" },
  );

  alertTasks.set(reportId, task);
  console.log(
    `[ReportAlertScheduler] Registered alert for reportId=${reportId} (${cronExpr})`,
  );
}

export function destroyReportAlertTask(reportId: string): void {
  const existing = alertTasks.get(reportId);
  if (existing) {
    existing.stop();
    alertTasks.delete(reportId);
  }
}

export async function startReportAlertScheduler(): Promise<void> {
  try {
    const assignments = await ReportAssignment.find({
      alertEnabled: true,
    }).lean();
    let registered = 0;

    for (const assignment of assignments) {
      registerReportAlertTask(assignment);
      registered++;
    }

    console.log(
      `[ReportAlertScheduler] Started — ${registered} alert(s) scheduled.`,
    );
  } catch (err) {
    console.error("[ReportAlertScheduler] Failed to start:", err);
  }
}

export function getActiveAlertTaskCount(): number {
  return alertTasks.size;
}
