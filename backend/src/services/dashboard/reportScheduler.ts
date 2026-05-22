/**
 * Report Scheduler
 *
 * Manages cron jobs for scheduled dashboard reports using node-cron.
 * Starts all active reports on server boot and allows dynamic registration/removal.
 */

import cron from "node-cron";
import { DashScheduledReport } from "../../models/dashboard/DashScheduledReport";
import { DashboardTemplate } from "../../models/dashboard/DashboardTemplate";
import { generateReport } from "./reportGenerationService";
import { sendReportEmail } from "./reportEmailService";

// In-memory registry of active cron tasks: reportId → ScheduledTask
const activeTasks = new Map<string, ReturnType<typeof cron.schedule>>();

async function runReport(reportId: string): Promise<void> {
  const report = await DashScheduledReport.findById(reportId);
  if (!report || !report.is_active) return;

  const tenantId = report.tenant_id;

  try {
    const template = await DashboardTemplate.findById(
      report.dashboard_template_id,
    ).lean();
    const dashboardName = (template as any)?.name ?? "Dashboard";

    const attachment = await generateReport(report, tenantId);
    await sendReportEmail(report, attachment, dashboardName, tenantId);

    await DashScheduledReport.findByIdAndUpdate(reportId, {
      last_run_at: new Date(),
      last_run_status: "success",
      last_error: undefined,
    });
  } catch (err: any) {
    console.error(
      `[ReportScheduler] Failed to run report "${report.name}":`,
      err.message,
    );
    await DashScheduledReport.findByIdAndUpdate(reportId, {
      last_run_at: new Date(),
      last_run_status: "failed",
      last_error: String(err.message ?? err),
    }).catch(() => {});
  }
}

export function registerNewTask(report: any): void {
  const reportId = String(report._id);

  // Remove existing task if any
  destroyTask(reportId);

  if (!report.is_active) return;

  if (!cron.validate(report.cron_expression)) {
    console.warn(
      `[ReportScheduler] Invalid cron expression for report "${report.name}": ${report.cron_expression}`,
    );
    return;
  }

  const task = cron.schedule(
    report.cron_expression,
    () => {
      runReport(reportId).catch((err) =>
        console.error("[ReportScheduler] Uncaught error:", err),
      );
    },
    {
      timezone: report.timezone ?? "Asia/Kolkata",
    },
  );

  activeTasks.set(reportId, task);
  console.log(
    `[ReportScheduler] Scheduled report "${report.name}" (${report.cron_expression})`,
  );
}

export function destroyTask(reportId: string): void {
  const existing = activeTasks.get(reportId);
  if (existing) {
    existing.stop();
    activeTasks.delete(reportId);
  }
}

export async function startReportScheduler(): Promise<void> {
  try {
    const reports = await DashScheduledReport.find({ is_active: true }).lean();
    let registered = 0;

    for (const report of reports) {
      if (cron.validate((report as any).cron_expression)) {
        registerNewTask(report);
        registered++;
      }
    }

    console.log(
      `[ReportScheduler] Started — ${registered} report(s) scheduled.`,
    );
  } catch (err) {
    console.error("[ReportScheduler] Failed to start scheduler:", err);
  }
}

export function getActiveTaskCount(): number {
  return activeTasks.size;
}
