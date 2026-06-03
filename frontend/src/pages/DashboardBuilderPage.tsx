/**
 * DashboardBuilderPage Ã¢â‚¬â€ fully customisable dashboard editor.
 *
 * Features:
 *  Ã¢â‚¬Â¢ Custom Formula tab Ã¢â‚¬â€ build a ratio metric (numerator ÃƒÂ· denominator)
 *  Ã¢â‚¬Â¢ Display mode per widget: Count | Percentage | Both
 *  Ã¢â‚¬Â¢ Visual chart-type picker with icons
 *  Ã¢â‚¬Â¢ Project selector in top bar
 *  Ã¢â‚¬Â¢ Drag-and-drop resizable grid canvas (react-grid-layout)
 *  Ã¢â‚¬Â¢ Per-widget config drawer (filters, alert thresholds, etc.)
 *
 * Inline styles only Ã¢â‚¬â€ no Tailwind / className utilities.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactGridLayout, { Layout, LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import DashboardLayout from "../components/DashboardLayout";
import { useAdminProjects } from "../hooks/useAdminProjects";
import {
  fetchAllWidgetDefinitions,
  fetchTemplate,
  createTemplate,
  updateTemplate,
  publishTemplate,
  duplicateTemplate,
  exportTemplate,
  importTemplate,
  WidgetDefinitionItem,
  TemplateWidgetSlot,
  DashboardTemplateDetail,
  DashboardSectionSlot,
} from "../services/dashboardBuilderService";

// Each entry maps to a backend widgetKey and describes the metric.

type DataModule =
  | "helpdesk"
  | "attendance"
  | "workforce"
  | "offline_helpdesk"
  | "feedback"
  | "center_ops"
  | "agent_performance"
  | "project"
  | "sla_escalation"
  | "tenant"
  | "ai_analytics"
  | "alerts"
  | "knowledge_base"
  | "users"
  | "activity"
  | "asset_management";

interface DataPoint {
  key: string;
  label: string;
  desc: string;
  module: DataModule;
  unit: "count" | "hours" | "percent" | "list";
  defaultVis: string;
}

const DATA_POINTS: DataPoint[] = [
  // -- Helpdesk Ticketing --

  {
    key: "ht_total_tickets",
    label: "Total Tickets",
    desc: "All tickets ever created",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_open_tickets",
    label: "Open Tickets",
    desc: "Tickets currently open",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_resolved_tickets",
    label: "Resolved Tickets",
    desc: "Tickets marked resolved",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_closed_tickets",
    label: "Closed Tickets",
    desc: "Tickets fully closed",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_pending_tickets",
    label: "Pending Tickets",
    desc: "Tickets awaiting action",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_escalated_tickets",
    label: "Escalated Tickets",
    desc: "Tickets escalated to higher level",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_sla_breached",
    label: "SLA Breached",
    desc: "Tickets that exceeded SLA time",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_resolved_within_sla",
    label: "Resolved Within SLA",
    desc: "Tickets resolved before SLA deadline",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_resolution_rate",
    label: "Resolution Rate",
    desc: "Resolved / Total x 100%",
    module: "helpdesk",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ht_sla_compliance_rate",
    label: "SLA Compliance Rate",
    desc: "Resolved within SLA / Total x 100%",
    module: "helpdesk",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ht_avg_resolution_hours",
    label: "Avg Resolution Time (hrs)",
    desc: "Average hours to close a ticket",
    module: "helpdesk",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_tickets_by_category",
    label: "Tickets by Category",
    desc: "Ticket count grouped by category",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "ht_tickets_by_status",
    label: "Tickets by Status",
    desc: "Ticket count grouped by status",
    module: "helpdesk",
    unit: "list",
    defaultVis: "pie_chart",
  },

  {
    key: "ht_tickets_by_priority",
    label: "Tickets by Priority",
    desc: "Ticket count grouped by priority",
    module: "helpdesk",
    unit: "list",
    defaultVis: "donut_chart",
  },

  {
    key: "ht_daily_trend",
    label: "Daily Ticket Trend",
    desc: "Daily volume of tickets over time",
    module: "helpdesk",
    unit: "list",
    defaultVis: "line_chart",
  },

  {
    key: "ht_agent_workload",
    label: "Agent Workload",
    desc: "Ticket count per agent",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "ht_tickets_heatmap",
    label: "Tickets Heatmap",
    desc: "Volume by day-of-week x hour",
    module: "helpdesk",
    unit: "list",
    defaultVis: "table",
  },

  {
    key: "ht_first_response_time",
    label: "First Response Time (hrs)",
    desc: "Average time to first agent response",
    module: "helpdesk",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "ht_reopen_rate",
    label: "Reopen Rate",
    desc: "Tickets reopened / Total resolved x 100%",
    module: "helpdesk",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ht_tickets_by_project",
    label: "Tickets by Project",
    desc: "Ticket count grouped by project",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "ticket_footfall_count",
    label: "Footfall Count",
    desc: "Unique students who raised tickets + total follow-up responses",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ticket_footfall_trend",
    label: "Footfall Trend",
    desc: "Daily footfall count over the selected period",
    module: "helpdesk",
    unit: "count",
    defaultVis: "line_chart",
  },

  {
    key: "ticket_footfall_by_center",
    label: "Footfall by Centre",
    desc: "Footfall count grouped by centre",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },

  // -- Attendance --

  {
    key: "att_total_checkins",
    label: "Total Check-ins",
    desc: "Total attendance check-ins recorded",
    module: "attendance",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "att_present_today",
    label: "Present Today",
    desc: "Students marked present today",
    module: "attendance",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "att_absent_today",
    label: "Absent Today",
    desc: "Students absent today",
    module: "attendance",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "att_attendance_rate",
    label: "Attendance Rate",
    desc: "Present / Enrolled x 100%",
    module: "attendance",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "att_absenteeism_rate",
    label: "Absenteeism Rate",
    desc: "Absent / Enrolled x 100%",
    module: "attendance",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "att_late_arrivals",
    label: "Late Arrivals",
    desc: "Students who checked in after scheduled time",
    module: "attendance",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "att_daily_trend",
    label: "Attendance Trend",
    desc: "Daily attendance over time",
    module: "attendance",
    unit: "list",
    defaultVis: "line_chart",
  },

  {
    key: "att_by_batch",
    label: "Attendance by Batch",
    desc: "Attendance grouped by batch/class",
    module: "attendance",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "att_by_course",
    label: "Attendance by Course",
    desc: "Attendance grouped by course",
    module: "attendance",
    unit: "list",
    defaultVis: "bar_chart",
  },

  // -- Workforce --

  {
    key: "wf_total_staff",
    label: "Total Staff",
    desc: "Total active staff members",
    module: "workforce",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "wf_staff_present",
    label: "Staff Present Today",
    desc: "Staff checked in today",
    module: "workforce",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "wf_staff_absent",
    label: "Staff Absent Today",
    desc: "Staff absent today",
    module: "workforce",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "wf_staff_on_leave",
    label: "Staff on Leave",
    desc: "Staff with approved leave today",
    module: "workforce",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "wf_staff_attendance_rate",
    label: "Staff Attendance Rate",
    desc: "Present / Total staff x 100%",
    module: "workforce",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "wf_avg_working_hours",
    label: "Avg Working Hours",
    desc: "Average daily working hours per staff",
    module: "workforce",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "wf_staff_by_department",
    label: "Staff by Department",
    desc: "Headcount grouped by department",
    module: "workforce",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "wf_overtime_hours",
    label: "Overtime Hours",
    desc: "Total overtime hours logged",
    module: "workforce",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "wf_leave_utilization",
    label: "Leave Utilization",
    desc: "Leave days taken / Total allowed x 100%",
    module: "workforce",
    unit: "percent",
    defaultVis: "gauge",
  },

  // -- Offline / Field Helpdesk --

  {
    key: "oh_total_visits",
    label: "Total Field Visits",
    desc: "Total offline / field visits logged",
    module: "offline_helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "oh_pending_visits",
    label: "Pending Visits",
    desc: "Field visits not yet completed",
    module: "offline_helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "oh_completed_visits",
    label: "Completed Visits",
    desc: "Field visits marked complete",
    module: "offline_helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "oh_visit_completion_rate",
    label: "Visit Completion Rate",
    desc: "Completed / Total x 100%",
    module: "offline_helpdesk",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "oh_avg_visit_duration",
    label: "Avg Visit Duration (hrs)",
    desc: "Average hours spent per field visit",
    module: "offline_helpdesk",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "oh_visits_by_agent",
    label: "Visits by Agent",
    desc: "Field visits grouped by agent",
    module: "offline_helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "oh_visits_daily_trend",
    label: "Visits Daily Trend",
    desc: "Daily offline visits over time",
    module: "offline_helpdesk",
    unit: "list",
    defaultVis: "line_chart",
  },

  // -- Feedback --

  {
    key: "fb_total_responses",
    label: "Total Responses",
    desc: "Total feedback responses collected",
    module: "feedback",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "fb_avg_rating",
    label: "Avg Rating",
    desc: "Average feedback score",
    module: "feedback",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "fb_csat_score",
    label: "CSAT Score",
    desc: "Customer Satisfaction Score",
    module: "feedback",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "fb_nps_score",
    label: "NPS Score",
    desc: "Net Promoter Score",
    module: "feedback",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "fb_promoters",
    label: "Promoters",
    desc: "Respondents with score 9-10",
    module: "feedback",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "fb_detractors",
    label: "Detractors",
    desc: "Respondents with score 0-6",
    module: "feedback",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "fb_by_category",
    label: "Feedback by Category",
    desc: "Responses grouped by feedback category",
    module: "feedback",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "fb_response_rate",
    label: "Response Rate",
    desc: "Feedback received / Sent x 100%",
    module: "feedback",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "fb_rating_trend",
    label: "Rating Trend",
    desc: "Average rating over time",
    module: "feedback",
    unit: "list",
    defaultVis: "line_chart",
  },

  // -- Center Operations --

  {
    key: "co_total_centers",
    label: "Total Centers",
    desc: "Total active centers",
    module: "center_ops",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "co_active_centers",
    label: "Active Centers",
    desc: "Centers currently operational",
    module: "center_ops",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "co_center_capacity",
    label: "Center Capacity",
    desc: "Total enrolled vs seating capacity",
    module: "center_ops",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "co_capacity_utilization",
    label: "Capacity Utilization",
    desc: "Enrolled / Total capacity x 100%",
    module: "center_ops",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "co_tickets_per_center",
    label: "Tickets per Center",
    desc: "Ticket count grouped by center",
    module: "center_ops",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "co_students_per_center",
    label: "Students per Center",
    desc: "Student headcount per center",
    module: "center_ops",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "co_center_performance",
    label: "Center Performance Index",
    desc: "Composite score per center",
    module: "center_ops",
    unit: "percent",
    defaultVis: "donut_chart",
  },

  // -- Agent Performance --

  {
    key: "ap_total_agents",
    label: "Total Agents",
    desc: "Total active support agents",
    module: "agent_performance",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ap_tickets_handled",
    label: "Tickets Handled",
    desc: "Tickets assigned to agents",
    module: "agent_performance",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ap_avg_handle_time",
    label: "Avg Handle Time (hrs)",
    desc: "Average time per ticket per agent",
    module: "agent_performance",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "ap_resolution_rate",
    label: "Agent Resolution Rate",
    desc: "Resolved / Assigned x 100% per agent",
    module: "agent_performance",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ap_first_contact_res",
    label: "First Contact Resolution",
    desc: "Tickets resolved on first contact %",
    module: "agent_performance",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ap_csat_by_agent",
    label: "CSAT by Agent",
    desc: "Customer satisfaction score per agent",
    module: "agent_performance",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "ap_sla_compliance",
    label: "SLA Compliance by Agent",
    desc: "SLA met % per agent",
    module: "agent_performance",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "ap_leaderboard",
    label: "Agent Leaderboard",
    desc: "Ranking by resolved tickets",
    module: "agent_performance",
    unit: "list",
    defaultVis: "table",
  },

  {
    key: "ap_avg_response_time",
    label: "Avg Response Time (hrs)",
    desc: "Average first response time per agent",
    module: "agent_performance",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  // -- Projects --

  {
    key: "pr_total_projects",
    label: "Total Projects",
    desc: "All projects in the system",
    module: "project",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "pr_active_projects",
    label: "Active Projects",
    desc: "Projects currently in progress",
    module: "project",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "pr_completed_projects",
    label: "Completed Projects",
    desc: "Projects marked complete",
    module: "project",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "pr_overdue_projects",
    label: "Overdue Projects",
    desc: "Projects past their deadline",
    module: "project",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "pr_completion_rate",
    label: "Project Completion Rate",
    desc: "Completed / Total x 100%",
    module: "project",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "pr_tickets_per_project",
    label: "Tickets per Project",
    desc: "Ticket count grouped by project",
    module: "project",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "pr_project_health",
    label: "Project Health",
    desc: "On-time vs delayed project distribution",
    module: "project",
    unit: "list",
    defaultVis: "pie_chart",
  },

  {
    key: "pr_milestones_met",
    label: "Milestones Met",
    desc: "Milestones completed on time",
    module: "project",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  // -- SLA & Escalation --

  {
    key: "se_active_sla_policies",
    label: "Active SLA Policies",
    desc: "Total SLA policies configured",
    module: "sla_escalation",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "se_sla_breached_count",
    label: "SLA Breaches",
    desc: "Total SLA breaches this period",
    module: "sla_escalation",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "se_sla_compliance_rate",
    label: "SLA Compliance Rate",
    desc: "Tickets within SLA / Total x 100%",
    module: "sla_escalation",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "se_escalations_raised",
    label: "Escalations Raised",
    desc: "Total escalations triggered",
    module: "sla_escalation",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "se_escalations_resolved",
    label: "Escalations Resolved",
    desc: "Escalations that were resolved",
    module: "sla_escalation",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "se_escalation_rate",
    label: "Escalation Rate",
    desc: "Escalated / Total tickets x 100%",
    module: "sla_escalation",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "se_avg_escalation_time",
    label: "Avg Escalation Time (hrs)",
    desc: "Avg time before ticket is escalated",
    module: "sla_escalation",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "se_breach_by_priority",
    label: "Breaches by Priority",
    desc: "SLA breaches grouped by priority",
    module: "sla_escalation",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "se_breach_trend",
    label: "SLA Breach Trend",
    desc: "Daily SLA breaches over time",
    module: "sla_escalation",
    unit: "list",
    defaultVis: "line_chart",
  },

  // -- Tenant --

  {
    key: "tn_total_tenants",
    label: "Total Tenants",
    desc: "Total registered tenants",
    module: "tenant",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "tn_active_tenants",
    label: "Active Tenants",
    desc: "Tenants currently active",
    module: "tenant",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "tn_tickets_per_tenant",
    label: "Tickets per Tenant",
    desc: "Ticket volume grouped by tenant",
    module: "tenant",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "tn_students_per_tenant",
    label: "Students per Tenant",
    desc: "Student count per tenant",
    module: "tenant",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "tn_csat_by_tenant",
    label: "CSAT by Tenant",
    desc: "Satisfaction score per tenant",
    module: "tenant",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "tn_sla_compliance_tenant",
    label: "SLA Compliance by Tenant",
    desc: "SLA compliance rate per tenant",
    module: "tenant",
    unit: "list",
    defaultVis: "table",
  },

  {
    key: "tn_tenant_health_index",
    label: "Tenant Health Index",
    desc: "Composite health score per tenant",
    module: "tenant",
    unit: "list",
    defaultVis: "table",
  },

  // -- AI & Analytics --

  {
    key: "ai_predicted_volume",
    label: "Predicted Ticket Volume",
    desc: "AI-predicted tickets for next period",
    module: "ai_analytics",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ai_anomalies_detected",
    label: "Anomalies Detected",
    desc: "Unusual patterns flagged by AI",
    module: "ai_analytics",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "ai_sentiment_positive",
    label: "Positive Sentiment",
    desc: "Tickets with positive language % ",
    module: "ai_analytics",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ai_sentiment_negative",
    label: "Negative Sentiment",
    desc: "Tickets with negative language %",
    module: "ai_analytics",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ai_category_accuracy",
    label: "Category Auto-tag Accuracy",
    desc: "Correct auto-categorization rate",
    module: "ai_analytics",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ai_kb_deflection_rate",
    label: "KB Deflection Rate",
    desc: "Tickets resolved via KB / Total x 100%",
    module: "ai_analytics",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "ai_top_issues",
    label: "Top Issue Clusters",
    desc: "Most common ticket topics from NLP",
    module: "ai_analytics",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "ai_resolution_prediction",
    label: "Resolution Time Forecast",
    desc: "AI-forecasted resolution time per category",
    module: "ai_analytics",
    unit: "list",
    defaultVis: "table",
  },

  // -- Alerts --

  {
    key: "al_active_alerts",
    label: "Active Alerts",
    desc: "Currently firing system alerts",
    module: "alerts",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "al_resolved_alerts",
    label: "Resolved Alerts",
    desc: "Alerts resolved this period",
    module: "alerts",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "al_critical_alerts",
    label: "Critical Alerts",
    desc: "High severity alerts",
    module: "alerts",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  {
    key: "al_alert_resolution_rate",
    label: "Alert Resolution Rate",
    desc: "Resolved / Total alerts x 100%",
    module: "alerts",
    unit: "percent",
    defaultVis: "gauge",
  },

  {
    key: "al_avg_alert_response",
    label: "Avg Alert Response (hrs)",
    desc: "Average time to acknowledge an alert",
    module: "alerts",
    unit: "hours",
    defaultVis: "kpi_tile",
  },

  {
    key: "al_alerts_by_type",
    label: "Alerts by Type",
    desc: "Alert count grouped by type",
    module: "alerts",
    unit: "list",
    defaultVis: "bar_chart",
  },

  {
    key: "al_alert_trend",
    label: "Alert Trend",
    desc: "Daily alert volume over time",
    module: "alerts",
    unit: "list",
    defaultVis: "line_chart",
  },

  // â”€â”€ Phase 1â€“2 Core Ticketing (catalogue keys) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    key: "ticket_open_count",
    label: "Open Tickets",
    desc: "Tickets currently open",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_by_status",
    label: "Tickets by Status",
    desc: "Ticket count grouped by status",
    module: "helpdesk",
    unit: "list",
    defaultVis: "donut_chart",
  },
  {
    key: "ticket_sla_resolution_rate",
    label: "SLA Resolution Rate",
    desc: "Resolved within SLA / Total Ã— 100%",
    module: "helpdesk",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "ticket_avg_first_response",
    label: "Avg First Response (hrs)",
    desc: "Average time to first reply",
    module: "helpdesk",
    unit: "hours",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_avg_resolution_time",
    label: "Avg Resolution Time (hrs)",
    desc: "Average time to close a ticket",
    module: "helpdesk",
    unit: "hours",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_inflow_today",
    label: "Inflow Today",
    desc: "Tickets received today",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_closed_today",
    label: "Closed Today",
    desc: "Tickets closed today",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_escalation_count",
    label: "Escalated Tickets",
    desc: "Total escalated tickets in period",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_escalated_this_period",
    label: "Escalated This Period",
    desc: "New escalations in selected date range",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "my_assigned_tickets",
    label: "My Assigned Tickets",
    desc: "Tickets assigned to the current user",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_by_priority",
    label: "Tickets by Priority",
    desc: "Ticket count grouped by priority",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "ticket_by_category",
    label: "Tickets by Category",
    desc: "Ticket count grouped by category",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "ticket_volume_trend",
    label: "Volume Trend",
    desc: "Daily ticket creation over time",
    module: "helpdesk",
    unit: "list",
    defaultVis: "line_chart",
  },
  {
    key: "ticket_first_response_time",
    label: "First Response Time",
    desc: "Response time distribution",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "ticket_resolution_rate",
    label: "Resolution Rate",
    desc: "Resolved / Total tickets Ã— 100%",
    module: "helpdesk",
    unit: "percent",
    defaultVis: "gauge",
  },

  // â”€â”€ Phase 5 Ticketing Extras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    key: "ticket_inprogress_count",
    label: "In-Progress Tickets",
    desc: "Tickets currently in progress",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_resolved_count",
    label: "Resolved Tickets",
    desc: "Tickets resolved in period",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_onhold_count",
    label: "On-Hold Tickets",
    desc: "Tickets currently on hold",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "ticket_by_submission_source",
    label: "By Submission Source",
    desc: "Tickets grouped by how they were submitted",
    module: "helpdesk",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "ticket_recent_list",
    label: "Recent Tickets",
    desc: "Latest tickets created",
    module: "helpdesk",
    unit: "list",
    defaultVis: "table",
  },
  {
    key: "ticket_comment_count",
    label: "Comment Count",
    desc: "Total comments across tickets in period",
    module: "helpdesk",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  // â”€â”€ Phase 5 User Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    key: "user_total_count",
    label: "Total Users",
    desc: "All registered users in project",
    module: "users",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "user_new_registrations",
    label: "New Registrations",
    desc: "Users registered in selected period",
    module: "users",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "user_by_registration_source",
    label: "By Registration Source",
    desc: "Users grouped by how they registered",
    module: "users",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "user_never_logged_in",
    label: "Never Logged In",
    desc: "Users who have never logged in",
    module: "users",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "user_by_department",
    label: "Users by Department",
    desc: "User count grouped by department",
    module: "users",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "user_eula_acceptance_rate",
    label: "EULA Acceptance Rate",
    desc: "% of users who accepted the EULA",
    module: "users",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "user_password_setup_pending",
    label: "Password Setup Pending",
    desc: "Users who haven't set a password yet",
    module: "users",
    unit: "count",
    defaultVis: "kpi_tile",
  },

  // â”€â”€ Knowledge Base â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    key: "kb_total_articles",
    label: "Total KB Articles",
    desc: "All knowledge base articles",
    module: "knowledge_base",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "kb_published_count",
    label: "Published Articles",
    desc: "Articles currently published",
    module: "knowledge_base",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "kb_draft_count",
    label: "Draft Articles",
    desc: "Articles in draft state",
    module: "knowledge_base",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "kb_archived_count",
    label: "Archived Articles",
    desc: "Articles that have been archived",
    module: "knowledge_base",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "kb_top_viewed",
    label: "Top Viewed Articles",
    desc: "Most viewed KB articles in period",
    module: "knowledge_base",
    unit: "list",
    defaultVis: "table",
  },
  {
    key: "kb_helpfulness_rate",
    label: "KB Helpfulness Rate",
    desc: "% of articles rated helpful",
    module: "knowledge_base",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "kb_recent_updates",
    label: "Recent KB Updates",
    desc: "Recently updated articles",
    module: "knowledge_base",
    unit: "list",
    defaultVis: "table",
  },
  {
    key: "kb_by_category",
    label: "KB by Category",
    desc: "Article count grouped by category",
    module: "knowledge_base",
    unit: "list",
    defaultVis: "bar_chart",
  },

  // â”€â”€ Activity / Security / Email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    key: "activity_feed",
    label: "Activity Feed",
    desc: "Recent system activity events",
    module: "activity",
    unit: "list",
    defaultVis: "table",
  },
  {
    key: "login_failure_count",
    label: "Login Failures",
    desc: "Failed login attempts in period",
    module: "activity",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "active_session_count",
    label: "Active Sessions",
    desc: "Currently active user sessions",
    module: "activity",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "email_sent_count",
    label: "Emails Sent",
    desc: "Total emails sent in period",
    module: "activity",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "email_failure_rate",
    label: "Email Failure Rate",
    desc: "Failed emails / Total sent Ã— 100%",
    module: "activity",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "email_by_type",
    label: "Email by Type",
    desc: "Email volume grouped by type",
    module: "activity",
    unit: "list",
    defaultVis: "bar_chart",
  },

  // -- Asset Management --

  {
    key: "am_total_asset_types",
    label: "Total Asset Types",
    desc: "Number of distinct asset types defined for this project",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_total_required",
    label: "Total Required (Predefined)",
    desc: "Sum of predefined / expected quantities across all asset types",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_total_assigned",
    label: "Total Assigned",
    desc: "Sum of assets actually assigned across all centers",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_required_vs_assigned",
    label: "Required vs Assigned Gap",
    desc: "Difference between required and assigned asset quantities",
    module: "asset_management",
    unit: "count",
    defaultVis: "bar_chart",
  },
  {
    key: "am_working_assets",
    label: "Working Assets",
    desc: "Total units currently in working condition across all centers",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_non_working_assets",
    label: "Non-Working Assets",
    desc: "Total units currently not in working condition",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_asset_health_rate",
    label: "Asset Health Rate",
    desc: "Working / (Working + Non-Working) × 100%",
    module: "asset_management",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "am_utilization_rate",
    label: "Asset Utilization Rate",
    desc: "Assets in use / Total assigned × 100%",
    module: "asset_management",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "am_audits_submitted",
    label: "Audits Submitted",
    desc: "Center-asset mappings with audit submitted in current cycle",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_audits_pending",
    label: "Audits Pending",
    desc: "Center-asset mappings with audit not yet submitted",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_audit_compliance_rate",
    label: "Audit Compliance Rate",
    desc: "Submitted audits / Total audits due × 100%",
    module: "asset_management",
    unit: "percent",
    defaultVis: "gauge",
  },
  {
    key: "am_assets_overdue_audit",
    label: "Overdue Audits",
    desc: "Mappings where next audit date is past and audit not submitted",
    module: "asset_management",
    unit: "count",
    defaultVis: "kpi_tile",
  },
  {
    key: "am_by_category",
    label: "Assets by Category",
    desc: "Working vs non-working breakdown per asset category",
    module: "asset_management",
    unit: "list",
    defaultVis: "bar_chart",
  },
  {
    key: "am_by_center",
    label: "Assets by Center",
    desc: "Per-center: assigned, working, non-working, health rate, audit rate",
    module: "asset_management",
    unit: "list",
    defaultVis: "table",
  },
  {
    key: "am_audit_activity_trend",
    label: "Audit Activity Trend",
    desc: "Daily asset audit changes (working updates, fault reports) over time",
    module: "asset_management",
    unit: "list",
    defaultVis: "line_chart",
  },
];

// Metrics that can be used as numerator/denominator in a custom formula
const FORMULA_METRICS = DATA_POINTS.filter(
  (d) => d.unit === "count" || d.unit === "percent",
);

// Default formula example: Resolution Rate
const DEFAULT_NUMERATOR_KEY = "ht_resolved_tickets";
const DEFAULT_DENOMINATOR_KEY = "ht_total_tickets";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Visualisation Types Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface VisType {
  value: string;
  label: string;
  icon: string;
  desc: string;
  forUnits?: DataPoint["unit"][];
}

const VIS_TYPES: VisType[] = [
  {
    value: "kpi_tile",
    label: "KPI Card",
    icon: "#",
    desc: "Large number + trend",
    forUnits: ["count", "hours", "percent"],
  },
  {
    value: "sparkline",
    label: "Sparkline",
    icon: "~",
    desc: "KPI + mini trend line",
    forUnits: ["count", "hours", "percent"],
  },
  {
    value: "gauge",
    label: "Gauge",
    icon: "O",
    desc: "Semicircle gauge 0-100%",
    forUnits: ["percent"],
  },
  {
    value: "progress_bar",
    label: "Progress",
    icon: "=",
    desc: "Horizontal bar fill",
    forUnits: ["percent", "count"],
  },
  {
    value: "bar_chart",
    label: "Bar Chart",
    icon: "||",
    desc: "Vertical / horizontal bars",
    forUnits: ["list", "count"],
  },
  {
    value: "line_chart",
    label: "Line Chart",
    icon: "/\\",
    desc: "Trend over time",
    forUnits: ["list", "count"],
  },
  {
    value: "pie_chart",
    label: "Pie Chart",
    icon: "O",
    desc: "Proportional slices",
    forUnits: ["list", "count"],
  },
  {
    value: "donut_chart",
    label: "Donut",
    icon: "o",
    desc: "Pie with centre text",
    forUnits: ["list", "count"],
  },
  {
    value: "table",
    label: "Table",
    icon: "[]",
    desc: "Sortable data table",
    forUnits: ["list"],
  },
];

const MODULE_META: Record<
  DataModule,
  { label: string; icon: string; color: string }
> = {
  helpdesk: { label: "Helpdesk", icon: "#", color: "#3b82f6" },
  attendance: { label: "Attendance", icon: "cal", color: "#10b981" },
  workforce: { label: "Workforce", icon: "wrk", color: "#f59e0b" },
  offline_helpdesk: { label: "Offline / Field", icon: "ofd", color: "#ef4444" },
  feedback: { label: "Feedback", icon: "*", color: "#8b5cf6" },
  center_ops: { label: "Center Ops", icon: "ctr", color: "#06b6d4" },
  agent_performance: {
    label: "Agent Performance",
    icon: "agt",
    color: "#ec4899",
  },
  project: { label: "Projects", icon: "prj", color: "#f97316" },
  sla_escalation: { label: "SLA & Escalation", icon: "sla", color: "#dc2626" },
  tenant: { label: "Tenant", icon: "tnt", color: "#7c3aed" },
  ai_analytics: { label: "AI & Analytics", icon: "ai", color: "#0ea5e9" },
  alerts: { label: "Alerts", icon: "!", color: "#b45309" },
  knowledge_base: { label: "Knowledge Base", icon: "kb", color: "#16a34a" },
  users: { label: "Users", icon: "usr", color: "#9333ea" },
  activity: { label: "Activity", icon: "act", color: "#ca8a04" },
  asset_management: {
    label: "Asset Management",
    icon: "ast",
    color: "#0d9488",
  },
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Context variable helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const CTX_VARS = [
  {
    label: "@ctx.userId",
    description: "Current user ID",
    suggestedKey: "assignedTo",
  },
  {
    label: "@ctx.email",
    description: "Current user email",
    suggestedKey: "email",
  },
  {
    label: "@ctx.centreId",
    description: "User's centre ID",
    suggestedKey: "centreId",
  },
  {
    label: "@ctx.districtId",
    description: "User's district ID",
    suggestedKey: "districtId",
  },
  {
    label: "@ctx.roleCode",
    description: "User's role code",
    suggestedKey: "roleCode",
  },
  {
    label: "@ctx.projectIds",
    description: "User's project IDs (array)",
    suggestedKey: "projectIds",
  },
  {
    label: "@ctx.primaryProjectId",
    description: "User's primary project ID",
    suggestedKey: "project",
  },
];

/** Pre-built filter combinations with correct key names for common use-cases */
const FILTER_PRESETS = [
  {
    label: "My Assigned Tickets",
    desc: "Tickets assigned to the logged-in user",
    filters: { assignedTo: "@ctx.userId" },
  },
  {
    label: "Tickets I Created",
    desc: "Tickets submitted by the logged-in user",
    filters: { createdBy: "@ctx.userId" },
  },
  {
    label: "My Centre",
    desc: "Tickets from the user's centre",
    filters: { centreId: "@ctx.centreId" },
  },
  {
    label: "Assigned + My Centre",
    desc: "My assigned tickets within my centre",
    filters: { assignedTo: "@ctx.userId", centreId: "@ctx.centreId" },
  },
  {
    label: "Assigned + My Project",
    desc: "My assigned tickets within my primary project",
    filters: { assignedTo: "@ctx.userId", project: "@ctx.primaryProjectId" },
  },
  {
    label: "Assigned + All My Projects",
    desc: "My assigned tickets across all my projects",
    filters: { assignedTo: "@ctx.userId", projectIds: "@ctx.projectIds" },
  },
  {
    label: "My District",
    desc: "Tickets from the user's district",
    filters: { districtId: "@ctx.districtId" },
  },
  {
    label: "All (no filter)",
    desc: "Clear all filters â€” show everything in scope",
    filters: {},
  },
];

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Types Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/** Extra fields stored inside widget.config for builder-only settings */
interface WidgetBuildConfig {
  displayMode?: "count" | "percent" | "both";
  formula?: {
    type: "ratio";
    numeratorKey: string;
    denominatorKey: string;
    multiplyBy?: number; // default 100 for percent
    label?: string;
  };
  filters?: Record<string, any>;
  alertThreshold?: {
    operator?: string;
    value?: number;
    notifyRoleCode?: string;
    message?: string;
    cooldownMinutes?: number;
  };
  [k: string]: any;
}

