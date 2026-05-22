/**
 * Attendance Report Alert Scheduler
 *
 * Manages cron jobs for scheduled attendance report email alerts.
 * Works similarly to reportAlertScheduler.ts but queries AttendanceRecord
 * instead of the helpdesk report query service.
 */

import cron from "node-cron";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { ReportAssignment } from "../../models/reports/ReportAssignment";
import { SavedReport } from "../../models/reports/SavedReport";
import { User } from "../../models/User";
import { AttendanceRecord } from "../../models/attendance/AttendanceRecord";
import EmailConfig from "../../models/EmailConfig";
import { isEncrypted, decrypt } from "../../utils/encryption";

// In-memory map: reportId string → cron task
const alertTasks = new Map<string, ReturnType<typeof cron.schedule>>();

// Data-point key → DB field mapping
const DP_FIELD_MAP: Record<string, string> = {
  employee_id:          "employeeCode",
  attendanceDate:       "attendanceDate",
  punch_in:             "punchIn",
  punch_out:            "punchOut",
  total_working_hours:  "totalWorkingHours",
  status:               "status",
  center:               "center",
  published:            "published",
};

const DP_LABEL_MAP: Record<string, string> = {
  employee_id:          "Employee ID",
  employeeName:         "Name",
  attendanceDate:       "Date",
  punch_in:             "Punch In",
  punch_out:            "Punch Out",
  total_working_hours:  "Total Hours",
  status:               "Status",
  center:               "Center",
  geo:                  "Geo Location",
  published:            "Published",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildCronExpression(
  scheduleType: string,
  scheduleDay: number,
  scheduleTime: string,
): string {
  const [hh, mm] = scheduleTime.split(":").map(Number);
  const hour   = isNaN(hh) ? 8 : hh;
  const minute = isNaN(mm) ? 0 : mm;
  switch (scheduleType) {
    case "weekly":  return `${minute} ${hour} * * ${scheduleDay}`;
    case "monthly": return `${minute} ${hour} ${scheduleDay} * *`;
    case "daily":
    default:        return `${minute} ${hour} * * *`;
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
          host:   emailConfig.smtpHost,
          port:   emailConfig.smtpPort,
          secure: emailConfig.smtpSecure,
          auth:   { user: emailConfig.smtpUser, pass: smtpPassword },
        });
        return {
          transporter,
          fromEmail: emailConfig.fromEmail ?? emailConfig.smtpUser ?? "noreply@helpdesk.com",
          fromName:  emailConfig.fromName  ?? "SAC Helpdesk",
        };
      }
    } catch {
      // fall through to env vars
    }
  }
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "localhost",
    port:   parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return {
    transporter,
    fromEmail: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@helpdesk.com",
    fromName:  process.env.SMTP_FROM_NAME ?? "SAC Helpdesk",
  };
}

