$file = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.UTF8Encoding]::new($false))

# Find array start (line 62, 1-based = index 61) and end
$startIdx = 61  # "const DATA_POINTS: DataPoint[] = ["
$endIdx = $startIdx
for ($i = $startIdx + 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\];') { $endIdx = $i; break }
}

Write-Host "Replacing lines $($startIdx+1) to $($endIdx+1)"

$newBlock = @'
const DATA_POINTS: DataPoint[] = [
  // -- Helpdesk Ticketing --
  { key: "ht_total_tickets",          label: "Total Tickets",             desc: "All tickets ever created",                         module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_open_tickets",           label: "Open Tickets",              desc: "Tickets currently open",                           module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_resolved_tickets",       label: "Resolved Tickets",          desc: "Tickets marked resolved",                          module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_closed_tickets",         label: "Closed Tickets",            desc: "Tickets fully closed",                             module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_pending_tickets",        label: "Pending Tickets",           desc: "Tickets awaiting action",                          module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_escalated_tickets",      label: "Escalated Tickets",         desc: "Tickets escalated to higher level",                module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_sla_breached",           label: "SLA Breached",              desc: "Tickets that exceeded SLA time",                   module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_resolved_within_sla",    label: "Resolved Within SLA",       desc: "Tickets resolved before SLA deadline",             module: "helpdesk",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "ht_resolution_rate",        label: "Resolution Rate",           desc: "Resolved / Total x 100%",                          module: "helpdesk",          unit: "percent", defaultVis: "gauge" },
  { key: "ht_sla_compliance_rate",    label: "SLA Compliance Rate",       desc: "Resolved within SLA / Total x 100%",               module: "helpdesk",          unit: "percent", defaultVis: "gauge" },
  { key: "ht_avg_resolution_hours",   label: "Avg Resolution Time (hrs)", desc: "Average hours to close a ticket",                  module: "helpdesk",          unit: "hours",   defaultVis: "kpi_tile" },
  { key: "ht_tickets_by_category",    label: "Tickets by Category",       desc: "Ticket count grouped by category",                 module: "helpdesk",          unit: "list",    defaultVis: "bar_chart" },
  { key: "ht_tickets_by_status",      label: "Tickets by Status",         desc: "Ticket count grouped by status",                   module: "helpdesk",          unit: "list",    defaultVis: "pie_chart" },
  { key: "ht_tickets_by_priority",    label: "Tickets by Priority",       desc: "Ticket count grouped by priority",                 module: "helpdesk",          unit: "list",    defaultVis: "donut_chart" },
  { key: "ht_daily_trend",            label: "Daily Ticket Trend",        desc: "Daily volume of tickets over time",                module: "helpdesk",          unit: "list",    defaultVis: "line_chart" },
  { key: "ht_agent_workload",         label: "Agent Workload",            desc: "Ticket count per agent",                           module: "helpdesk",          unit: "list",    defaultVis: "bar_chart" },
  { key: "ht_tickets_heatmap",        label: "Tickets Heatmap",           desc: "Volume by day-of-week x hour",                     module: "helpdesk",          unit: "list",    defaultVis: "table" },
  { key: "ht_first_response_time",    label: "First Response Time (hrs)", desc: "Average time to first agent response",             module: "helpdesk",          unit: "hours",   defaultVis: "kpi_tile" },
  { key: "ht_reopen_rate",            label: "Reopen Rate",               desc: "Tickets reopened / Total resolved x 100%",         module: "helpdesk",          unit: "percent", defaultVis: "gauge" },
  { key: "ht_tickets_by_project",     label: "Tickets by Project",        desc: "Ticket count grouped by project",                  module: "helpdesk",          unit: "list",    defaultVis: "bar_chart" },

  // -- Attendance --
  { key: "att_total_checkins",        label: "Total Check-ins",           desc: "Total attendance check-ins recorded",              module: "attendance",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "att_present_today",         label: "Present Today",             desc: "Students marked present today",                    module: "attendance",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "att_absent_today",          label: "Absent Today",              desc: "Students absent today",                            module: "attendance",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "att_attendance_rate",       label: "Attendance Rate",           desc: "Present / Enrolled x 100%",                        module: "attendance",        unit: "percent", defaultVis: "gauge" },
  { key: "att_absenteeism_rate",      label: "Absenteeism Rate",          desc: "Absent / Enrolled x 100%",                         module: "attendance",        unit: "percent", defaultVis: "gauge" },
  { key: "att_late_arrivals",         label: "Late Arrivals",             desc: "Students who checked in after scheduled time",     module: "attendance",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "att_daily_trend",           label: "Attendance Trend",          desc: "Daily attendance over time",                       module: "attendance",        unit: "list",    defaultVis: "line_chart" },
  { key: "att_by_batch",              label: "Attendance by Batch",       desc: "Attendance grouped by batch/class",                module: "attendance",        unit: "list",    defaultVis: "bar_chart" },
  { key: "att_by_course",             label: "Attendance by Course",      desc: "Attendance grouped by course",                     module: "attendance",        unit: "list",    defaultVis: "bar_chart" },

  // -- Workforce --
  { key: "wf_total_staff",            label: "Total Staff",               desc: "Total active staff members",                       module: "workforce",         unit: "count",   defaultVis: "kpi_tile" },
  { key: "wf_staff_present",          label: "Staff Present Today",       desc: "Staff checked in today",                           module: "workforce",         unit: "count",   defaultVis: "kpi_tile" },
  { key: "wf_staff_absent",           label: "Staff Absent Today",        desc: "Staff absent today",                               module: "workforce",         unit: "count",   defaultVis: "kpi_tile" },
  { key: "wf_staff_on_leave",         label: "Staff on Leave",            desc: "Staff with approved leave today",                  module: "workforce",         unit: "count",   defaultVis: "kpi_tile" },
  { key: "wf_staff_attendance_rate",  label: "Staff Attendance Rate",     desc: "Present / Total staff x 100%",                     module: "workforce",         unit: "percent", defaultVis: "gauge" },
  { key: "wf_avg_working_hours",      label: "Avg Working Hours",         desc: "Average daily working hours per staff",            module: "workforce",         unit: "hours",   defaultVis: "kpi_tile" },
  { key: "wf_staff_by_department",    label: "Staff by Department",       desc: "Headcount grouped by department",                  module: "workforce",         unit: "list",    defaultVis: "bar_chart" },
  { key: "wf_overtime_hours",         label: "Overtime Hours",            desc: "Total overtime hours logged",                      module: "workforce",         unit: "hours",   defaultVis: "kpi_tile" },
  { key: "wf_leave_utilization",      label: "Leave Utilization",         desc: "Leave days taken / Total allowed x 100%",          module: "workforce",         unit: "percent", defaultVis: "gauge" },

  // -- Offline / Field Helpdesk --
  { key: "oh_total_visits",           label: "Total Field Visits",        desc: "Total offline / field visits logged",              module: "offline_helpdesk",  unit: "count",   defaultVis: "kpi_tile" },
  { key: "oh_pending_visits",         label: "Pending Visits",            desc: "Field visits not yet completed",                   module: "offline_helpdesk",  unit: "count",   defaultVis: "kpi_tile" },
  { key: "oh_completed_visits",       label: "Completed Visits",          desc: "Field visits marked complete",                     module: "offline_helpdesk",  unit: "count",   defaultVis: "kpi_tile" },
  { key: "oh_visit_completion_rate",  label: "Visit Completion Rate",     desc: "Completed / Total x 100%",                         module: "offline_helpdesk",  unit: "percent", defaultVis: "gauge" },
  { key: "oh_avg_visit_duration",     label: "Avg Visit Duration (hrs)",  desc: "Average hours spent per field visit",              module: "offline_helpdesk",  unit: "hours",   defaultVis: "kpi_tile" },
  { key: "oh_visits_by_agent",        label: "Visits by Agent",           desc: "Field visits grouped by agent",                    module: "offline_helpdesk",  unit: "list",    defaultVis: "bar_chart" },
  { key: "oh_visits_daily_trend",     label: "Visits Daily Trend",        desc: "Daily offline visits over time",                   module: "offline_helpdesk",  unit: "list",    defaultVis: "line_chart" },

  // -- Feedback --
  { key: "fb_total_responses",        label: "Total Responses",           desc: "Total feedback responses collected",               module: "feedback",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "fb_avg_rating",             label: "Avg Rating",                desc: "Average feedback score",                           module: "feedback",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "fb_csat_score",             label: "CSAT Score",                desc: "Customer Satisfaction Score",                      module: "feedback",          unit: "percent", defaultVis: "gauge" },
  { key: "fb_nps_score",              label: "NPS Score",                 desc: "Net Promoter Score",                               module: "feedback",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "fb_promoters",              label: "Promoters",                 desc: "Respondents with score 9-10",                      module: "feedback",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "fb_detractors",             label: "Detractors",                desc: "Respondents with score 0-6",                       module: "feedback",          unit: "count",   defaultVis: "kpi_tile" },
  { key: "fb_by_category",            label: "Feedback by Category",      desc: "Responses grouped by feedback category",           module: "feedback",          unit: "list",    defaultVis: "bar_chart" },
  { key: "fb_response_rate",          label: "Response Rate",             desc: "Feedback received / Sent x 100%",                  module: "feedback",          unit: "percent", defaultVis: "gauge" },
  { key: "fb_rating_trend",           label: "Rating Trend",              desc: "Average rating over time",                         module: "feedback",          unit: "list",    defaultVis: "line_chart" },

  // -- Center Operations --
  { key: "co_total_centers",          label: "Total Centers",             desc: "Total active centers",                             module: "center_ops",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "co_active_centers",         label: "Active Centers",            desc: "Centers currently operational",                    module: "center_ops",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "co_center_capacity",        label: "Center Capacity",           desc: "Total enrolled vs seating capacity",               module: "center_ops",        unit: "count",   defaultVis: "kpi_tile" },
  { key: "co_capacity_utilization",   label: "Capacity Utilization",      desc: "Enrolled / Total capacity x 100%",                 module: "center_ops",        unit: "percent", defaultVis: "gauge" },
  { key: "co_tickets_per_center",     label: "Tickets per Center",        desc: "Ticket count grouped by center",                   module: "center_ops",        unit: "list",    defaultVis: "bar_chart" },
  { key: "co_students_per_center",    label: "Students per Center",       desc: "Student headcount per center",                     module: "center_ops",        unit: "list",    defaultVis: "bar_chart" },
  { key: "co_center_performance",     label: "Center Performance Index",  desc: "Composite score per center",                       module: "center_ops",        unit: "percent", defaultVis: "donut_chart" },

  // -- Agent Performance --
  { key: "ap_total_agents",           label: "Total Agents",              desc: "Total active support agents",                      module: "agent_performance", unit: "count",   defaultVis: "kpi_tile" },
  { key: "ap_tickets_handled",        label: "Tickets Handled",           desc: "Tickets assigned to agents",                       module: "agent_performance", unit: "count",   defaultVis: "kpi_tile" },
  { key: "ap_avg_handle_time",        label: "Avg Handle Time (hrs)",     desc: "Average time per ticket per agent",                module: "agent_performance", unit: "hours",   defaultVis: "kpi_tile" },
  { key: "ap_resolution_rate",        label: "Agent Resolution Rate",     desc: "Resolved / Assigned x 100% per agent",             module: "agent_performance", unit: "percent", defaultVis: "gauge" },
  { key: "ap_first_contact_res",      label: "First Contact Resolution",  desc: "Tickets resolved on first contact %",              module: "agent_performance", unit: "percent", defaultVis: "gauge" },
  { key: "ap_csat_by_agent",          label: "CSAT by Agent",             desc: "Customer satisfaction score per agent",            module: "agent_performance", unit: "list",    defaultVis: "bar_chart" },
  { key: "ap_sla_compliance",         label: "SLA Compliance by Agent",   desc: "SLA met % per agent",                              module: "agent_performance", unit: "list",    defaultVis: "bar_chart" },
  { key: "ap_leaderboard",            label: "Agent Leaderboard",         desc: "Ranking by resolved tickets",                      module: "agent_performance", unit: "list",    defaultVis: "table" },
  { key: "ap_avg_response_time",      label: "Avg Response Time (hrs)",   desc: "Average first response time per agent",            module: "agent_performance", unit: "hours",   defaultVis: "kpi_tile" },

  // -- Projects --
  { key: "pr_total_projects",         label: "Total Projects",            desc: "All projects in the system",                       module: "project",           unit: "count",   defaultVis: "kpi_tile" },
  { key: "pr_active_projects",        label: "Active Projects",           desc: "Projects currently in progress",                   module: "project",           unit: "count",   defaultVis: "kpi_tile" },
  { key: "pr_completed_projects",     label: "Completed Projects",        desc: "Projects marked complete",                         module: "project",           unit: "count",   defaultVis: "kpi_tile" },
  { key: "pr_overdue_projects",       label: "Overdue Projects",          desc: "Projects past their deadline",                     module: "project",           unit: "count",   defaultVis: "kpi_tile" },
  { key: "pr_completion_rate",        label: "Project Completion Rate",   desc: "Completed / Total x 100%",                         module: "project",           unit: "percent", defaultVis: "gauge" },
  { key: "pr_tickets_per_project",    label: "Tickets per Project",       desc: "Ticket count grouped by project",                  module: "project",           unit: "list",    defaultVis: "bar_chart" },
  { key: "pr_project_health",         label: "Project Health",            desc: "On-time vs delayed project distribution",          module: "project",           unit: "list",    defaultVis: "pie_chart" },
  { key: "pr_milestones_met",         label: "Milestones Met",            desc: "Milestones completed on time",                     module: "project",           unit: "count",   defaultVis: "kpi_tile" },

  // -- SLA & Escalation --
  { key: "se_active_sla_policies",    label: "Active SLA Policies",       desc: "Total SLA policies configured",                    module: "sla_escalation",    unit: "count",   defaultVis: "kpi_tile" },
  { key: "se_sla_breached_count",     label: "SLA Breaches",              desc: "Total SLA breaches this period",                   module: "sla_escalation",    unit: "count",   defaultVis: "kpi_tile" },
  { key: "se_sla_compliance_rate",    label: "SLA Compliance Rate",       desc: "Tickets within SLA / Total x 100%",                module: "sla_escalation",    unit: "percent", defaultVis: "gauge" },
  { key: "se_escalations_raised",     label: "Escalations Raised",        desc: "Total escalations triggered",                      module: "sla_escalation",    unit: "count",   defaultVis: "kpi_tile" },
  { key: "se_escalations_resolved",   label: "Escalations Resolved",      desc: "Escalations that were resolved",                   module: "sla_escalation",    unit: "count",   defaultVis: "kpi_tile" },
  { key: "se_escalation_rate",        label: "Escalation Rate",           desc: "Escalated / Total tickets x 100%",                 module: "sla_escalation",    unit: "percent", defaultVis: "gauge" },
  { key: "se_avg_escalation_time",    label: "Avg Escalation Time (hrs)", desc: "Avg time before ticket is escalated",              module: "sla_escalation",    unit: "hours",   defaultVis: "kpi_tile" },
  { key: "se_breach_by_priority",     label: "Breaches by Priority",      desc: "SLA breaches grouped by priority",                 module: "sla_escalation",    unit: "list",    defaultVis: "bar_chart" },
  { key: "se_breach_trend",           label: "SLA Breach Trend",          desc: "Daily SLA breaches over time",                     module: "sla_escalation",    unit: "list",    defaultVis: "line_chart" },

  // -- Tenant --
  { key: "tn_total_tenants",          label: "Total Tenants",             desc: "Total registered tenants",                         module: "tenant",            unit: "count",   defaultVis: "kpi_tile" },
  { key: "tn_active_tenants",         label: "Active Tenants",            desc: "Tenants currently active",                         module: "tenant",            unit: "count",   defaultVis: "kpi_tile" },
  { key: "tn_tickets_per_tenant",     label: "Tickets per Tenant",        desc: "Ticket volume grouped by tenant",                  module: "tenant",            unit: "list",    defaultVis: "bar_chart" },
  { key: "tn_students_per_tenant",    label: "Students per Tenant",       desc: "Student count per tenant",                         module: "tenant",            unit: "list",    defaultVis: "bar_chart" },
  { key: "tn_csat_by_tenant",         label: "CSAT by Tenant",            desc: "Satisfaction score per tenant",                    module: "tenant",            unit: "list",    defaultVis: "bar_chart" },
  { key: "tn_sla_compliance_tenant",  label: "SLA Compliance by Tenant",  desc: "SLA compliance rate per tenant",                   module: "tenant",            unit: "list",    defaultVis: "table" },
  { key: "tn_tenant_health_index",    label: "Tenant Health Index",       desc: "Composite health score per tenant",                module: "tenant",            unit: "list",    defaultVis: "table" },

  // -- AI & Analytics --
  { key: "ai_predicted_volume",       label: "Predicted Ticket Volume",   desc: "AI-predicted tickets for next period",             module: "ai_analytics",      unit: "count",   defaultVis: "kpi_tile" },
  { key: "ai_anomalies_detected",     label: "Anomalies Detected",        desc: "Unusual patterns flagged by AI",                   module: "ai_analytics",      unit: "count",   defaultVis: "kpi_tile" },
  { key: "ai_sentiment_positive",     label: "Positive Sentiment",        desc: "Tickets with positive language % ",                 module: "ai_analytics",      unit: "percent", defaultVis: "gauge" },
  { key: "ai_sentiment_negative",     label: "Negative Sentiment",        desc: "Tickets with negative language %",                  module: "ai_analytics",      unit: "percent", defaultVis: "gauge" },
  { key: "ai_category_accuracy",      label: "Category Auto-tag Accuracy",desc: "Correct auto-categorization rate",                  module: "ai_analytics",      unit: "percent", defaultVis: "gauge" },
  { key: "ai_kb_deflection_rate",     label: "KB Deflection Rate",        desc: "Tickets resolved via KB / Total x 100%",           module: "ai_analytics",      unit: "percent", defaultVis: "gauge" },
  { key: "ai_top_issues",             label: "Top Issue Clusters",        desc: "Most common ticket topics from NLP",               module: "ai_analytics",      unit: "list",    defaultVis: "bar_chart" },
  { key: "ai_resolution_prediction",  label: "Resolution Time Forecast",  desc: "AI-forecasted resolution time per category",       module: "ai_analytics",      unit: "list",    defaultVis: "table" },

  // -- Alerts --
  { key: "al_active_alerts",          label: "Active Alerts",             desc: "Currently firing system alerts",                   module: "alerts",            unit: "count",   defaultVis: "kpi_tile" },
  { key: "al_resolved_alerts",        label: "Resolved Alerts",           desc: "Alerts resolved this period",                      module: "alerts",            unit: "count",   defaultVis: "kpi_tile" },
  { key: "al_critical_alerts",        label: "Critical Alerts",           desc: "High severity alerts",                             module: "alerts",            unit: "count",   defaultVis: "kpi_tile" },
  { key: "al_alert_resolution_rate",  label: "Alert Resolution Rate",     desc: "Resolved / Total alerts x 100%",                   module: "alerts",            unit: "percent", defaultVis: "gauge" },
  { key: "al_avg_alert_response",     label: "Avg Alert Response (hrs)",  desc: "Average time to acknowledge an alert",             module: "alerts",            unit: "hours",   defaultVis: "kpi_tile" },
  { key: "al_alerts_by_type",         label: "Alerts by Type",            desc: "Alert count grouped by type",                      module: "alerts",            unit: "list",    defaultVis: "bar_chart" },
  { key: "al_alert_trend",            label: "Alert Trend",               desc: "Daily alert volume over time",                     module: "alerts",            unit: "list",    defaultVis: "line_chart" },
];
'@

$newLines = @()
for ($i = 0; $i -lt $startIdx; $i++) {
    $newLines += $lines[$i]
}
$newLines += $newBlock.Split("`n")
for ($i = $endIdx + 1; $i -lt $lines.Length; $i++) {
    $newLines += $lines[$i]
}

[System.IO.File]::WriteAllLines($file, $newLines, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done. New line count: $($newLines.Length)"
