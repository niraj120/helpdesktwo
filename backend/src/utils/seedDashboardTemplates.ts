/**
 * Seed Pre-built Dashboard Templates
 *
 * Seeds 5 role-specific dashboard templates using existing widget definitions.
 * Idempotent — skips if a template with the same name already exists.
 * Called once at startup after seedWidgetDefinitions().
 */

import mongoose from "mongoose";
import { DashboardTemplate } from "../models/dashboard/DashboardTemplate";
import { DashboardWidget } from "../models/dashboard/DashboardWidget";
import { WidgetDefinition } from "../models/dashboard/WidgetDefinition";

interface TemplateWidgetSpec {
  widgetKey: string;
  displayName?: string;
  visualisationType?: string;
  gridColumn: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  displayOrder: number;
  config?: Record<string, any>;
}

interface TemplateSpec {
  name: string;
  description: string;
  targetScope: "tenant" | "centre" | "user";
  widgets: TemplateWidgetSpec[];
}

const TEMPLATES: TemplateSpec[] = [
  // ── 1. Admin Overview ─────────────────────────────────────────────────────
  {
    name: "Admin Overview",
    description:
      "High-level KPIs: ticket health, SLA performance, user counts, and trends. Suitable for system administrators.",
    targetScope: "tenant",
    widgets: [
      {
        widgetKey: "ticket_open_count",
        displayName: "Open Tickets",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 0,
      },
      {
        widgetKey: "ticket_closed_count",
        displayName: "Closed Tickets",
        visualisationType: "kpi_tile",
        gridColumn: 3,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 1,
      },
      {
        widgetKey: "ticket_sla_compliance",
        displayName: "SLA Compliance",
        visualisationType: "kpi_tile",
        gridColumn: 6,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 2,
      },
      {
        widgetKey: "user_active_count",
        displayName: "Active Users",
        visualisationType: "kpi_tile",
        gridColumn: 9,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 3,
      },
      {
        widgetKey: "ticket_by_status",
        displayName: "Tickets by Status",
        visualisationType: "donut_chart",
        gridColumn: 0,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 3,
        displayOrder: 4,
      },
      {
        widgetKey: "ticket_trend_over_time",
        displayName: "Ticket Trend",
        visualisationType: "line_chart",
        gridColumn: 4,
        gridRow: 2,
        gridWidth: 8,
        gridHeight: 3,
        displayOrder: 5,
      },
      {
        widgetKey: "user_by_role",
        displayName: "Users by Role",
        visualisationType: "donut_chart",
        gridColumn: 0,
        gridRow: 5,
        gridWidth: 4,
        gridHeight: 3,
        displayOrder: 6,
      },
      {
        widgetKey: "ticket_assignee_workload",
        displayName: "Agent Workload",
        visualisationType: "bar_chart",
        gridColumn: 4,
        gridRow: 5,
        gridWidth: 8,
        gridHeight: 3,
        displayOrder: 7,
      },
      // Sprint 9 — Satisfaction row
      {
        widgetKey: "csat_score",
        displayName: "CSAT Score",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 8,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 8,
      },
      {
        widgetKey: "satisfaction_trend",
        displayName: "Satisfaction Trend",
        visualisationType: "line_chart",
        gridColumn: 4,
        gridRow: 8,
        gridWidth: 8,
        gridHeight: 3,
        displayOrder: 9,
      },
    ],
  },

  // ── 2. Agent Dashboard ────────────────────────────────────────────────────
  {
    name: "Agent Dashboard",
    description:
      "Personal productivity dashboard for support agents — shows assigned tickets, personal SLA, and status breakdown.",
    targetScope: "user",
    widgets: [
      {
        widgetKey: "my_assigned_tickets",
        displayName: "My Open Tickets",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 0,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 0,
        config: { filters: { assignedTo: "@ctx.userId" } },
      },
      {
        widgetKey: "ticket_sla_compliance",
        displayName: "My SLA Compliance",
        visualisationType: "kpi_tile",
        gridColumn: 4,
        gridRow: 0,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 1,
      },
      {
        widgetKey: "ticket_closed_count",
        displayName: "Closed (This Period)",
        visualisationType: "kpi_tile",
        gridColumn: 8,
        gridRow: 0,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 2,
      },
      {
        widgetKey: "ticket_by_status",
        displayName: "My Tickets by Status",
        visualisationType: "donut_chart",
        gridColumn: 0,
        gridRow: 2,
        gridWidth: 6,
        gridHeight: 3,
        displayOrder: 3,
      },
      {
        widgetKey: "ticket_trend_over_time",
        displayName: "Ticket Trend",
        visualisationType: "line_chart",
        gridColumn: 6,
        gridRow: 2,
        gridWidth: 6,
        gridHeight: 3,
        displayOrder: 4,
      },
      // Sprint 9 — Agent CSAT breakdown
      {
        widgetKey: "csat_by_agent",
        displayName: "My CSAT by Ticket",
        visualisationType: "table",
        gridColumn: 0,
        gridRow: 5,
        gridWidth: 12,
        gridHeight: 3,
        displayOrder: 5,
      },
    ],
  },

  // ── 3. DNO Dashboard ──────────────────────────────────────────────────────
  {
    name: "DNO Dashboard",
    description:
      "District Node Officer view — ticket health, user onboarding progress, and centre capacity.",
    targetScope: "tenant",
    widgets: [
      {
        widgetKey: "ticket_open_count",
        displayName: "Open Tickets",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 0,
      },
      {
        widgetKey: "ticket_sla_resolution_rate",
        displayName: "SLA Resolution",
        visualisationType: "kpi_tile",
        gridColumn: 3,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 1,
      },
      {
        widgetKey: "user_active_count",
        displayName: "Active Users",
        visualisationType: "kpi_tile",
        gridColumn: 6,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 2,
      },
      {
        widgetKey: "centre_capacity_gap",
        displayName: "Capacity Gap",
        visualisationType: "kpi_tile",
        gridColumn: 9,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 3,
      },
      {
        widgetKey: "ticket_by_status",
        displayName: "Tickets by Status",
        visualisationType: "donut_chart",
        gridColumn: 0,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 3,
        displayOrder: 4,
      },
      {
        widgetKey: "user_required_vs_onboarded",
        displayName: "Required vs Onboarded",
        visualisationType: "progress_bar",
        gridColumn: 4,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 3,
        displayOrder: 5,
      },
      {
        widgetKey: "centre_ideal_vs_active",
        displayName: "Centre Staffing",
        visualisationType: "bar_chart",
        gridColumn: 8,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 3,
        displayOrder: 6,
      },
    ],
  },

  // ── 4. Facilitator Dashboard ──────────────────────────────────────────────
  {
    name: "Facilitator Dashboard",
    description:
      "Centre facilitator view focused on attendance tracking and local user activity.",
    targetScope: "centre",
    widgets: [
      {
        widgetKey: "attendance_today_rate",
        displayName: "Attendance Today",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 0,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 0,
      },
      {
        widgetKey: "attendance_mtd_rate",
        displayName: "MTD Attendance",
        visualisationType: "kpi_tile",
        gridColumn: 4,
        gridRow: 0,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 1,
      },
      {
        widgetKey: "user_active_count",
        displayName: "Active Users",
        visualisationType: "kpi_tile",
        gridColumn: 8,
        gridRow: 0,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 2,
      },
      {
        widgetKey: "ticket_open_count",
        displayName: "Open Tickets",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 2,
        displayOrder: 3,
      },
      {
        widgetKey: "user_onboarding_completion_rate",
        displayName: "Onboarding Rate",
        visualisationType: "progress_bar",
        gridColumn: 4,
        gridRow: 2,
        gridWidth: 8,
        gridHeight: 2,
        displayOrder: 4,
      },
    ],
  },

  // ── 5. Project Head Dashboard ─────────────────────────────────────────────
  {
    name: "Project Head Dashboard",
    description:
      "Executive overview for project heads — all KPI tiles, capacity utilisation, and ticket workload.",
    targetScope: "tenant",
    widgets: [
      {
        widgetKey: "ticket_open_count",
        displayName: "Open Tickets",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 0,
      },
      {
        widgetKey: "ticket_sla_compliance",
        displayName: "SLA Compliance",
        visualisationType: "kpi_tile",
        gridColumn: 3,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 1,
      },
      {
        widgetKey: "user_active_count",
        displayName: "Active Users",
        visualisationType: "kpi_tile",
        gridColumn: 6,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 2,
      },
      {
        widgetKey: "centre_capacity_utilisation",
        displayName: "Capacity Utilisation",
        visualisationType: "kpi_tile",
        gridColumn: 9,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 3,
      },
      {
        widgetKey: "attendance_today_rate",
        displayName: "Attendance Today",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 2,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 4,
      },
      {
        widgetKey: "user_onboarding_completion_rate",
        displayName: "Onboarding Rate",
        visualisationType: "kpi_tile",
        gridColumn: 3,
        gridRow: 2,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 5,
      },
      {
        widgetKey: "centre_capacity_gap",
        displayName: "Capacity Gap",
        visualisationType: "kpi_tile",
        gridColumn: 6,
        gridRow: 2,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 6,
      },
      {
        widgetKey: "user_inactive_count",
        displayName: "Inactive Users",
        visualisationType: "kpi_tile",
        gridColumn: 9,
        gridRow: 2,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 7,
      },
      {
        widgetKey: "ticket_trend_over_time",
        displayName: "Ticket Trend",
        visualisationType: "line_chart",
        gridColumn: 0,
        gridRow: 4,
        gridWidth: 7,
        gridHeight: 3,
        displayOrder: 8,
      },
      {
        widgetKey: "centre_ideal_vs_active",
        displayName: "Centre Staffing",
        visualisationType: "bar_chart",
        gridColumn: 7,
        gridRow: 4,
        gridWidth: 5,
        gridHeight: 3,
        displayOrder: 9,
      },
    ],
  },
  // ── 6. Satisfaction Overview (Sprint 9) ───────────────────────────────────
  {
    name: "Satisfaction Overview",
    description:
      "CSAT, NPS, and CES metrics with trend and per-agent breakdown. Suitable for managers tracking support quality.",
    targetScope: "tenant",
    widgets: [
      {
        widgetKey: "csat_score",
        displayName: "CSAT Score",
        visualisationType: "kpi_tile",
        gridColumn: 0,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 0,
      },
      {
        widgetKey: "nps_score",
        displayName: "NPS Score",
        visualisationType: "kpi_tile",
        gridColumn: 3,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 1,
      },
      {
        widgetKey: "ces_score",
        displayName: "CES Score",
        visualisationType: "kpi_tile",
        gridColumn: 6,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 2,
      },
      {
        widgetKey: "feedback_response_rate",
        displayName: "Feedback Response Rate",
        visualisationType: "kpi_tile",
        gridColumn: 9,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        displayOrder: 3,
      },
      {
        widgetKey: "satisfaction_trend",
        displayName: "Satisfaction Trend",
        visualisationType: "line_chart",
        gridColumn: 0,
        gridRow: 2,
        gridWidth: 7,
        gridHeight: 3,
        displayOrder: 4,
      },
      {
        widgetKey: "csat_by_agent",
        displayName: "CSAT by Agent",
        visualisationType: "bar_chart",
        gridColumn: 7,
        gridRow: 2,
        gridWidth: 5,
        gridHeight: 3,
        displayOrder: 5,
      },
    ],
  },
];