interface CanvasWidget extends TemplateWidgetSlot {
  /** transient key used only by react-grid-layout */
  layoutKey: string;
  widgetDefinitionItem?: WidgetDefinitionItem;
  dataPoint?: DataPoint;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Utilities Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function groupByModule_DataPoints(
  dps: DataPoint[],
): Record<string, DataPoint[]> {
  return dps.reduce(
    (acc, d) => {
      (acc[d.module] ??= []).push(d);
      return acc;
    },
    {} as Record<string, DataPoint[]>,
  );
}

function groupByModule(
  defs: WidgetDefinitionItem[],
): Record<string, WidgetDefinitionItem[]> {
  return defs.reduce(
    (acc, d) => {
      const m = d.module ?? "other";
      (acc[m] ??= []).push(d);
      return acc;
    },
    {} as Record<string, WidgetDefinitionItem[]>,
  );
}

function nextAvailablePosition(existing: CanvasWidget[]): {
  x: number;
  y: number;
} {
  if (existing.length === 0) return { x: 0, y: 0 };
  const maxRow = Math.max(...existing.map((w) => w.gridRow + w.gridHeight));
  return { x: 0, y: maxRow };
}

function getVisIcon(v: string) {
  return VIS_TYPES.find((t) => t.value === v)?.icon ?? "?";
}

function getDataPoint(key: string): DataPoint | undefined {
  return DATA_POINTS.find((d) => d.key === key);
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ VisTypePicker Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function VisTypePicker({
  value,
  onChange,
  unitHint,
  allowedTypes,
}: {
  value: string;
  onChange: (v: string) => void;
  unitHint?: DataPoint["unit"];
  /** When provided, only these vis types are selectable; others are hidden */
  allowedTypes?: string[];
}) {
  const visTypes = allowedTypes
    ? VIS_TYPES.filter((vt) => allowedTypes.includes(vt.value))
    : VIS_TYPES;
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}
    >
      {visTypes.map((vt) => {
        const relevant =
          !unitHint || !vt.forUnits || vt.forUnits.includes(unitHint);
        const selected = value === vt.value;
        return (
          <button
            key={vt.value}
            title={vt.desc}
            onClick={() => onChange(vt.value)}
            style={{
              padding: "6px 4px",
              fontSize: 11,
              textAlign: "center",
              background: selected ? "#ede9fe" : "#f9fafb",
              border: `1.5px solid ${selected ? "#7c3aed" : "#e5e7eb"}`,
              borderRadius: 7,
              cursor: "pointer",
              color: selected ? "#7c3aed" : relevant ? "#374151" : "#d1d5db",
              fontWeight: selected ? 700 : 400,
              transition: "all 0.12s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 16 }}>{vt.icon}</span>
            <span style={{ fontSize: 9, lineHeight: 1.2 }}>{vt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DisplayModePicker Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function DisplayModePicker({
  value,
  onChange,
}: {
  value: "count" | "percent" | "both";
  onChange: (v: "count" | "percent" | "both") => void;
}) {
  const opts: {
    v: "count" | "percent" | "both";
    label: string;
    icon: string;
  }[] = [
    { v: "count", label: "Count", icon: "#" },
    { v: "percent", label: "Percent", icon: "%" },
    { v: "both", label: "Both", icon: "#%" },
  ];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            flex: 1,
            padding: "5px 0",
            fontSize: 11,
            fontWeight: value === o.v ? 700 : 400,
            background: value === o.v ? "#dbeafe" : "#f9fafb",
            border: `1.5px solid ${value === o.v ? "#2563eb" : "#e5e7eb"}`,
            borderRadius: 6,
            cursor: "pointer",
            color: value === o.v ? "#2563eb" : "#6b7280",
          }}
        >
          <div style={{ fontSize: 14 }}>{o.icon}</div>
          <div style={{ fontSize: 9, marginTop: 1 }}>{o.label}</div>
        </button>
      ))}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DataPointCard Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function DataPointCard({
  dp,
  onAdd,
}: {
  dp: DataPoint;
  onAdd: (dp: DataPoint) => void;
}) {
  const src = MODULE_META[dp.module];
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("dataPointKey", dp.key)}
      onClick={() => onAdd(dp)}
      style={{
        background: "#FEF7FF",
        border: "1px solid #E8DEF8",
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "grab",
        transition: "border-color 0.15s, box-shadow 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#6750A4";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 2px 10px rgba(103,80,164,0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#E8DEF8";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 6,
          marginBottom: 3,
        }}
      >
        <span
          style={{ fontSize: 12, fontWeight: 700, color: "#1D1B20", flex: 1 }}
        >
          {dp.unit === "count" ? "# " : dp.unit === "percent" ? "% " : ""}
          {dp.label}
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 6,
            background:
              dp.unit === "count"
                ? "#EADDFF"
                : dp.unit === "percent"
                  ? "#dbeafe"
                  : src.color + "18",
            color:
              dp.unit === "count"
                ? "#21005D"
                : dp.unit === "percent"
                  ? "#1d4ed8"
                  : src.color,
            fontWeight: 700,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {dp.unit}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#79747E", lineHeight: 1.4 }}>
        {dp.desc}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CustomFormulaPanel Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function CustomFormulaPanel({
  onAdd,
}: {
  onAdd: (w: Partial<CanvasWidget>) => void;
}) {
  const [title, setTitle] = useState("Custom Metric");
  const [numKey, setNumKey] = useState(DEFAULT_NUMERATOR_KEY);
  const [denKey, setDenKey] = useState(DEFAULT_DENOMINATOR_KEY);
  const [multiply, setMultiply] = useState(100);
  const [visType, setVisType] = useState("kpi_tile");
  const [displayMode, setDisplayMode] = useState<"count" | "percent" | "both">(
    "percent",
  );

  const numDp = FORMULA_METRICS.find((d) => d.key === numKey);
  const denDp = FORMULA_METRICS.find((d) => d.key === denKey);

  const preview =
    numDp && denDp
      ? `${numDp.label} / ${denDp.label}${multiply === 100 ? " x 100%" : ""}`
      : "-";

  const handleAdd = () => {
    if (!numKey || !denKey) return;
    onAdd({
      widgetKey: "custom_ratio",
      displayName: title,
      visualisationType: visType,
      gridWidth: 3,
      gridHeight: 2,
      config: {
        displayMode,
        formula: {
          type: "ratio",
          numeratorKey: numKey,
          denominatorKey: denKey,
          multiplyBy: multiply,
          label: title,
        },
      },
    });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <div
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          background: "#faf5ff",
          border: "1px solid #e9d5ff",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 11,
          color: "#7c3aed",
          lineHeight: 1.5,
        }}
      >
        Build a <strong>ratio metric</strong> by dividing two data points.
        <br />
        Example:{" "}
        <em>Resolution Rate = Resolved Within SLA / Open Tickets x 100</em>
      </div>

      <div>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#6b7280",
            display: "block",
            marginBottom: 3,
          }}
        >
          CARD TITLE
        </label>
        <input
          style={inputStyle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#6b7280",
            display: "block",
            marginBottom: 3,
          }}
        >
          NUMERATOR (top)
        </label>
        <select
          style={inputStyle}
          value={numKey}
          onChange={(e) => setNumKey(e.target.value)}
        >
          {FORMULA_METRICS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          textAlign: "center",
          fontSize: 18,
          color: "#9ca3af",
          margin: "-4px 0",
        }}
      >
        /
      </div>

      <div>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#6b7280",
            display: "block",
            marginBottom: 3,
          }}
        >
          DENOMINATOR (bottom)
        </label>
        <select
          style={inputStyle}
          value={denKey}
          onChange={(e) => setDenKey(e.target.value)}
        >
          {FORMULA_METRICS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#6b7280",
            display: "block",
            marginBottom: 3,
          }}
        >
          MULTIPLY RESULT BY
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 100].map((v) => (
            <button
              key={v}
              onClick={() => setMultiply(v)}
              style={{
                flex: 1,
                padding: "5px",
                fontSize: 12,
                background: multiply === v ? "#dbeafe" : "#f9fafb",
                border: `1.5px solid ${multiply === v ? "#2563eb" : "#e5e7eb"}`,
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: multiply === v ? 700 : 400,
                color: multiply === v ? "#2563eb" : "#374151",
              }}
            >
              {v === 100 ? "x 100 -> %" : "x 1 -> ratio"}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 7,
          padding: "8px 10px",
          fontSize: 11,
          color: "#166534",
        }}
      >
        <strong>Formula preview:</strong>
        <br />
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{preview}</span>
      </div>

      <div>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#6b7280",
            display: "block",
            marginBottom: 6,
          }}
        >
          CHART TYPE
        </label>
        <VisTypePicker
          value={visType}
          onChange={setVisType}
          unitHint="percent"
        />
      </div>

      <div>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#6b7280",
            display: "block",
            marginBottom: 6,
          }}
        >
          DISPLAY MODE
        </label>
        <DisplayModePicker value={displayMode} onChange={setDisplayMode} />
      </div>

      <button
        onClick={handleAdd}
        style={{
          padding: "8px",
          fontSize: 13,
          fontWeight: 700,
          background: "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 7,
          cursor: "pointer",
          marginTop: 4,
        }}
      >
        + Add to Dashboard
      </button>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ LibraryCard (pre-built widget from catalog) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const VIS_COLORS: Record<string, string> = {
  kpi_tile: "#6366f1",
  donut_chart: "#f59e0b",
  bar_chart: "#3b82f6",
  line_chart: "#22c55e",
  progress_bar: "#ec4899",
  gauge: "#06b6d4",
  table: "#8b5cf6",
};

