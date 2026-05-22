/**
 * Threshold Alert Controller (Sprint 11)
 *
 * CRUD for dashboard threshold alerts.
 * Mounted under /api/v1/admin/dashboards/:id/alerts
 */

import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../middleware/auth";
import { DashThresholdAlert } from "../../models/dashboard/DashThresholdAlert";
import { DashboardWidget } from "../../models/dashboard/DashboardWidget";
import { evaluateAlerts } from "../../services/dashboard/alertEvaluationService";

function getTenantId(req: AuthRequest): string | null {
  const projects = (req.user as any)?.projects;
  if (Array.isArray(projects) && projects.length > 0) {
    const first = projects[0];
    return first?._id?.toString() ?? first?.toString() ?? null;
  }
  return null;
}

export async function listThresholdAlerts(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const alerts = await DashThresholdAlert.find({
      dashboard_template_id: new mongoose.Types.ObjectId(req.params.id),
      tenant_id: tenantId,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: alerts });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createThresholdAlert(
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
      dashboard_widget_id,
      alert_name,
      condition,
      severity,
      notify_roles,
      notify_users,
      cooldown_minutes,
      is_active,
    } = req.body;

    // Look up widget to denormalise widget_key
    const widget = await DashboardWidget.findById(dashboard_widget_id).lean();
    if (!widget) {
      res.status(404).json({ success: false, message: "Widget not found" });
      return;
    }

    const alert = await DashThresholdAlert.create({
      dashboard_template_id: new mongoose.Types.ObjectId(req.params.id),
      dashboard_widget_id: new mongoose.Types.ObjectId(dashboard_widget_id),
      widget_key: (widget as any).widgetKey,
      alert_name,
      condition,
      severity: severity ?? "warning",
      notify_roles: (notify_roles ?? []).map(
        (id: string) => new mongoose.Types.ObjectId(id),
      ),
      notify_users: (notify_users ?? []).map(
        (id: string) => new mongoose.Types.ObjectId(id),
      ),
      cooldown_minutes: cooldown_minutes ?? 60,
      is_active: is_active !== false,
      created_by: new mongoose.Types.ObjectId(req.user!.userId),
      tenant_id: tenantId,
    });

    res.status(201).json({ success: true, data: alert });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateThresholdAlert(
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
      alert_name,
      condition,
      severity,
      notify_roles,
      notify_users,
      cooldown_minutes,
      is_active,
    } = req.body;

    const updateData: Record<string, any> = {};
    if (alert_name !== undefined) updateData.alert_name = alert_name;
    if (condition !== undefined) updateData.condition = condition;
    if (severity !== undefined) updateData.severity = severity;
    if (notify_roles !== undefined) {
      updateData.notify_roles = notify_roles.map(
        (id: string) => new mongoose.Types.ObjectId(id),
      );
    }
    if (notify_users !== undefined) {
      updateData.notify_users = notify_users.map(
        (id: string) => new mongoose.Types.ObjectId(id),
      );
    }
    if (cooldown_minutes !== undefined)
      updateData.cooldown_minutes = cooldown_minutes;
    if (is_active !== undefined) updateData.is_active = is_active;

    const alert = await DashThresholdAlert.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(req.params.aid),
        dashboard_template_id: new mongoose.Types.ObjectId(req.params.id),
        tenant_id: tenantId,
      },
      updateData,
      { new: true },
    );

    if (!alert) {
      res.status(404).json({ success: false, message: "Alert not found" });
      return;
    }

    res.json({ success: true, data: alert });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteThresholdAlert(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const deleted = await DashThresholdAlert.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params.aid),
      dashboard_template_id: new mongoose.Types.ObjectId(req.params.id),
      tenant_id: tenantId,
    });

    if (!deleted) {
      res.status(404).json({ success: false, message: "Alert not found" });
      return;
    }

    res.json({ success: true, message: "Alert deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function testThresholdAlert(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const alert = await DashThresholdAlert.findOne({
      _id: new mongoose.Types.ObjectId(req.params.aid),
      dashboard_template_id: new mongoose.Types.ObjectId(req.params.id),
      tenant_id: tenantId,
    }).lean();

    if (!alert) {
      res.status(404).json({ success: false, message: "Alert not found" });
      return;
    }

    // Simulate a value that definitely triggers the condition
    const testValue = alert.condition.value;

    // Force evaluation by temporarily bypassing cooldown (use the exact threshold value)
    await evaluateAlerts(alert.widget_key, testValue, tenantId);

    res.json({
      success: true,
      message: `Test alert fired for widget "${alert.widget_key}" with value ${testValue}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
