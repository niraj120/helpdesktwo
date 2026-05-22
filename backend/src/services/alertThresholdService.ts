/**
 * Alert Threshold Service (Phase 3)
 *
 * After a KPI widget value is computed, this service checks whether
 * any alert threshold has been crossed and emits an in-app notification.
 *
 * Threshold config stored in DashboardWidget.config.alertThreshold:
 * {
 *   operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq',
 *   value: number,
 *   notifyUserIds: string[],   // explicit targets (optional)
 *   notifyRoleCode?: string,   // alternative: notify by role
 *   message?: string,          // custom message template
 *   cooldownMinutes?: number,  // re-alert delay (default 60)
 * }
 *
 * Usage (fire-and-forget from widgetDataController):
 *   checkAlertThreshold(widgetKey, numericValue, tenantId, widgetConfig).catch(() => {});
 */

import mongoose from "mongoose";
import { cache } from "../utils/cache";

interface ThresholdConfig {
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  value: number;
  notifyUserIds?: string[];
  notifyRoleCode?: string;
  message?: string;
  cooldownMinutes?: number;
}

type NotificationModel = {
  create: (doc: any) => Promise<any>;
};

function evaluate(
  operator: ThresholdConfig["operator"],
  actual: number,
  threshold: number,
): boolean {
  switch (operator) {
    case "gt":
      return actual > threshold;
    case "lt":
      return actual < threshold;
    case "gte":
      return actual >= threshold;
    case "lte":
      return actual <= threshold;
    case "eq":
      return actual === threshold;
    default:
      return false;
  }
}

/**
 * Check alert threshold for a KPI widget result.
 * Call this after cache is populated for kpi_tile widgets.
 * It is intentionally async and should be called fire-and-forget.
 */
export async function checkAlertThreshold(
  widgetKey: string,
  numericValue: number | null | undefined,
  tenantId: string,
  widgetConfig: Record<string, any>,
): Promise<void> {
  if (numericValue === null || numericValue === undefined) return;

  const threshold: ThresholdConfig | undefined = widgetConfig?.alertThreshold;
  if (!threshold || typeof threshold.value !== "number") return;

  if (!evaluate(threshold.operator, numericValue, threshold.value)) return;

  // Cooldown check — prevent alert storm
  const cooldownMinutes = threshold.cooldownMinutes ?? 60;
  const cooldownKey = `alert_cooldown:${tenantId}:${widgetKey}:${threshold.operator}:${threshold.value}`;
  const coolingDown = cache.get<boolean>(cooldownKey);
  if (coolingDown) return;

  // Set cooldown
  cache.set(cooldownKey, true, cooldownMinutes * 60);

  // Build message
  const defaultMessage = `Alert: ${widgetKey} is ${numericValue} (threshold: ${threshold.operator} ${threshold.value})`;
  const message =
    threshold.message?.replace("{value}", String(numericValue)) ??
    defaultMessage;

  // Determine recipient user IDs
  let recipientIds: string[] = threshold.notifyUserIds ?? [];

  if (recipientIds.length === 0 && threshold.notifyRoleCode) {
    try {
      // Dynamic import to avoid circular dependency
      const { User } = await import("../models/User");
      const { Role } = await import("../models/Role");
      const role = await Role.findOne({
        code: threshold.notifyRoleCode,
      }).lean();
      if (role) {
        const users = await User.find(
          {
            role: role._id,
            isActive: true,
            projects: new mongoose.Types.ObjectId(tenantId),
          },
          "_id",
        ).lean();
        recipientIds = users.map((u: any) => u._id.toString());
      }
    } catch {
      return;
    }
  }

  if (recipientIds.length === 0) return;

  // Emit in-app notifications via Socket.IO (fire-and-forget)
  // We use the dashboardEvents bus rather than inserting Notification docs
  // (the Notification model has strict required fields incompatible with dashboard alerts)
  try {
    const { dashboardEvents } = await import("./dashboardEventBus");
    dashboardEvents.emit("dashboard.alert", {
      tenantId,
      widgetKey,
      message,
      actualValue: numericValue,
      thresholdValue: threshold.value,
      operator: threshold.operator,
      recipientIds,
    });
  } catch {
    // Never throw — analytics side-effect
  }
}