function rowsToCsv(headers: string[], rows: Record<string, any>[]): string {
  const escape = (v: any): string => {
    const s =
      v === null || v === undefined
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    const escaped = s.replace(/"/g, '""');
    return /[,"\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

/** Build an AttendanceRecord mongo query from a SavedReport's filters array. */
function buildAttendanceQuery(
  projectId: string,
  filters: { field: string; operator: string; value: string }[],
): Record<string, any> {
  const query: Record<string, any> = {
    projectId: new mongoose.Types.ObjectId(projectId),
  };

  for (const f of filters) {
    if (!f.field || !f.value) continue;
    switch (f.field) {
      case "attendanceDate": {
        if (!query.attendanceDate) query.attendanceDate = {};
        if (f.operator === "equals") {
          const d = new Date(f.value);
          const end = new Date(f.value); end.setHours(23, 59, 59, 999);
          query.attendanceDate.$gte = d;
          query.attendanceDate.$lte = end;
        } else if (f.operator === "after") {
          query.attendanceDate.$gte = new Date(f.value);
        } else if (f.operator === "before") {
          const end = new Date(f.value); end.setHours(23, 59, 59, 999);
          query.attendanceDate.$lte = end;
        }
        break;
      }
      case "status":       query.status = f.value; break;
      case "center":       query.center = f.value; break;
      case "employee_id":  query.employeeCode = f.value; break;
    }
  }
  return query;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job runner
// ─────────────────────────────────────────────────────────────────────────────

async function runAttendanceAlertJob(assignmentId: string): Promise<void> {
  const assignment = await ReportAssignment.findById(assignmentId).lean();
  if (!assignment || !assignment.alertEnabled) return;

  const report = await SavedReport.findById(assignment.reportId).lean();
  if (!report || !(report as any).isActive) {
    console.warn(
      `[AttendanceAlertScheduler] SavedReport ${assignment.reportId} not found or inactive — skipping.`,
    );
    return;
  }

  const projectId: string | undefined = (report as any).projectId?.toString();

  // Fetch primary TO recipients (assigned users)
  const userDocs = await User.find({ _id: { $in: assignment.assignedToUsers } })
    .select("email firstName lastName")
    .lean();

  const recipients = userDocs
    .filter((u: any) => u.email)
    .map((u: any) => ({
      email: u.email as string,
      name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
    }));

  // Build CC list
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
      `[AttendanceAlertScheduler] No email recipients for report "${(report as any).name}" — skipping.`,
    );
    return;
  }

  if (!projectId) {
    console.warn(
      `[AttendanceAlertScheduler] Report "${(report as any).name}" has no projectId — skipping.`,
    );
    return;
  }

  // Query attendance records
  const mongoQuery = buildAttendanceQuery(
    projectId,
    (report as any).filters ?? [],
  );

  const raw = await AttendanceRecord.find(mongoQuery)
    .sort({ attendanceDate: -1, employeeCode: 1 })
    .limit(10000)
    .lean();

  // Batch-fetch user names
  const userIds = [...new Set(raw.map((r: any) => r.userId?.toString()).filter(Boolean))];
  const nameUsers = await User.find({ _id: { $in: userIds } })
    .select("_id firstName lastName")
    .lean();
  const nameMap = new Map<string, string>();
  for (const u of nameUsers as any[]) {
    nameMap.set(
      u._id.toString(),
      [u.firstName, u.lastName].filter(Boolean).join(" ") || "",
    );
  }

  // Build rows using report.dataPoints
  const dataPoints: string[] = (report as any).dataPoints ?? [];
  const headers = dataPoints.map((k) => DP_LABEL_MAP[k] ?? k);

  const labeledRows = raw.map((r: any) => {
    const out: Record<string, any> = {};
    dataPoints.forEach((k, i) => {
      if (k === "employeeName") {
        out[headers[i]] = nameMap.get(r.userId?.toString() ?? "") ?? "";
      } else if (k === "geo") {
        out[headers[i]] =
          r.geoLat != null ? `${r.geoLat},${r.geoLong}` : "";
      } else {
        const dbField = DP_FIELD_MAP[k] ?? k;
        out[headers[i]] = r[dbField] ?? "";
      }
    });
    return out;
  });

  const csvContent = rowsToCsv(headers, labeledRows);
  const csvBuffer = Buffer.from(csvContent, "utf-8");

  const { transporter, fromEmail, fromName } = await getTransporter(projectId);

  const reportName = (report as any).name ?? "Attendance Report";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN");

  // Promote CC to TO if no primary recipients
  let toAddresses = recipients.map((r) =>
    r.name ? `"${r.name}" <${r.email}>` : r.email,
  );
  let finalCcAddresses = ccAddresses;
  if (toAddresses.length === 0) {
    toAddresses = ccAddresses;
    finalCcAddresses = [];
    console.warn(
      `[AttendanceAlertScheduler] No TO recipients for "${reportName}" — promoting CC addresses to TO.`,
    );
  }

  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to:   toAddresses.join(", "),
    ...(finalCcAddresses.length > 0 ? { cc: finalCcAddresses.join(", ") } : {}),
    subject: `Scheduled Attendance Report: ${reportName} — ${dateStr}`,
    text: `Hi,\n\nPlease find attached the scheduled attendance report "${reportName}" generated on ${dateStr}.\n\nThis report contains ${raw.length} row(s).\n\nRegards,\nSAC Helpdesk`,
    html: `<p>Hi,</p><p>Please find attached the scheduled attendance report <strong>${reportName}</strong> generated on ${dateStr}.</p><p>This report contains <strong>${raw.length}</strong> row(s).</p><p>Regards,<br/>SAC Helpdesk</p>`,
    attachments: [
      {
        filename: `${reportName.replace(/[^a-z0-9]/gi, "_")}_${now.getTime()}.csv`,
        content: csvBuffer,
        contentType: "text/csv",
      },
    ],
  });

  await ReportAssignment.findByIdAndUpdate(assignmentId, { lastAlertSentAt: now });

  console.log(
    `[AttendanceAlertScheduler] Sent alert for "${reportName}" to ${toAddresses.length} recipient(s).`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the attendance report alert immediately (test / on-demand).
 */
export async function sendAttendanceAlertNow(reportId: string): Promise<void> {
  const assignment = await ReportAssignment.findOne({ reportId }).lean();
  if (!assignment) throw new Error("No assignment found for this report");
  await runAttendanceAlertJob(String(assignment._id));
}

export function registerAttendanceAlertTask(assignment: any): void {
  const assignmentId = String(assignment._id);
  const reportId = String(assignment.reportId);

  destroyAttendanceAlertTask(reportId);

  if (!assignment.alertEnabled) return;

  const cronExpr = buildCronExpression(
    assignment.scheduleType ?? "daily",
    assignment.scheduleDay ?? 1,
    assignment.scheduleTime ?? "08:00",
  );

  if (!cron.validate(cronExpr)) {
    console.warn(
      `[AttendanceAlertScheduler] Invalid cron expression "${cronExpr}" for assignment ${assignmentId}`,
    );
    return;
  }

  const task = cron.schedule(
    cronExpr,
    () => {
      runAttendanceAlertJob(assignmentId).catch((err) =>
        console.error(
          `[AttendanceAlertScheduler] Error running alert for assignment ${assignmentId}:`,
          err,
        ),
      );
    },
    { timezone: "Asia/Kolkata" },
  );

  alertTasks.set(reportId, task);
  console.log(
    `[AttendanceAlertScheduler] Registered alert for reportId=${reportId} (${cronExpr})`,
  );
}

export function destroyAttendanceAlertTask(reportId: string): void {
  const existing = alertTasks.get(reportId);
  if (existing) {
    existing.stop();
    alertTasks.delete(reportId);
  }
}

export async function startAttendanceAlertScheduler(): Promise<void> {
  try {
    // Find all ReportAssignments with alertEnabled=true for attendance reports
    const activeReports = await SavedReport.find({
      reportType: "attendance",
      isActive: true,
    })
      .select("_id")
      .lean();

    const reportIds = activeReports.map((r: any) => r._id);
    const assignments = await ReportAssignment.find({
      reportId: { $in: reportIds },
      alertEnabled: true,
    }).lean();

    let registered = 0;
    for (const assignment of assignments) {
      registerAttendanceAlertTask(assignment);
      registered++;
    }

    console.log(
      `[AttendanceAlertScheduler] Started — ${registered} attendance alert(s) scheduled.`,
    );
  } catch (err) {
    console.error("[AttendanceAlertScheduler] Failed to start:", err);
  }
}
