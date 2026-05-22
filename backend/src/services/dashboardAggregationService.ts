/**
 * dashboardAggregationService — Phase 4
 *
 * Pre-aggregates heavy daily metrics into DashboardSummarySnapshot so
 * widget queries can serve dashboards from a small summary collection
 * instead of hitting the full Ticket index each time.
 *
 * Schedules itself with setInterval every 15 minutes.
 * Also exposed as `runAggregationNow()` for admin-triggered refreshes.
 *
 * Metrics computed per tenantId (= project _id):
 *   - open_tickets        : current open ticket count (status 1 or 2)
 *   - closed_today        : tickets closed (status 5) today UTC
 *   - sla_breach_count    : currently breached tickets (slaStatus = "Outside SLA")
 *   - created_today       : tickets created today UTC
 *   - resolved_this_week  : tickets resolved this week (status 4 or 5)
 */

import mongoose from "mongoose";
import { Ticket } from "../models/Ticket";
import { Project } from "../models/Project";
import { DashboardSummarySnapshot } from "../models/dashboard/DashboardSummarySnapshot";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfWeekUTC(): Date {
  const d = startOfDayUTC();
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Sunday
  return d;
}

async function upsert(
  tenantId: mongoose.Types.ObjectId,
  metricKey: string,
  value: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  const date = startOfDayUTC();
  await DashboardSummarySnapshot.findOneAndUpdate(
    { tenantId, metricKey, date },
    { $set: { value, meta, computedAt: new Date() } },
    { upsert: true },
  );
}

// ─── Per-tenant aggregation ───────────────────────────────────────────────────

async function aggregateForTenant(
  tenantId: mongoose.Types.ObjectId,
): Promise<void> {
  const todayStart = startOfDayUTC();
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = startOfWeekUTC();

  const [
    openCount,
    closedToday,
    slaBreachCount,
    createdToday,
    resolvedThisWeek,
  ] = await Promise.all([
    // open_tickets: status 1 (open) or 2 (in-progress)
    Ticket.countDocuments({ project: tenantId, status: { $in: [1, 2] } }),

    // closed_today: status 5 (closed) AND closedAt within today
    Ticket.countDocuments({
      project: tenantId,
      status: 5,
      closedAt: { $gte: todayStart, $lt: todayEnd },
    }),

    // sla_breach_count: slaStatus = "Outside SLA" and still open
    Ticket.countDocuments({
      project: tenantId,
      status: { $in: [1, 2, 3] },
      slaStatus: "Outside SLA",
    }),

    // created_today
    Ticket.countDocuments({
      project: tenantId,
      createdAt: { $gte: todayStart, $lt: todayEnd },
    }),

    // resolved_this_week: status 4 or 5 AND resolvedAt this week
    Ticket.countDocuments({
      project: tenantId,
      status: { $in: [4, 5] },
      resolvedAt: { $gte: weekStart },
    }),
  ]);

  await Promise.all([
    upsert(tenantId, "open_tickets", openCount),
    upsert(tenantId, "closed_today", closedToday),
    upsert(tenantId, "sla_breach_count", slaBreachCount),
    upsert(tenantId, "created_today", createdToday),
    upsert(tenantId, "resolved_this_week", resolvedThisWeek),
  ]);
}

// ─── Full aggregation pass ────────────────────────────────────────────────────

export async function runAggregationNow(): Promise<{
  tenantsProcessed: number;
  durationMs: number;
}> {
  const start = Date.now();
  let tenantsProcessed = 0;

  // Only aggregate for active projects that have at least 1 ticket
  const activeProjectIds = await Ticket.distinct("project");

  for (const id of activeProjectIds) {
    if (!id) continue;
    const tenantId =
      typeof id === "string"
        ? new mongoose.Types.ObjectId(id)
        : (id as mongoose.Types.ObjectId);
    try {
      await aggregateForTenant(tenantId);
      tenantsProcessed++;
    } catch (err) {
      // Never crash the entire job for one tenant
      console.error(
        `[dashboardAggregation] Error for tenant ${tenantId}:`,
        err,
      );
    }
  }

  return { tenantsProcessed, durationMs: Date.now() - start };
}

// ─── Scheduler (15-minute interval) ──────────────────────────────────────────

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startAggregationScheduler(): void {
  if (_intervalId) return; // already started

  // Run once on startup (non-blocking)
  setImmediate(() => {
    runAggregationNow()
      .then(({ tenantsProcessed, durationMs }) =>
        console.log(
          `[dashboardAggregation] Initial run done — ${tenantsProcessed} tenants in ${durationMs}ms`,
        ),
      )
      .catch((err) =>
        console.error("[dashboardAggregation] Initial run failed:", err),
      );
  });

  // Then every 15 minutes
  _intervalId = setInterval(
    () => {
      runAggregationNow()
        .then(({ tenantsProcessed, durationMs }) =>
          console.log(
            `[dashboardAggregation] Scheduled run done — ${tenantsProcessed} tenants in ${durationMs}ms`,
          ),
        )
        .catch((err) =>
          console.error("[dashboardAggregation] Scheduled run failed:", err),
        );
    },
    15 * 60 * 1000,
  );
  _intervalId.unref?.(); // don't prevent process exit
}

export function stopAggregationScheduler(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
