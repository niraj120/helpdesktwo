/**
 * Scheduled Report Controller
 *
 * CRUD endpoints for dashboard scheduled reports.
 * All routes require dashboard.manage permission.
 *
 * Routes (mounted at /api/v1/admin/dashboards/scheduled-reports):
 *   GET    /                → list all reports for tenant
 *   POST   /                → create new report
 *   GET    /:id             → get report by id
 *   PUT    /:id             → update report
 *   DELETE /:id             → delete report
 *   POST   /:id/send-now   → trigger immediate delivery
 */

import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../middleware/auth";
import { DashScheduledReport } from "../../models/dashboard/DashScheduledReport";
import { DashboardTemplate } from "../../models/dashboard/DashboardTemplate";
import { generateReport } from "../../services/dashboard/reportGenerationService";
import { sendReportEmail } from "../../services/dashboard/reportEmailService";
import {
  registerNewTask,
  destroyTask,
} from "../../services/dashboard/reportScheduler";
import cron from "node-cron";

// Derive tenantId from authenticated user's projects
function getTenantId(req: AuthRequest): string | null {
  const projects = (req.user as any)?.projects;
  if (Array.isArray(projects) && projects.length > 0) {
    const first = projects[0];
    return first?._id?.toString() ?? first?.toString() ?? null;
  }
  return null;
}

// Pre-built cron expressions for common schedule types
const SCHEDULE_CRON: Record<string, string> = {
  daily: "0 8 * * *",
  weekly: "0 8 * * 1",
  monthly: "0 8 1 * *",
};

export async function listScheduledReports(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const reports = await DashScheduledReport.find({ tenant_id: tenantId })
      .sort({ createdAt: -1 })
      .populate("dashboard_template_id", "name")
      .lean();

    res.json({ success: true, data: reports });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createScheduledReport(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const {
      dashboard_template_id,
      name,
      schedule_type,
      cron_expression: customCron,
      timezone,
      recipients,
      format,
      date_range_days,
      include_widgets,
      subject_template,
      body_template,
      is_active,
    } = req.body;

    // Validate template exists and belongs to tenant
    const template = await DashboardTemplate.findOne({
      _id: new mongoose.Types.ObjectId(dashboard_template_id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).lean();

    if (!template) {
      res
        .status(404)
        .json({ success: false, message: "Dashboard template not found" });
      return;
    }

    // Resolve cron expression
    let cronExpression =
      schedule_type === "custom_cron"
        ? customCron
        : SCHEDULE_CRON[schedule_type];

    if (!cronExpression || !cron.validate(cronExpression)) {
      res.status(400).json({
        success: false,
        message: `Invalid cron expression: ${cronExpression}`,
      });
      return;
    }

    const report = await DashScheduledReport.create({
      dashboard_template_id: new mongoose.Types.ObjectId(dashboard_template_id),
      name,
      schedule_type,
      cron_expression: cronExpression,
      timezone: timezone ?? "Asia/Kolkata",
      recipients: recipients ?? [],
      format: format ?? "pdf",
      date_range_days: date_range_days ?? 7,
      include_widgets: (include_widgets ?? []).map(
        (id: string) => new mongoose.Types.ObjectId(id),
      ),
      subject_template,
      body_template,
      is_active: is_active !== false,
      created_by: new mongoose.Types.ObjectId(req.user!.userId),
      tenant_id: tenantId,
    });

    // Register cron task if active
    if (report.is_active) {
      registerNewTask(report);
    }

    res.status(201).json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getScheduledReport(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const report = await DashScheduledReport.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      tenant_id: tenantId,
    })
      .populate("dashboard_template_id", "name")
      .lean();

    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateScheduledReport(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const {
      name,
      schedule_type,
      cron_expression: customCron,
      timezone,
      recipients,
      format,
      date_range_days,
      include_widgets,
      subject_template,
      body_template,
      is_active,
    } = req.body;

    // Resolve cron expression
    let cronExpression: string | undefined;
    if (schedule_type) {
      cronExpression =
        schedule_type === "custom_cron"
          ? customCron
          : SCHEDULE_CRON[schedule_type];

      if (!cronExpression || !cron.validate(cronExpression)) {
        res.status(400).json({
          success: false,
          message: `Invalid cron expression: ${cronExpression}`,
        });
        return;
      }
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (schedule_type !== undefined) updateData.schedule_type = schedule_type;
    if (cronExpression !== undefined)
      updateData.cron_expression = cronExpression;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (recipients !== undefined) updateData.recipients = recipients;
    if (format !== undefined) updateData.format = format;
    if (date_range_days !== undefined)
      updateData.date_range_days = date_range_days;
    if (include_widgets !== undefined) {
      updateData.include_widgets = include_widgets.map(
        (id: string) => new mongoose.Types.ObjectId(id),
      );
    }
    if (subject_template !== undefined)
      updateData.subject_template = subject_template;
    if (body_template !== undefined) updateData.body_template = body_template;
    if (is_active !== undefined) updateData.is_active = is_active;

    const report = await DashScheduledReport.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(req.params.id), tenant_id: tenantId },
      updateData,
      { new: true },
    );

    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    // Re-register cron task with updated settings
    registerNewTask(report);

    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteScheduledReport(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const report = await DashScheduledReport.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params.id),
      tenant_id: tenantId,
    });

    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    destroyTask(String(report._id));

    res.json({ success: true, message: "Scheduled report deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function sendReportNow(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const report = await DashScheduledReport.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      tenant_id: tenantId,
    });

    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    const template = await DashboardTemplate.findById(
      report.dashboard_template_id,
    ).lean();
    const dashboardName = (template as any)?.name ?? "Dashboard";

    try {
      const attachment = await generateReport(report, tenantId);
      await sendReportEmail(report, attachment, dashboardName, tenantId);

      await DashScheduledReport.findByIdAndUpdate(report._id, {
        last_run_at: new Date(),
        last_run_status: "success",
        last_error: undefined,
      });

      res.json({ success: true, message: "Report sent successfully" });
    } catch (err: any) {
      await DashScheduledReport.findByIdAndUpdate(report._id, {
        last_run_at: new Date(),
        last_run_status: "failed",
        last_error: err.message,
      }).catch(() => {});

      res
        .status(500)
        .json({
          success: false,
          message: `Failed to send report: ${err.message}`,
        });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
