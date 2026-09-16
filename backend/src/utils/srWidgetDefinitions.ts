/**
 * Service Request (PSR/ISR) widget definitions.
 *
 * Declared once here and pulled into both seed paths — the startup seeder
 * (seedWidgetDefinitions) and the catalog fallback used when the collection is
 * empty — so a widget can never exist in one list and not the other.
 *
 * Every key has a handler in services/widgetHandlers/srDashboardHandlers.ts.
 */

const widget = (
  widgetKey: string,
  displayName: string,
  description: string,
  supportedVisualisations: string[],
  cacheTtlSeconds = 120,
  defaultConfig: Record<string, any> = { filters: {} },
) => ({
  widgetKey,
  module: "service_request",
  displayName,
  description,
  supportedVisualisations,
  defaultVisualisation: supportedVisualisations[0],
  scopeLevels: ["tenant", "project", "centre", "user"],
  cacheTtlSeconds,
  dataQueryKey: widgetKey,
  defaultConfig,
  isActive: true,
  version: 1,
});

const KPI = ["kpi_tile", "sparkline"];
const GAUGE = ["gauge", "progress_bar", "kpi_tile"];
const SPLIT = ["donut_chart", "bar_chart", "table"];
const BARS = ["bar_chart", "table"];

export const SR_WIDGET_DEFINITIONS = [
  // ── Volume ───────────────────────────────────────────────────────────────
  widget("sr_open_count", "Open Service Requests", "Requests that are not in a closing status right now.", KPI),
  widget("sr_created_count", "Requests Raised", "Service requests raised in the selected period, with trend.", KPI),
  widget("sr_closed_count", "Requests Closed", "Service requests closed in the selected period, with trend.", KPI),
  widget("sr_unassigned_count", "Unassigned Requests", "Open requests with nobody assigned to work them.", KPI),
  widget("sr_volume_by_type", "Requests by Type", "PSR (parent) vs ISR (internal).", SPLIT),
  widget("sr_by_status", "Requests by Status", "Breakdown by status, named as the project configured it.", SPLIT),
  widget("sr_trend_over_time", "Raised vs Closed", "Daily requests raised against requests closed.", ["line_chart", "bar_chart", "table"], 300),
  widget("sr_aging_buckets", "Open Request Age", "How long open requests have been waiting.", SPLIT, 300),

  // ── Commitment (the WIP committed date) ──────────────────────────────────
  widget(
    "sr_wip_due_soon_count",
    "Committed Dates Due Soon",
    "Open requests whose committed date falls within the next window.",
    KPI,
    120,
    { filters: { withinHours: 48 } },
  ),
  widget("sr_wip_expired_count", "Committed Dates Missed", "Open requests already past the date committed to the requester.", KPI),
  widget("sr_committed_date_met_rate", "Committed Date Met", "Share of closed requests that met the date committed to the requester.", GAUGE, 300),

  // ── SLA ──────────────────────────────────────────────────────────────────
  widget("sr_sla_compliance", "SLA Compliance", "Share of requests closed within their SLA.", GAUGE, 300),
  widget("sr_overdue_count", "Past SLA", "Open requests past their SLA whose clock is running (held clocks excluded).", KPI),
  widget("sr_on_hold_count", "SLA On Hold", "Requests whose SLA clock is held, waiting out a committed date.", KPI),

  // ── Quality ──────────────────────────────────────────────────────────────
  widget("sr_reopen_rate", "Re-open Rate", "Share of requests re-opened at least once.", GAUGE, 300),
  widget("sr_cancel_rate", "Cancellation Rate", "Share of requests cancelled after being raised.", GAUGE, 300),
  widget("sr_parent_satisfaction_rate", "Parent Satisfaction", "Share of parent closures marked satisfied.", GAUGE, 300),
  widget("sr_avg_resolution_hrs", "Average Time to Close", "Average hours from raising a request to closing it.", KPI, 300),

  // ── Slices ───────────────────────────────────────────────────────────────
  widget("sr_by_mode_of_contact", "Requests by Mode of Contact", "How requesters got in touch.", SPLIT, 300),
  widget("sr_by_channel", "Requests by Channel", "Which channel each request arrived on.", SPLIT, 300),
  widget("sr_by_category", "Requests by Category", "Top categories by volume.", BARS, 300),
  widget("sr_by_assignee", "Open Requests by Assignee", "Who is carrying the open work.", BARS, 300),

  // ── Call inbox (IVR) ─────────────────────────────────────────────────────
  widget("sr_call_volume", "Call Volume", "Calls into the service request inbox, with trend.", KPI),
  widget("sr_call_answer_rate", "Call Answer Rate", "Share of calls answered rather than missed.", GAUGE, 300),
  widget("sr_call_conversion_rate", "Calls Converted", "Share of calls that became a service request.", GAUGE, 300),
  widget("sr_call_by_status", "Calls by Status", "New, assigned, converted or junk.", SPLIT),
  widget("sr_call_pending_callbacks", "Call-backs Pending", "Open calls with a call-back due, and how many are late.", KPI, 60),
  widget("sr_call_agent_load", "Open Calls by Agent", "Who is carrying the open call-backs.", BARS, 300),
  widget("sr_call_by_ladder_step", "Calls by Call-back Step", "Where open calls sit on the call-back ladder.", SPLIT),
  widget("sr_outbound_call_stats", "Call-backs Made", "Outbound attempts, how many were answered and total talk time.", KPI, 300),

  // ── More slices ──────────────────────────────────────────────────────────
  widget("sr_by_priority", "Requests by Priority", "Volume against each configured priority.", SPLIT, 300),
  widget("sr_by_request_type", "PSR Request Type", "On-call resolution against the full workflow.", SPLIT, 300),
  widget("sr_by_center", "Requests by Centre", "Which centres the requests come from.", BARS, 300),
  widget("sr_by_escalation_level", "Open Requests by Escalation Level", "How far open requests have climbed.", SPLIT, 300),
  widget("sr_escalation_rate", "Escalation Rate", "Share of requests that had to be escalated.", GAUGE, 300),
  widget("sr_avg_first_response_hrs", "Average First Response", "Average wait before the requester hears back.", KPI, 300),

  // ── Email triage queue ───────────────────────────────────────────────────
  widget("sr_email_volume", "Email Intake Volume", "Emails arriving in the triage queue, with trend.", KPI),
  widget("sr_email_overdue_count", "Emails Past TAT", "Emails still open after their triage TAT.", KPI),
  widget("sr_email_by_status", "Email Intake by Status", "Where the queue stands.", SPLIT),
  widget("sr_email_avg_close_hrs", "Average Email Clear Time", "Average time to clear an email from the queue.", KPI, 300),
];
