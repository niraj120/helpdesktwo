/**
 * Alert Evaluation Service (Sprint 11)
 *
 * Evaluates DB-backed threshold alerts whenever a widget value is refreshed.
 * Distinct from alertThresholdService.ts (Phase 3) which reads from widget config.
 *
 * This service reads from the dash_threshold_alerts collection, enforces cooldown,
 * evaluates conditions, and fires notifications via the dashboard event bus.
 *
 * Called fire-and-forget from widgetDataController.ts alongside the Phase 3 check.
 */

import mongoose from "mongoose";
import { DashThresholdAlert } from "../../models/dashboard/DashThresholdAlert";
import { dashboardEvents } from "../dashboardEventBus";

function evalCondition(
  val: number,
  operator: string,
  threshold: number,
): boolean {
  switch (operator) {
    case "gt":
      return val > threshold;
    case "lt":
      return val < threshold;
    case "gte":
      return val >= threshold;
    case "lte":
      return val <= threshold;
    case "eq":
      return val === threshold;
    default:
      return false;
  }
}

// Simple in-process cooldown map: alertId → expiry timestamp
const cooldownMap = new Map<string, number>();

function isOnCooldown(alertId: string): boolean {
  const expiry = cooldownMap.get(alertId);
  return expiry !== undefined && Date.now() < expiry;
}

function setCooldown(alertId: string, minutes: number): void {
  cooldownMap.set(alertId, Date.now() + minutes * 60 * 1000);
}

async function getRecipientIds(
  notifyRoles: mongoose.Types.ObjectId[],
  notifyUsers: mongoose.Types.ObjectId[],
  tenantId: string,
): Promise<string[]> {
  const ids = new Set<string>(notifyUsers.map((u) => u.toString()));

  if (notifyRoles.length > 0) {
    try {
      const { User } = await import("../../models/User");
      const users = await User.find(
        {
          role: { $in: notifyRoles },
          isActive: true,
          projects: new mongoose.Types.ObjectId(tenantId),
        },
        "_id",
      ).lean();
      for (const u of users) {
        ids.add((u as any)._id.toString());
      }
    } catch {
      // Non-blocking — proceed with users already in set
    }
  }

  return [...ids];
}

export async function evaluateAlerts(
  widget_key: string,
  new_value: number,
  tenantId: string,
): Promise<void> {
  try {
    const alerts = await DashThresholdAlert.find({
      widget_key,
      tenant_id: tenantId,
      is_active: true,
    }).lean();

    if (!alerts.length) return;

    for (const alert of alerts) {
      const alertId = String(alert._id);

      if (
        !evalCondition(
          new_value,
          alert.condition.operator,
          alert.condition.value,
        )
      ) {
        continue;
      }

      if (isOnCooldown(alertId)) continue;

      // Set cooldown immediately to prevent multiple fires
      setCooldown(alertId, alert.cooldown_minutes ?? 60);

      // Persist trigger metadata
      await DashThresholdAlert.findByIdAndUpdate(alertId, {
        last_triggered_at: new Date(),
        last_triggered_value: new_value,
      }).catch(() => {});

      // Resolve recipients
      const recipientIds = await getRecipientIds(
        alert.notify_roles ?? [],
        alert.notify_users ?? [],
        tenantId,
      );

      if (recipientIds.length === 0) continue;

      const operatorLabels: Record<string, string> = {
        gt: ">",
        lt: "<",
        gte: "≥",
        lte: "≤",
        eq: "=",
      };

      const message = `[${alert.severity.toUpperCase()}] ${alert.alert_name}: ${widget_key} is ${new_value} (threshold: ${operatorLabels[alert.condition.operator] ?? alert.condition.operator} ${alert.condition.value})`;

      // Emit to dashboard event bus (same pattern as alertThresholdService.ts)
      dashboardEvents.emit("dashboard.alert", {
        tenantId,
        widgetKey: widget_key,
        message,
        actualValue: new_value,
        thresholdValue: alert.condition.value,
        operator: alert.condition.operator,
        severity: alert.severity,
        alertName: alert.alert_name,
        recipientIds,
      });
    }
  } catch {
    // Never throw — this is a fire-and-forget side-effect
  }
}