function VisTag({ vis }: { vis: string }) {
  const color = VIS_COLORS[vis] ?? "#9ca3af";
  return (
    <span
      style={{
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 20,
        background: color + "1a",
        color,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {vis.replace(/_/g, " ")}
    </span>
  );
}

function LibraryCard({
  def,
  onAdd,
}: {
  def: WidgetDefinitionItem;
  onAdd: (def: WidgetDefinitionItem) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("widgetKey", def.widgetKey)}
      onClick={() => onAdd(def)}
      style={{
        background: "#FEF7FF",
        border: "1px solid #E8DEF8",
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "grab",
        transition: "border-color 0.15s, box-shadow 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#6750A4";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 2px 10px rgba(103,80,164,0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#E8DEF8";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#1D1B20",
          marginBottom: 3,
        }}
      >
        {def.displayName}
      </div>
      {def.description && (
        <div
          style={{
            fontSize: 11,
            color: "#79747E",
            marginBottom: 6,
            lineHeight: 1.4,
          }}
        >
          {def.description}
        </div>
      )}
      <VisTag vis={def.defaultVisualisation} />
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Config Drawer Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface ConfigDrawerProps {
  widget: CanvasWidget;
  sections: DashboardSectionSlot[];
  onUpdate: (key: string, updated: Partial<CanvasWidget>) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
  /** Project currently scoped in the builder — used to filter the roles list */
  projectId?: string;
}

function ConfigDrawer({
  widget,
  sections,
  onUpdate,
  onRemove,
  onClose,
  projectId,
}: ConfigDrawerProps) {
  const def = widget.widgetDefinitionItem;
  const dp = widget.dataPoint ?? getDataPoint(widget.widgetKey);
  const cfg: WidgetBuildConfig = widget.config ?? {};

  // All VIS_TYPES shown; recommend unit-matching ones
  const allVisTypes = VIS_TYPES;

  // Determine supported vis list
  const supportedVis: string[] = def
    ? def.supportedVisualisations
    : allVisTypes.map((v) => v.value);

  const [filterText, setFilterText] = useState(
    JSON.stringify(cfg.filters ?? {}, null, 2),
  );
  const [filterError, setFilterError] = useState<string | null>(null);
  const [ctxKey, setCtxKey] = useState("");

  const patchConfig = (patch: Partial<WidgetBuildConfig>) => {
    onUpdate(widget.layoutKey, { config: { ...cfg, ...patch } });
  };

  const applyFilters = (text = filterText) => {
    try {
      const parsed = JSON.parse(text);
      patchConfig({ filters: parsed });
      setFilterError(null);
    } catch {
      setFilterError("Invalid JSON");
    }
  };

  const handleFilterTextChange = (value: string) => {
    setFilterText(value);
    // Auto-apply immediately when JSON is valid so filters are always
    // reflected in widget state before saving/publishing
    try {
      const parsed = JSON.parse(value);
      patchConfig({ filters: parsed });
      setFilterError(null);
    } catch {
      setFilterError("Invalid JSON â€” fix before saving");
    }
  };

  const insertCtxVar = (varLabel: string) => {
    const key = ctxKey.trim();
    if (!key) return;
    setFilterText((t) => {
      try {
        const parsed = JSON.parse(t);
        const next = JSON.stringify({ ...parsed, [key]: varLabel }, null, 2);
        // Auto-apply the updated filters
        patchConfig({ filters: { ...parsed, [key]: varLabel } });
        setFilterError(null);
        return next;
      } catch {
        return t;
      }
    });
    setCtxKey("");
  };

  const USER_ROLE_WIDGET_KEYS = [
    "user_by_role",
    "user_active_count",
    "user_inactive_count",
    "user_required_vs_onboarded",
    "user_onboarding_completion_rate",
    "attendance_today_rate",
    "attendance_mtd_rate",
  ];
  const isUserWidget = USER_ROLE_WIDGET_KEYS.includes(widget.widgetKey);

  // Fetch available roles (only for user-related widgets)
  const { data: rolesData } = useQuery(
    ["roles", projectId],
    async () => {
      const { API_CONFIG } = await import("../config/constants");
      const token = localStorage.getItem("authToken");
      const qs = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`${API_CONFIG.API_URL}/roles${qs}`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to fetch roles");
      const body = await res.json();
      return (body.data ?? []) as {
        _id: string;
        name: string;
        displayName?: string;
      }[];
    },
    { enabled: isUserWidget, staleTime: 5 * 60_000 },
  );
  const availableRoles = rolesData ?? [];

  const isFormulaWidget = widget.widgetKey === "custom_ratio";
  const isPercentCapable =
    isFormulaWidget || (dp && (dp.unit === "percent" || dp.unit === "count"));

  const section = (label: string, children: React.ReactNode) => (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#6b7280",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <div
      style={{
        width: 286,
        flexShrink: 0,
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#fafafa",
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
            Widget Config
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
            {widget.widgetKey}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: "#9ca3af",
          }}
        >
          x
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Display title */}
        {section(
          "Display Title",
          <input
            style={inputStyle}
            value={widget.displayName}
            onChange={(e) =>
              onUpdate(widget.layoutKey, { displayName: e.target.value })
            }
          />,
        )}

        {/* Section assignment */}
        {sections.length > 0 &&
          section(
            "Section",
            <select
              style={inputStyle}
              value={widget.sectionId ?? ""}
              onChange={(e) =>
                onUpdate(widget.layoutKey, {
                  sectionId: e.target.value || null,
                })
              }
            >
              <option value="">-- No Section --</option>
              {sections.map((s) => (
                <option key={s._id ?? s.name} value={s._id ?? s.name}>
                  {s.name}
                </option>
              ))}
            </select>,
          )}

        {/* Chart / Visualisation type */}
        {section(
          "Chart Type",
          <VisTypePicker
            value={widget.visualisationType}
            onChange={(v) =>
              onUpdate(widget.layoutKey, { visualisationType: v })
            }
            unitHint={dp?.unit}
            allowedTypes={def ? def.supportedVisualisations : undefined}
          />,
        )}

        {/* Display mode Ã¢â‚¬â€ count / percent / both */}
        {isPercentCapable &&
          section(
            "Display Mode",
            <DisplayModePicker
              value={(cfg.displayMode as any) ?? "count"}
              onChange={(v) => patchConfig({ displayMode: v })}
            />,
          )}

        {/* Formula details Ã¢â‚¬â€ read-only summary for custom_ratio */}
        {isFormulaWidget &&
          cfg.formula &&
          section(
            "Formula",
            <div
              style={{
                background: "#faf5ff",
                border: "1px solid #e9d5ff",
                borderRadius: 7,
                padding: "8px 10px",
                fontSize: 11,
                color: "#6d28d9",
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong>Numerator:</strong>{" "}
                {DATA_POINTS.find((d) => d.key === cfg.formula?.numeratorKey)
                  ?.label ?? cfg.formula.numeratorKey}
              </div>
              <div>
                <strong>Denominator:</strong>{" "}
                {DATA_POINTS.find((d) => d.key === cfg.formula?.denominatorKey)
                  ?.label ?? cfg.formula.denominatorKey}
              </div>
              <div>
                <strong>Multiply:</strong> x {cfg.formula.multiplyBy ?? 100}
              </div>
            </div>,
          )}

        {/* Grid sizing */}
        {section(
          "Grid Size",
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  display: "block",
                  marginBottom: 3,
                }}
              >
                WIDTH (cols 1-12)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={widget.gridWidth}
                onChange={(e) =>
                  onUpdate(widget.layoutKey, {
                    gridWidth: Number(e.target.value),
                  })
                }
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  display: "block",
                  marginBottom: 3,
                }}
              >
                HEIGHT (rows 1-6)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={widget.gridHeight}
                onChange={(e) =>
                  onUpdate(widget.layoutKey, {
                    gridHeight: Number(e.target.value),
                  })
                }
                style={inputStyle}
              />
            </div>
          </div>,
        )}

        {/* Required User Count — for onboarding target widgets */}
        {(widget.widgetKey === "user_required_vs_onboarded" ||
          widget.widgetKey === "user_onboarding_completion_rate") &&
          section(
            "Required User Count",
            <div>
              <input
                type="number"
                min={0}
                placeholder="e.g. 100"
                value={cfg.targetCount ?? ""}
                onChange={(e) =>
                  patchConfig({
                    targetCount: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                Set the target headcount for this project. Overrides the
                project-level setting.
              </div>
            </div>,
          )}

        {/* Predefined Count — for am_total_required widget */}
        {widget.widgetKey === "am_total_required" &&
          section(
            "Predefined Count Override",
            <div>
              <input
                type="number"
                min={0}
                placeholder="e.g. 250 (leave blank to use DB value)"
                value={cfg.targetCount ?? ""}
                onChange={(e) =>
                  patchConfig({
                    targetCount: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                Manually set the total required (predefined) asset count.
                Overrides the sum calculated from asset definitions.
              </div>
            </div>,
          )}

        {/* Excluded Roles — for all user count/breakdown widgets */}
        {isUserWidget &&
          section(
            "Exclude Roles from Count",
            <div>
              {availableRoles.length === 0 ? (
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {projectId
                    ? "No roles found for this project."
                    : "Select a project above to filter roles."}
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: "#ef4444",
                      fontWeight: 600,
                      marginBottom: 2,
                    }}
                  >
                    ✗ Tick a role to REMOVE it from the count
                  </div>
                  {availableRoles.map((role) => {
                    const excluded: string[] = Array.isArray(cfg.excludeRoleIds)
                      ? (cfg.excludeRoleIds as string[])
                      : [];
                    const checked = excluded.includes(role._id);
                    return (
                      <label
                        key={role._id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          cursor: "pointer",
                          padding: "3px 0",
                          color: checked ? "#ef4444" : "#374151",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? excluded.filter((id) => id !== role._id)
                              : [...excluded, role._id];
                            patchConfig({ excludeRoleIds: next });
                          }}
                          style={{ accentColor: "#ef4444", cursor: "pointer" }}
                        />
                        {role.displayName ?? role.name}
                        {checked && (
                          <span
                            style={{
                              fontSize: 9,
                              color: "#ef4444",
                              marginLeft: 2,
                            }}
                          >
                            (excluded)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
                Ticked roles are <strong>removed</strong> from all user counts
                on this widget. Leave all un-ticked to count everyone.
              </div>
            </div>,
          )}

        {/* Filter builder */}
        {section(
          "Filter Config (JSON)",
          <>
            <textarea
              value={filterText}
              onChange={(e) => handleFilterTextChange(e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                fontFamily: "monospace",
                fontSize: 11,
                resize: "vertical",
                border: `1px solid ${filterError ? "#ef4444" : "#e5e7eb"}`,
              }}
            />
            {filterError && (
              <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2 }}>
                {filterError}
              </div>
            )}
            {!filterError && (
              <div style={{ fontSize: 10, color: "#10b981", marginTop: 2 }}>
                âœ“ Filters applied automatically
              </div>
            )}
          </>,
        )}

        {/* Filter presets + @ctx variable picker */}
        {section(
          "Filter Presets",
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {FILTER_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  const json = JSON.stringify(p.filters, null, 2);
                  setFilterText(json);
                  handleFilterTextChange(json);
                }}
                title={p.desc}
                style={{
                  padding: "5px 8px",
                  fontSize: 11,
                  background: "#f5f3ff",
                  border: "1px solid #ddd6fe",
                  borderRadius: 5,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#5b21b6",
                  fontWeight: 600,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                <span>{p.label}</span>
                <span
                  style={{ fontSize: 9, color: "#7c3aed", fontWeight: 400 }}
                >
                  {p.desc}
                </span>
              </button>
            ))}
          </div>,
        )}

        {section(
          "@CTX Variables (advanced)",
          <>
            <div
              style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 5,
                padding: "5px 8px",
                fontSize: 10,
                color: "#92400e",
                marginBottom: 6,
              }}
            >
              Use the <strong>suggested key</strong> shown next to each variable
              â€” wrong keys are silently ignored.
            </div>
            <div style={{ marginBottom: 6 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  display: "block",
                  marginBottom: 3,
                }}
              >
                Filter key (use suggested key below)
              </label>
              <input
                type="text"
                value={ctxKey}
                onChange={(e) => setCtxKey(e.target.value)}
                placeholder="e.g. assignedTo"
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {CTX_VARS.map((v) => (
                <button
                  key={v.label}
                  onClick={() => insertCtxVar(v.label)}
                  disabled={!ctxKey.trim()}
                  title={
                    ctxKey.trim()
                      ? `Add "${ctxKey}": "${v.label}"`
                      : "Enter key name first"
                  }
                  style={{
                    padding: "3px 8px",
                    fontSize: 10,
                    background: ctxKey.trim() ? "#eef2ff" : "#f9fafb",
                    border: `1px solid ${ctxKey.trim() ? "#c7d2fe" : "#e5e7eb"}`,
                    borderRadius: 4,
                    cursor: ctxKey.trim() ? "pointer" : "not-allowed",
                    textAlign: "left",
                    color: ctxKey.trim() ? "#4f46e5" : "#9ca3af",
                    opacity: ctxKey.trim() ? 1 : 0.6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "monospace" }}>{v.label}</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: "#7c3aed",
                      fontFamily: "monospace",
                      background: "#ede9fe",
                      borderRadius: 3,
                      padding: "1px 4px",
                    }}
                  >
                    key: {v.suggestedKey}
                  </span>
                </button>
              ))}
            </div>
          </>,
        )}

        {/* Alert Threshold Ã¢â‚¬â€ kpi_tile / gauge only */}
        {(widget.visualisationType === "kpi_tile" ||
          widget.visualisationType === "gauge") &&
          section(
            "Alert Threshold",
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <select
                  value={cfg.alertThreshold?.operator ?? "gt"}
                  onChange={(e) =>
                    patchConfig({
                      alertThreshold: {
                        ...cfg.alertThreshold,
                        operator: e.target.value,
                      },
                    })
                  }
                  style={{ ...inputStyle, width: 60, flex: "none" }}
                >
                  {[">", "<", ">=", "<=", "="].map((op) => {
                    const map: Record<string, string> = {
                      ">": "gt",
                      "<": "lt",
                      ">=": "gte",
                      "<=": "lte",
                      "=": "eq",
                    };
                    return (
                      <option key={op} value={map[op]}>
                        {op}
                      </option>
                    );
                  })}
                </select>
                <input
                  type="number"
                  placeholder="Value"
                  value={cfg.alertThreshold?.value ?? ""}
                  onChange={(e) =>
                    patchConfig({
                      alertThreshold: {
                        ...cfg.alertThreshold,
                        value:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      },
                    })
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
              <input
                type="text"
                placeholder="Notify role (e.g. admin)"
                value={cfg.alertThreshold?.notifyRoleCode ?? ""}
                onChange={(e) =>
                  patchConfig({
                    alertThreshold: {
                      ...cfg.alertThreshold,
                      notifyRoleCode: e.target.value || undefined,
                    },
                  })
                }
                style={{ ...inputStyle, marginBottom: 5 }}
              />
              <input
                type="text"
                placeholder="Message (use {value} for value)"
                value={cfg.alertThreshold?.message ?? ""}
                onChange={(e) =>
                  patchConfig({
                    alertThreshold: {
                      ...cfg.alertThreshold,
                      message: e.target.value || undefined,
                    },
                  })
                }
                style={inputStyle}
              />
              {cfg.alertThreshold?.value !== undefined && (
                <button
                  onClick={() => patchConfig({ alertThreshold: undefined })}
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    background: "none",
                    border: "1px solid #fecaca",
                    color: "#ef4444",
                    borderRadius: 4,
                    padding: "2px 8px",
                    cursor: "pointer",
                  }}
                >
                  Clear threshold
                </button>
              )}
            </>,
          )}
      </div>

      {/* Remove button */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #f3f4f6" }}>
        <button
          onClick={() => onRemove(widget.layoutKey)}
          style={{
            width: "100%",
            padding: "7px",
            fontSize: 12,
            background: "#fef2f2",
            color: "#ef4444",
            border: "1px solid #fecaca",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Remove Widget
        </button>
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Main Page Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

type LeftTab = "datapoints" | "widgets" | "formula";

export default function DashboardBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  // Template metadata
  const [templateName, setTemplateName] = useState("New Dashboard");
  const [description, setDescription] = useState("");
  const [targetScope, setTargetScope] = useState<"tenant" | "centre" | "user">(
    "tenant",
  );
  const [status, setStatus] = useState<"draft" | "published" | "archived">(
    "draft",
  );

  // Project selector
  const { projects } = useAdminProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  // Canvas
  const [widgets, setWidgets] = useState<CanvasWidget[]>([]);
  const [sections, setSections] = useState<DashboardSectionSlot[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(id ?? null);

  // Left panel
  const [leftTab, setLeftTab] = useState<LeftTab>("datapoints");
  const [search, setSearch] = useState("");
  const [expandedDP, setExpandedDP] = useState<Record<string, boolean>>({
    helpdesk: true,
    attendance: false,
    workforce: false,
    offline_helpdesk: false,
    feedback: false,
    center_ops: false,
    agent_performance: false,
    project: false,
    sla_escalation: false,
    tenant: false,
    ai_analytics: false,
    alerts: false,
  });
  const [expandedModules, setExpandedModules] = useState<
    Record<string, boolean>
  >({
    ticketing: true,
    onboarding: false,
    attendance: false,
  });

  // Canvas width
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setCanvasWidth(entries[0].contentRect.width || 900);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  // Load widget definitions (catalog)
  const { data: widgetDefs = [] } = useQuery(
    ["widgetDefinitions"],
    fetchAllWidgetDefinitions,
    { staleTime: 5 * 60_000 },
  );

  // Load existing template for edit
  useQuery(["template", id], () => fetchTemplate(id!), {
    enabled: isEdit,
    staleTime: 0, // always fetch fresh so edits immediately reflect saved widgets
    // Prevent background refetch from overwriting unsaved user edits in the builder.
    // Window-focus refetches would call onSuccess → setWidgets with old DB data,
    // silently erasing any config changes the user made before clicking Save.
    refetchOnWindowFocus: false,
    onSuccess: (t: DashboardTemplateDetail) => {
      setTemplateName(t.name);
      setDescription(t.description ?? "");
      setTargetScope(t.targetScope);
      setStatus(t.status);
      setSections(
        (t.sections ?? [])
          .map((s: any, i: number) => ({
            _id: s._id ?? s.id ?? `s-${i}`,
            name: s.name,
            order: s.order ?? i,
          }))
          .sort((a: any, b: any) => a.order - b.order),
      );
      const defsMap = Object.fromEntries(
        widgetDefs.map((d) => [d.widgetKey, d]),
      );
      setWidgets(
        t.widgets.map((w: any, i) => ({
          ...w,
          layoutKey: `${w.widgetKey}-${i}`,
          // DB stores gridX/gridY; canvas uses gridColumn/gridRow
          gridColumn: w.gridColumn ?? w.gridX ?? 0,
          gridRow: w.gridRow ?? w.gridY ?? 0,
          // DB stores "title"; canvas uses "displayName"
          displayName: w.displayName ?? w.title ?? w.widgetKey,
          // Normalize sectionId: stored value may be the section name (if saved before
          // the section had a MongoDB _id). Map to _id using name as fallback.
          sectionId: (() => {
            const raw = w.sectionId;
            if (!raw) return null;
            const sec = (t.sections ?? []).find(
              (s: any) => s._id === raw || s.name === raw,
            );
            return sec?._id ?? raw;
          })(),
          widgetDefinitionItem: defsMap[w.widgetKey],
          dataPoint: getDataPoint(w.widgetKey),
        })),
      );
    },
  });

  // Save mutation
  const saveMutation = useMutation(
    async (publish: boolean) => {
      const payload = {
        name: templateName,
        description,
        targetScope,
        status: publish ? ("published" as const) : ("draft" as const),
        sections: sections.map((s, i) => ({
          _id: s._id,
          name: s.name,
          order: i,
        })),
        widgets: widgets
          .slice()
          .sort((a, b) => a.gridRow - b.gridRow || a.gridColumn - b.gridColumn)
          .map((w, i) => ({
            widgetDefinitionId: w.widgetDefinitionId ?? w.widgetKey,
            widgetKey: w.widgetKey,
            displayName: w.displayName,
            visualisationType: w.visualisationType,
            gridColumn: w.gridColumn,
            gridRow: w.gridRow,
            gridWidth: w.gridWidth,
            gridHeight: w.gridHeight,
            displayOrder: i,
            config: {
              ...w.config,
              _projectId:
                selectedProjectId !== "all" ? selectedProjectId : undefined,
            },
            sectionId: w.sectionId ?? null,
          })),
      };
      if (savedId) {
        const updated = await updateTemplate(savedId, payload);
        if (publish) await publishTemplate(savedId);
        return updated;
      } else {
        const created = await createTemplate({ ...payload, status: "draft" });
        setSavedId(created._id);
        if (publish) await publishTemplate(created._id);
        return created;
      }
    },
    {
      onSuccess: (result: DashboardTemplateDetail) => {
        // Use the ID returned by the mutation (avoids stale-closure bug when
        // savedId state hasn't updated yet after a fresh create)
        const resolvedId = result?._id ?? savedId;
        if (resolvedId) {
          queryClient.invalidateQueries(["template", resolvedId]);
        }
        queryClient.invalidateQueries(["templates"]);
        // Invalidate the engine page's tabs cache so widget configs (targetCount,
        // excludeRoleIds, etc.) are immediately picked up after save/publish.
        queryClient.invalidateQueries(["myDashboards"]);
        // Remove all cached widget data so stale results (e.g. old targetCount
        // or old excludeRoleIds responses) are not served on the next dashboard load.
        queryClient.removeQueries(["widget"]);
      },
    },
  );

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync(publish);
      setStatus(publish ? "published" : "draft");
      if (publish) {
        alert(
          "Dashboard published! You can now assign it to users/roles from the Dashboards list.",
        );
      }
    } catch (err: any) {
      const msg = err?.message ?? "Failed to save/publish dashboard";
      alert(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!savedId) return;
    const result = await duplicateTemplate(savedId);
    navigate(`/admin/dashboard-builder/${result._id}`);
  };

  const handleExport = async () => {
    if (!savedId) return;
    try {
      await exportTemplate(savedId, templateName);
    } catch (e: any) {
      alert(e.message ?? "Export failed");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const result = await importTemplate(file);
      navigate(`/admin/dashboard-builder/${result._id}`);
    } catch (e: any) {
      alert(e.message ?? "Import failed");
    }
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Add widget helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  const addWidget = useCallback(
    (
      partial: Partial<CanvasWidget> & {
        widgetKey: string;
        displayName: string;
        visualisationType: string;
      },
    ) => {
      const pos = nextAvailablePosition(widgets);
      const layoutKey = `${partial.widgetKey}-${Date.now()}`;
      setWidgets((prev) => [
        ...prev,
        {
          layoutKey,
          widgetDefinitionId: partial.widgetDefinitionId ?? partial.widgetKey,
          widgetKey: partial.widgetKey,
          displayName: partial.displayName,
          visualisationType: partial.visualisationType,
          gridColumn: pos.x,
          gridRow: pos.y,
          gridWidth: partial.gridWidth ?? 3,
          gridHeight: partial.gridHeight ?? 2,
          displayOrder: prev.length,
          config: partial.config ?? {},
          sectionId: partial.sectionId ?? null,
          widgetDefinitionItem: partial.widgetDefinitionItem,
          dataPoint: partial.dataPoint,
        },
      ]);
    },
    [widgets],
  );

  const addWidgetFromDataPoint = useCallback(
    (dp: DataPoint) => {
      addWidget({
        widgetKey: dp.key,
        displayName: dp.label,
        visualisationType: dp.defaultVis,
        gridWidth: dp.unit === "list" ? 4 : 3,
        gridHeight: dp.unit === "list" ? 3 : 2,
        config: { displayMode: dp.unit === "percent" ? "percent" : "count" },
        dataPoint: dp,
      });
    },
    [addWidget],
  );

  const addWidgetFromDef = useCallback(
    (def: WidgetDefinitionItem) => {
      addWidget({
        widgetDefinitionId: def._id,
        widgetKey: def.widgetKey,
        displayName: def.displayName,
        visualisationType: def.defaultVisualisation,
        config: { ...(def.defaultConfig ?? {}) },
        widgetDefinitionItem: def,
        dataPoint: getDataPoint(def.widgetKey),
      });
    },
    [addWidget],
  );

  const updateWidget = useCallback(
    (key: string, updated: Partial<CanvasWidget>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.layoutKey === key ? { ...w, ...updated } : w)),
      );
    },
    [],
  );

  const removeWidget = useCallback((key: string) => {
    setWidgets((prev) => prev.filter((w) => w.layoutKey !== key));
    setSelectedKey(null);
  }, []);

  // Use onDragStop / onResizeStop instead of onLayoutChange to avoid the
  // react-grid-layout controlled-mode feedback loop where firing onLayoutChange
  // with the pre-update internal state resets programmatic width/height changes
  // made via the input fields.
  const onDragStop = useCallback((layout: Layout) => {
    setWidgets((prev) =>
      prev.map((w) => {
        const l = layout.find((li) => li.i === w.layoutKey);
        if (!l) return w;
        return { ...w, gridColumn: l.x, gridRow: l.y };
      }),
    );
  }, []);

  const onResizeStop = useCallback((layout: Layout) => {
    setWidgets((prev) =>
      prev.map((w) => {
        const l = layout.find((li) => li.i === w.layoutKey);
        if (!l) return w;
        return { ...w, gridWidth: l.w, gridHeight: l.h };
      }),
    );
  }, []);

  const filteredDPs = useMemo(() => {
    const s = search.toLowerCase();
    return DATA_POINTS.filter(
      (d) =>
        !s ||
        d.label.toLowerCase().includes(s) ||
        d.module.includes(s) ||
        d.key.includes(s),
    );
  }, [search]);

  const groupedDPs = useMemo(
    () => groupByModule_DataPoints(filteredDPs),
    [filteredDPs],
  );

  const filteredWidgetDefs = useMemo(() => {
    const s = search.toLowerCase();
    return widgetDefs.filter(
      (d) =>
        !s ||
        d.displayName.toLowerCase().includes(s) ||
        d.widgetKey.includes(s) ||
        d.module.includes(s),
    );
  }, [widgetDefs, search]);

  const groupedDefs = useMemo(
    () => groupByModule(filteredWidgetDefs),
    [filteredWidgetDefs],
  );

  const selectedWidget =
    widgets.find((w) => w.layoutKey === selectedKey) ?? null;

  const layout: LayoutItem[] = widgets.map((w) => ({
    i: w.layoutKey,
    x: w.gridColumn,
    y: w.gridRow,
    w: w.gridWidth,
    h: w.gridHeight,
    minW: 1,
    minH: 1,
  }));

  // Ã¢â€â‚¬Ã¢â€â‚¬ Styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "10px 0",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    background: "transparent",
    border: "none",
    borderBottom: `2px solid ${active ? "#6750A4" : "transparent"}`,
    cursor: "pointer",
    color: active ? "#6750A4" : "#49454F",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Render Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  return (
    <DashboardLayout>
      <style>{`@keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "#FEF7FF",
          overflow: "hidden",
        }}
      >
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Top bar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "#6b7280",
              padding: "0 2px",
            }}
            title="Back"
          >
            &lt;
          </button>

          {/* Name */}
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Dashboard name..."
            style={{
              flex: 1,
              minWidth: 160,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 14,
              fontWeight: 600,
              outline: "none",
            }}
          />

          {/* Project selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#ECE6F0",
              borderRadius: 10,
              padding: "5px 12px",
            }}
          >
            <span
              style={{ fontSize: 12, color: "#49454F", whiteSpace: "nowrap" }}
            >
              Project:
            </span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                padding: "0",
                fontSize: 13,
                color: "#6750A4",
                fontWeight: 700,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scope */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid #CAC4D0",
              borderRadius: 10,
              padding: "5px 12px",
            }}
          >
            <select
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value as any)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "#49454F",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="tenant">Tenant scope</option>
              <option value="centre">Centre scope</option>
              <option value="user">User scope</option>
            </select>
          </div>

          {/* Status badge */}
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 700,
              background: status === "published" ? "#dcfce7" : "#fef9c3",
              color: status === "published" ? "#16a34a" : "#854d0e",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            {status}
          </span>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginLeft: "auto",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 1,
                height: 24,
                background: "#CAC4D0",
                margin: "0 4px",
              }}
            />
            {savedId && (
              <button
                onClick={handleDuplicate}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  background: "transparent",
                  color: "#49454F",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#ECE6F0")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                Duplicate
              </button>
            )}
            {savedId && (
              <button
                onClick={handleExport}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  background: "transparent",
                  color: "#49454F",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#ECE6F0")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                Export
              </button>
            )}
            <label
              style={{
                padding: "6px 14px",
                fontSize: 13,
                background: "transparent",
                color: "#49454F",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                display: "inline-block",
                fontWeight: 500,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#ECE6F0")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Import
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: "none" }}
              />
            </label>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{
                padding: "6px 16px",
                fontSize: 13,
                background: "transparent",
                color: "#49454F",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#ECE6F0")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{
                padding: "7px 22px",
                fontSize: 13,
                background: "#6750A4",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: "0 1px 4px rgba(103,80,164,0.25)",
              }}
            >
              Publish
            </button>
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Three-panel layout Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div
            style={{
              width: 280,
              flexShrink: 0,
              background: "#F7F2FA",
              borderRight: "1px solid #CAC4D0",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Tab bar */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid #CAC4D0",
                background: "#F7F2FA",
              }}
            >
              <button
                style={tabBtnStyle(leftTab === "datapoints")}
                onClick={() => setLeftTab("datapoints")}
              >
                {"\uD83D\uDCCA"} Data Points
              </button>
              <button
                style={tabBtnStyle(leftTab === "widgets")}
                onClick={() => setLeftTab("widgets")}
              >
                {"\uD83E\uDDE9"} Widgets
              </button>
              <button
                style={tabBtnStyle(leftTab === "formula")}
                onClick={() => setLeftTab("formula")}
              >
                {"\u0192"} Formula
              </button>
            </div>

            {/* Search (for Data Points + Widgets tabs) */}
            {leftTab !== "formula" && (
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #CAC4D0",
                }}
              >
                <div style={{ position: "relative" }}>
                  <svg
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#79747E",
                      pointerEvents: "none",
                    }}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search data points..."
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: 20,
                      padding: "7px 12px 7px 34px",
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
                      background: "#ECE6F0",
                      color: "#1D1B20",
                    }}
                  />
                </div>
              </div>
            )}

            {leftTab === "datapoints" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                {Object.entries(groupedDPs).map(([source, dps]) => {
                  const src = MODULE_META[source as DataModule] ?? {
                    label: source,
                    icon: "?",
                    color: "#9ca3af",
                  };
                  return (
                    <div key={source} style={{ marginBottom: 6 }}>
                      <button
                        onClick={() =>
                          setExpandedDP((m) => ({ ...m, [source]: !m[source] }))
                        }
                        style={{
                          width: "100%",
                          background: "none",
                          border: "none",
                          textAlign: "left",
                          padding: "6px 4px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            color: src.color,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: src.color,
                            }}
                          />
                          <span
                            style={{
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {src.label}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: "#79747E",
                              fontWeight: 400,
                            }}
                          >
                            ({dps.length})
                          </span>
                        </span>
                        <span style={{ color: "#9ca3af" }}>
                          {expandedDP[source] ? "v" : ">"}
                        </span>
                      </button>

                      {expandedDP[source] && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 5,
                            paddingBottom: 4,
                          }}
                        >
                          {dps.map((dp) => (
                            <DataPointCard
                              key={dp.key}
                              dp={dp}
                              onAdd={addWidgetFromDataPoint}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredDPs.length === 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      padding: "12px 4px",
                    }}
                  >
                    No data points match "{search}"
                  </div>
                )}
              </div>
            )}

            {leftTab === "widgets" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
                {Object.entries(groupedDefs).map(([module, defs]) => (
                  <div key={module} style={{ marginBottom: 4 }}>
                    <button
                      onClick={() =>
                        setExpandedModules((m) => ({
                          ...m,
                          [module]: !m[module],
                        }))
                      }
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        textAlign: "left",
                        padding: "5px 4px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#374151",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>
                        {module}
                        <span
                          style={{
                            fontSize: 10,
                            color: "#9ca3af",
                            fontWeight: 400,
                            marginLeft: 5,
                          }}
                        >
                          ({defs.length})
                        </span>
                      </span>
                      <span style={{ color: "#9ca3af" }}>
                        {expandedModules[module] ? "v" : ">"}
                      </span>
                    </button>

                    {expandedModules[module] && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                          paddingBottom: 4,
                        }}
                      >
                        {defs.map((d) => (
                          <LibraryCard
                            key={d.widgetKey}
                            def={d}
                            onAdd={addWidgetFromDef}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {filteredWidgetDefs.length === 0 && widgetDefs.length === 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      padding: "12px 4px",
                    }}
                  ></div>
                )}
                {filteredWidgetDefs.length === 0 && widgetDefs.length > 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      padding: "12px 4px",
                    }}
                  >
                    No widgets match "{search}"
                  </div>
                )}
              </div>
            )}

            {/* Ã¢â€â‚¬Ã¢â€â‚¬ FORMULA tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
            {leftTab === "formula" && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <CustomFormulaPanel
                  onAdd={(partial) =>
                    addWidget({
                      widgetKey: partial.widgetKey ?? "custom_ratio",
                      displayName: partial.displayName ?? "Custom Metric",
                      visualisationType:
                        partial.visualisationType ?? "kpi_tile",
                      gridWidth: partial.gridWidth,
                      gridHeight: partial.gridHeight,
                      config: partial.config,
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ CENTER: Grid Canvas Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <div
            ref={canvasRef}
            onDrop={(e) => {
              e.preventDefault();
              const dpKey = e.dataTransfer.getData("dataPointKey");
              const wKey = e.dataTransfer.getData("widgetKey");
              if (dpKey) {
                const dp = DATA_POINTS.find((d) => d.key === dpKey);
                if (dp) addWidgetFromDataPoint(dp);
              } else if (wKey) {
                const def = widgetDefs.find((d) => d.widgetKey === wKey);
                if (def) addWidgetFromDef(def);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              position: "relative",
              background: "#f8fafc",
            }}
          >
            {/* Canvas header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {widgets.length === 0
                  ? "<"
                  : `${widgets.length} widget${widgets.length !== 1 ? "s" : ""} on canvas`}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {selectedProjectId !== "all" && (
                  <div
                    style={{
                      fontSize: 11,
                      background: "#faf5ff",
                      border: "1px solid #e9d5ff",
                      borderRadius: 20,
                      padding: "2px 10px",
                      color: "#7c3aed",
                      fontWeight: 600,
                    }}
                  >
                    {projects.find((p) => p._id === selectedProjectId)?.name ??
                      selectedProjectId}
                  </div>
                )}
                <button
                  onClick={() =>
                    setSections((prev) => [
                      ...prev,
                      {
                        name: `Section ${prev.length + 1}`,
                        order: prev.length,
                      },
                    ])
                  }
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    background: "#f0fdf4",
                    color: "#16a34a",
                    border: "1px solid #bbf7d0",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add Section
                </button>
              </div>
            </div>

            {/* Section manager â€” shown when sections exist */}
            {sections.length > 0 && (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#16a34a",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 2,
                  }}
                >
                  Sections ({sections.length})
                </div>
                {sections.map((sec, idx) => (
                  <div
                    key={sec._id ?? idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#fff",
                      border: "1px solid #d1fae5",
                      borderRadius: 6,
                      padding: "4px 8px",
                    }}
                  >
                    <span
                      style={{ fontSize: 11, color: "#6b7280", minWidth: 16 }}
                    >
                      {idx + 1}.
                    </span>
                    <input
                      value={sec.name}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, name: e.target.value } : s,
                          ),
                        )
                      }
                      style={{
                        flex: 1,
                        border: "1px solid #e5e7eb",
                        borderRadius: 4,
                        padding: "3px 7px",
                        fontSize: 12,
                        outline: "none",
                      }}
                    />
                    <button
                      title="Remove section"
                      onClick={() => {
                        const removed = sec._id ?? sec.name;
                        setSections((prev) => prev.filter((_, i) => i !== idx));
                        // un-assign any widgets from this section
                        setWidgets((prev) =>
                          prev.map((w) =>
                            w.sectionId === removed || w.sectionId === sec.name
                              ? { ...w, sectionId: null }
                              : w,
                          ),
                        );
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#ef4444",
                        fontSize: 14,
                        padding: "0 2px",
                        lineHeight: 1,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {widgets.length === 0 && (
              <div
                style={{
                  border: "2px dashed #CAC4D0",
                  borderRadius: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 340,
                  backgroundImage:
                    "radial-gradient(circle, #CAC4D0 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      background: "#ECE6F0",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 36,
                      color: "#79747E",
                    }}
                  >
                    +
                  </div>
                  <div
                    style={{ fontWeight: 700, fontSize: 18, color: "#49454F" }}
                  >
                    Your dashboard is empty
                  </div>
                  <div style={{ fontSize: 13, color: "#79747E" }}>
                    Drag and drop data points or widgets here
                  </div>
                </div>
              </div>
            )}

            {widgets.length > 0 && (
              <ReactGridLayout
                className="layout"
                layout={layout}
                gridConfig={{ cols: 12, rowHeight: 100 }}
                width={canvasWidth - 32}
                onDragStop={onDragStop}
                onResizeStop={onResizeStop}
                dragConfig={{ handle: ".widget-drag-handle" }}
              >
                {widgets.map((w) => {
                  const dp = w.dataPoint ?? getDataPoint(w.widgetKey);
                  const srcColor = dp
                    ? MODULE_META[dp.module]?.color
                    : "#7F56D9";
                  const cfg: WidgetBuildConfig = w.config ?? {};
                  const displayMode = cfg.displayMode ?? "count";
                  const isFormula = w.widgetKey === "custom_ratio";

                  return (
                    <div
                      key={w.layoutKey}
                      onClick={() => setSelectedKey(w.layoutKey)}
                      style={{
                        background: "#fff",
                        border: `2px solid ${selectedKey === w.layoutKey ? "#7F56D9" : "#e5e7eb"}`,
                        borderRadius: 10,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        cursor: "pointer",
                        boxShadow:
                          selectedKey === w.layoutKey
                            ? "0 0 0 3px #ede9fe"
                            : "0 1px 4px rgba(0,0,0,0.07)",
                        transition: "border-color 0.12s, box-shadow 0.12s",
                      }}
                    >
                      {/* Drag handle bar */}
                      <div
                        className="widget-drag-handle"
                        style={{
                          background: srcColor + "10",
                          borderBottom: `1px solid ${srcColor}22`,
                          padding: "4px 10px",
                          cursor: "grab",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>
                          {getVisIcon(w.visualisationType)}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#1f2937",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {w.displayName}
                        </span>
                        {displayMode !== "count" && (
                          <span
                            style={{
                              fontSize: 9,
                              background: "#dbeafe",
                              color: "#2563eb",
                              borderRadius: 10,
                              padding: "1px 5px",
                              fontWeight: 700,
                            }}
                          >
                            {displayMode === "both" ? "#%" : "%"}
                          </span>
                        )}
                        {isFormula && (
                          <span
                            style={{
                              fontSize: 9,
                              background: "#ede9fe",
                              color: "#7c3aed",
                              borderRadius: 10,
                              padding: "1px 5px",
                              fontWeight: 700,
                            }}
                          >
                            f
                          </span>
                        )}
                      </div>

                      {/* Widget body preview */}
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "4px 8px",
                          gap: 2,
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {isFormula && cfg.formula
                            ? `${DATA_POINTS.find((d) => d.key === cfg.formula?.numeratorKey)?.label ?? cfg.formula.numeratorKey} / ${DATA_POINTS.find((d) => d.key === cfg.formula?.denominatorKey)?.label ?? cfg.formula.denominatorKey}`
                            : (dp?.desc ?? w.widgetKey)}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: srcColor,
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          {dp ? MODULE_META[dp.module]?.label : "pre-built"} -{" "}
                          {w.visualisationType.replace(/_/g, " ")}
                        </div>
                        {w.sectionId &&
                          (() => {
                            const sec = sections.find(
                              (s) => (s._id ?? s.name) === w.sectionId,
                            );
                            return sec ? (
                              <div
                                style={{
                                  fontSize: 9,
                                  background: "#f0fdf4",
                                  color: "#16a34a",
                                  border: "1px solid #bbf7d0",
                                  borderRadius: 10,
                                  padding: "1px 6px",
                                  fontWeight: 600,
                                  marginTop: 2,
                                }}
                              >
                                {sec.name}
                              </div>
                            ) : null;
                          })()}
                      </div>
                    </div>
                  );
                })}
              </ReactGridLayout>
            )}
          </div>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ RIGHT: Config Drawer Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {selectedWidget ? (
            <ConfigDrawer
              widget={selectedWidget}
              sections={sections}
              onUpdate={updateWidget}
              onRemove={removeWidget}
              onClose={() => setSelectedKey(null)}
              projectId={
                selectedProjectId !== "all" ? selectedProjectId : undefined
              }
            />
          ) : (
            <div
              style={{
                width: 220,
                flexShrink: 0,
                background: "#fff",
                borderLeft: "1px solid #e5e7eb",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: 12,
                padding: 16,
                textAlign: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 28 }}>{"âš™"}</div>
              <div>Click a widget on the canvas to configure it</div>
              <div style={{ fontSize: 10, lineHeight: 1.5 }}>
                Set chart type, display mode (count / %, both), filters, and
                more
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