export async function seedDashboardTemplates(): Promise<void> {
  // Build widgetKey → ObjectId map
  const defs = await WidgetDefinition.find({}, "_id widgetKey").lean();
  const defMap = Object.fromEntries(defs.map((d) => [d.widgetKey, d._id]));

  let seeded = 0;

  for (const spec of TEMPLATES) {
    const existing = await DashboardTemplate.findOne({ name: spec.name });
    if (existing) continue; // Skip — already seeded

    // Build widget docs
    const widgetDocs = spec.widgets
      .filter((w) => defMap[w.widgetKey]) // Only include known widgets
      .map((w) => ({
        _id: new mongoose.Types.ObjectId(),
        widgetDefinitionId: defMap[w.widgetKey],
        widgetKey: w.widgetKey,
        displayName: w.displayName ?? w.widgetKey,
        visualisationType: w.visualisationType ?? "kpi_tile",
        gridColumn: w.gridColumn,
        gridRow: w.gridRow,
        gridWidth: w.gridWidth,
        gridHeight: w.gridHeight,
        displayOrder: w.displayOrder,
        config: w.config ?? {},
      }));

    const savedWidgets = await DashboardWidget.insertMany(widgetDocs);
    const widgetIds = savedWidgets.map((w) => w._id);

    await DashboardTemplate.create({
      name: spec.name,
      description: spec.description,
      targetScope: spec.targetScope,
      status: "published",
      widgets: widgetIds,
    });

    seeded++;
  }

  if (seeded > 0) {
    console.log(
      `📊 Dashboard Engine: Seeded ${seeded} pre-built dashboard templates`,
    );
  } else {
    console.log(
      `📊 Dashboard Engine: Pre-built templates already present — skipping`,
    );
  }
}
