/**
 * Dashboard Event Bus
 *
 * Lightweight in-process event emitter for cache invalidation.
 * Controllers emit domain events; this bus invalidates the relevant
 * widget cache keys in response.
 *
 * Usage in a controller:
 *   import { dashboardEvents } from "../services/dashboardEventBus";
 *   dashboardEvents.emit("ticket.created", { tenantId, projectId });
 *   dashboardEvents.emit("ticket.closed",  { tenantId, projectId });
 *   dashboardEvents.emit("ticket.assigned", { tenantId, projectId, assigneeId });
 *   dashboardEvents.emit("user.created",    { tenantId, centreId });
 *   dashboardEvents.emit("user.status_changed", { tenantId, centreId });
 *   dashboardEvents.emit("centre.ideal_count_changed", { tenantId, centreId });
 *   dashboardEvents.emit("user_target.changed", { tenantId, projectId });
 *   dashboardEvents.emit("attendance.submitted", { tenantId });
 */

import { EventEmitter } from "events";
import { invalidateWidgetCache } from "./widgetQueryEngine";

export type DashboardEventPayload = {
  tenantId: string;
  projectId?: string;
  centreId?: string;
  assigneeId?: string;
};

class DashboardEventEmitter extends EventEmitter {}

export const dashboardEvents = new DashboardEventEmitter();

// Prevent memory leak warnings for many event types
dashboardEvents.setMaxListeners(50);

export function initDashboardEventBus(): void {
  // ── ticket.created ──────────────────────────────────────────────────────────
  dashboardEvents.on("ticket.created", (payload: DashboardEventPayload) => {
    const { tenantId } = payload;
    if (!tenantId) return;
    invalidateWidgetCache(tenantId, [
      "ticket_open_count",
      "ticket_by_status",
      "ticket_trend_over_time",
      "ticket_footfall_count",
      "ticket_footfall_trend",
      "ticket_footfall_by_center",
    ]);
  });

  // ── ticket.commented ───────────────────────────────────────────────────────
  dashboardEvents.on("ticket.commented", (payload: DashboardEventPayload) => {
    const { tenantId } = payload;
    if (!tenantId) return;
    invalidateWidgetCache(tenantId, [
      "ticket_footfall_count",
      "ticket_footfall_trend",
      "ticket_footfall_by_center",
    ]);
  });

  // ── ticket.closed ───────────────────────────────────────────────────────────
  dashboardEvents.on("ticket.closed", (payload: DashboardEventPayload) => {
    const { tenantId } = payload;
    if (!tenantId) return;
    invalidateWidgetCache(tenantId, [
      "ticket_open_count",
      "ticket_closed_count",
      "ticket_by_status",
      "ticket_trend_over_time",
      "ticket_sla_compliance",
      "ticket_sla_resolution_rate",
    ]);
  });

  // ── ticket.assigned ─────────────────────────────────────────────────────────
  dashboardEvents.on("ticket.assigned", (payload: DashboardEventPayload) => {
    const { tenantId } = payload;
    if (!tenantId) return;
    invalidateWidgetCache(tenantId, [
      "ticket_assignee_workload",
      "my_assigned_tickets",
    ]);
  });

  // ── ticket.status_changed ───────────────────────────────────────────────────
  dashboardEvents.on(
    "ticket.status_changed",
    (payload: DashboardEventPayload) => {
      const { tenantId } = payload;
      if (!tenantId) return;
      invalidateWidgetCache(tenantId, [
        "ticket_open_count",
        "ticket_closed_count",
        "ticket_by_status",
        "ticket_sla_compliance",
      ]);
    },
  );

  // ── user.created ────────────────────────────────────────────────────────────
  dashboardEvents.on("user.created", (payload: DashboardEventPayload) => {
    const { tenantId } = payload;
    if (!tenantId) return;
    invalidateWidgetCache(tenantId, [
      "user_active_count",
      "user_required_vs_onboarded",
      "user_onboarding_completion_rate",
      "centre_ideal_vs_active",
      "centre_capacity_gap",
      "centre_capacity_utilisation",
    ]);
  });

  // ── user.status_changed ─────────────────────────────────────────────────────
  dashboardEvents.on(
    "user.status_changed",
    (payload: DashboardEventPayload) => {
      const { tenantId } = payload;
      if (!tenantId) return;
      invalidateWidgetCache(tenantId, [
        "user_active_count",
        "user_inactive_count",
        "user_required_vs_onboarded",
        "user_onboarding_completion_rate",
        "centre_ideal_vs_active",
        "centre_capacity_gap",
        "centre_capacity_utilisation",
      ]);
    },
  );

  // ── centre.ideal_count_changed ──────────────────────────────────────────────
  dashboardEvents.on(
    "centre.ideal_count_changed",
    (payload: DashboardEventPayload) => {
      const { tenantId } = payload;
      if (!tenantId) return;
      invalidateWidgetCache(tenantId, [
        "centre_ideal_vs_active",
        "centre_capacity_gap",
        "centre_capacity_utilisation",
      ]);
    },
  );

  // ── user_target.changed ─────────────────────────────────────────────────────
  dashboardEvents.on(
    "user_target.changed",
    (payload: DashboardEventPayload) => {
      const { tenantId } = payload;
      if (!tenantId) return;
      invalidateWidgetCache(tenantId, [
        "user_required_vs_onboarded",
        "user_onboarding_completion_rate",
      ]);
    },
  );

  // ── attendance.submitted ────────────────────────────────────────────────────
  dashboardEvents.on(
    "attendance.submitted",
    (payload: DashboardEventPayload) => {
      const { tenantId } = payload;
      if (!tenantId) return;
      invalidateWidgetCache(tenantId, [
        "attendance_today_rate",
        "attendance_mtd_rate",
      ]);
    },
  );

  // ── dashboard.alert ─────────────────────────────────────────────────────────
  // Fired by alertThresholdService when a widget value crosses a threshold.
  // Forwards the alert to each recipient via Socket.IO.
  dashboardEvents.on("dashboard.alert", (payload: any) => {
    const { recipientIds, message, widgetKey, actualValue } = payload;
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getIo } = require("../socket/ioInstance");
      const io = getIo();
      if (io) {
        recipientIds.forEach((userId: string) => {
          io.to(`user:${userId}`).emit("dashboard:alert", {
            widgetKey,
            message,
            actualValue,
            timestamp: new Date().toISOString(),
          });
        });
      }
    } catch {
      // never throw from event handler
    }
  });

  console.log(
    "📡 Dashboard Event Bus: cache invalidation listeners registered",
  );
}
