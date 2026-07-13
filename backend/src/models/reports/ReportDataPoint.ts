import mongoose, { Document, Schema } from "mongoose";

export type DataPointCategory =
  | "ticket"
  | "agent"
  | "customer"
  | "sla"
  | "channel"
  | "feedback"
  | "footfall"
  | "custom_form"
  | "user"
  | "asset"
  | "asset_audit"
  | "asset_inventory"
  | "service_request"
  | "call"
  | "inquiry";
export type FieldType = "string" | "number" | "date" | "boolean" | "array";

/** Base collection a data point is queried from. Existing points default to ticket. */
export type DataPointSource =
  | "ticket"
  | "user"
  | "asset"
  | "asset_audit"
  | "asset_inventory"
  | "feedback"
  | "service_request"
  | "call"
  | "inquiry";

/**
 * Registry of all available data points in the Report module.
 * These are seeded at startup and referenced by key throughout the system.
 * isSystem=true means the record cannot be deleted by users.
 */
export interface IReportDataPoint extends Document {
  key: string; // unique slug, e.g. 'ticket_number'
  label: string; // UI label, e.g. 'Ticket #'
  description: string;
  category: DataPointCategory;
  /** Base collection this data point reports from (default 'ticket'). */
  source?: DataPointSource;
  fieldPath: string; // computed field name after aggregation (not raw MongoDB path)
  fieldType: FieldType;
  isActive: boolean;
  isSystem: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReportDataPointSchema = new Schema<IReportDataPoint>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    label: { type: String, required: true },
    description: { type: String, default: "" },
    category: {
      type: String,
      enum: [
        "ticket",
        "agent",
        "customer",
        "sla",
        "channel",
        "feedback",
        "footfall",
        "custom_form",
        "user",
        "asset",
        "asset_audit",
        "asset_inventory",
        "service_request",
        "call",
        "inquiry",
      ],
      required: true,
    },
    source: {
      type: String,
      enum: [
        "ticket",
        "user",
        "asset",
        "asset_audit",
        "asset_inventory",
        "feedback",
        "service_request",
        "call",
        "inquiry",
      ],
      default: "ticket",
    },
    fieldPath: { type: String, required: true },
    fieldType: {
      type: String,
      enum: ["string", "number", "date", "boolean", "array"],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ReportDataPoint = mongoose.model<IReportDataPoint>(
  "ReportDataPoint",
  ReportDataPointSchema,
);

/** The canonical seed list for all system data points. Imported by the controller seed function. */
export const SYSTEM_DATA_POINTS: Omit<
  IReportDataPoint,
  keyof Document | "createdAt" | "updatedAt"
>[] = [
  // ── TICKET GROUP ───────────────────────────────────────────────────────────
  {
    key: "ticket_number",
    label: "Ticket #",
    description: "Unique ticket identifier",
    category: "ticket",
    fieldPath: "ticketNumber",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 1,
  },
  {
    key: "ticket_subject",
    label: "Subject",
    description: "Ticket title or subject line",
    category: "ticket",
    fieldPath: "subject",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 2,
  },
  {
    key: "ticket_status",
    label: "Status",
    description: "Current status (Open, In Progress, Resolved…)",
    category: "ticket",
    fieldPath: "statusLabel",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 3,
  },
  {
    key: "ticket_priority",
    label: "Priority",
    description: "Ticket priority level",
    category: "ticket",
    fieldPath: "priority",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 4,
  },
  {
    key: "ticket_category",
    label: "Category",
    description: "Category / sub-category hierarchy (full path)",
    category: "ticket",
    fieldPath: "categoryDisplay",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 5,
  },
  {
    key: "ticket_assigned_to",
    label: "Assigned Agent",
    description: "Full name of the assigned agent",
    category: "ticket",
    fieldPath: "assignedToName",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 6,
  },
  {
    key: "ticket_created_by",
    label: "Submitted By",
    description: "Full name of the ticket submitter",
    category: "ticket",
    fieldPath: "createdByName",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 7,
  },
  {
    key: "ticket_created_at",
    label: "Created Date",
    description: "Date and time the ticket was created",
    category: "ticket",
    fieldPath: "createdAt",
    fieldType: "date",
    isActive: true,
    isSystem: true,
    order: 8,
  },
  {
    key: "ticket_resolved_at",
    label: "Resolved Date",
    description: "Date and time the ticket was resolved",
    category: "ticket",
    fieldPath: "resolvedAt",
    fieldType: "date",
    isActive: true,
    isSystem: true,
    order: 9,
  },
  {
    key: "ticket_closed_at",
    label: "Closed Date",
    description: "Date and time the ticket was closed",
    category: "ticket",
    fieldPath: "closedAt",
    fieldType: "date",
    isActive: true,
    isSystem: true,
    order: 10,
  },
  {
    key: "ticket_resolution_time_hrs",
    label: "Resolution Time (hrs)",
    description: "Hours between ticket creation and resolution",
    category: "ticket",
    fieldPath: "resolutionTimeHrs",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 11,
  },
  {
    key: "ticket_sla_status",
    label: "SLA Status",
    description: "Whether the ticket met its SLA",
    category: "ticket",
    fieldPath: "slaStatus",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 12,
  },
  {
    key: "ticket_sla_due_at",
    label: "SLA Due Date",
    description: "SLA deadline for this ticket",
    category: "ticket",
    fieldPath: "slaDueAt",
    fieldType: "date",
    isActive: true,
    isSystem: true,
    order: 13,
  },
  {
    key: "ticket_sla_breached_at",
    label: "SLA Breached At",
    description: "Date the SLA was breached (if applicable)",
    category: "ticket",
    fieldPath: "slaBreachedAt",
    fieldType: "date",
    isActive: true,
    isSystem: true,
    order: 14,
  },
  {
    key: "ticket_source",
    label: "Source Channel",
    description: "How the ticket was submitted (email, portal…)",
    category: "ticket",
    fieldPath: "submissionSource",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 15,
  },
  {
    key: "ticket_tags",
    label: "Tags",
    description: "Tags attached to the ticket",
    category: "ticket",
    fieldPath: "tags",
    fieldType: "array",
    isActive: true,
    isSystem: true,
    order: 16,
  },
  {
    key: "ticket_project",
    label: "Project",
    description: "Project the ticket belongs to",
    category: "ticket",
    fieldPath: "projectName",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 17,
  },
  {
    key: "ticket_escalation_level",
    label: "Escalation Level",
    description: "Current escalation level number",
    category: "ticket",
    fieldPath: "currentEscalationLevelNumber",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 18,
  },
  {
    key: "ticket_assigned_via",
    label: "Assignment Method",
    description: "How the ticket was assigned (manual, round-robin…)",
    category: "ticket",
    fieldPath: "assignedVia",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 19,
  },
  {
    key: "ticket_escalation_count",
    label: "# Escalations",
    description: "Total number of times ticket was escalated",
    category: "ticket",
    fieldPath: "escalationCount",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 20,
  },

  // ── CUSTOMER / SUBMITTER GROUP ─────────────────────────────────────────────
  {
    key: "customer_name",
    label: "Customer Name",
    description: "Full name of the ticket submitter",
    category: "customer",
    fieldPath: "createdByName",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 30,
  },
  {
    key: "customer_email",
    label: "Customer Email",
    description: "Email address of the ticket submitter",
    category: "customer",
    fieldPath: "createdByEmail",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 31,
  },
  {
    key: "customer_department",
    label: "Department",
    description: "Submitter's department",
    category: "customer",
    fieldPath: "createdByDepartment",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 32,
  },
  {
    key: "customer_unique_id",
    label: "Student / Employee ID",
    description: "Submitter's unique identifier",
    category: "customer",
    fieldPath: "createdByUniqueId",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 33,
  },

  // ── SLA GROUP ──────────────────────────────────────────────────────────────
  {
    key: "sla_response_sla_hrs",
    label: "Response SLA (hrs)",
    description: "Expected first-response time from SLA rule",
    category: "sla",
    fieldPath: "responseSlaHrs",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 40,
  },
  {
    key: "sla_resolution_sla_hrs",
    label: "Resolution SLA (hrs)",
    description: "Expected resolution time from SLA rule",
    category: "sla",
    fieldPath: "resolutionSlaHrs",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 41,
  },

  // ── CHANNEL GROUP ─────────────────────────────────────────────────────────
  {
    key: "channel_source_email",
    label: "Source Email Address",
    description: "Inbound email address that created the ticket",
    category: "channel",
    fieldPath: "sourceEmail",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 50,
  },
  {
    key: "channel_offline_center",
    label: "Offline Center",
    description: "Walk-in center name for offline (in-person) tickets",
    category: "channel",
    fieldPath: "centerName",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 51,
  },
  {
    key: "channel_district",
    label: "District",
    description: "District of the ticket's centre (from the centre address)",
    category: "channel",
    fieldPath: "centerDistrict",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 52,
  },

  // ── AGENT GROUP ───────────────────────────────────────────────────────────
  {
    key: "agent_role_name",
    label: "Agent Role",
    description: "Role name of the agent assigned to the ticket",
    category: "agent",
    fieldPath: "assignedToRoleName",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 70,
  },

  // ── FEEDBACK GROUP ────────────────────────────────────────────────────────
  {
    key: "feedback_csat_score",
    label: "CSAT Score",
    description: "Customer satisfaction score from feedback form",
    category: "feedback",
    fieldPath: "csatScore",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 60,
  },
  {
    key: "feedback_comment",
    label: "Feedback Comment",
    description: "Free-text feedback comment left by customer",
    category: "feedback",
    fieldPath: "feedbackComment",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 61,
  },

  // ── FOOTFALL GROUP ────────────────────────────────────────────────────────
  {
    key: "student_portal_email",
    label: "Student Portal Email",
    description: "Email used by the student when submitting via portal",
    category: "footfall",
    fieldPath: "studentPortalEmail",
    fieldType: "string",
    isActive: true,
    isSystem: true,
    order: 90,
  },
  {
    key: "ticket_response_count",
    label: "Response Count",
    description: "Number of follow-up responses/comments on this ticket",
    category: "footfall",
    fieldPath: "responseCount",
    fieldType: "number",
    isActive: true,
    isSystem: true,
    order: 91,
  },

  // ── USER GROUP (source: user) ──────────────────────────────────────────────
  { key: "user_name", label: "Name", description: "User full name", category: "user", source: "user", fieldPath: "userName", fieldType: "string", isActive: true, isSystem: true, order: 200 },
  { key: "user_email", label: "Email", description: "User email address", category: "user", source: "user", fieldPath: "email", fieldType: "string", isActive: true, isSystem: true, order: 201 },
  { key: "user_mobile", label: "Mobile", description: "User mobile number", category: "user", source: "user", fieldPath: "mobile", fieldType: "string", isActive: true, isSystem: true, order: 202 },
  { key: "user_employee_code", label: "Employee Code", description: "Employee / staff code", category: "user", source: "user", fieldPath: "employeeCode", fieldType: "string", isActive: true, isSystem: true, order: 203 },
  { key: "user_role", label: "Role", description: "Assigned role name", category: "user", source: "user", fieldPath: "roleName", fieldType: "string", isActive: true, isSystem: true, order: 204 },
  { key: "user_department", label: "Department", description: "User department", category: "user", source: "user", fieldPath: "department", fieldType: "string", isActive: true, isSystem: true, order: 205 },
  { key: "user_payroll_type", label: "Payroll Type", description: "Internal / external payroll", category: "user", source: "user", fieldPath: "payrollType", fieldType: "string", isActive: true, isSystem: true, order: 206 },
  { key: "user_projects", label: "Projects", description: "Projects the user belongs to", category: "user", source: "user", fieldPath: "projectNames", fieldType: "string", isActive: true, isSystem: true, order: 207 },
  { key: "user_centers", label: "Centers", description: "Centers assigned to the user", category: "user", source: "user", fieldPath: "centerNames", fieldType: "string", isActive: true, isSystem: true, order: 208 },
  { key: "user_status", label: "Status", description: "Active / Inactive", category: "user", source: "user", fieldPath: "statusLabel", fieldType: "string", isActive: true, isSystem: true, order: 209 },
  { key: "user_last_login", label: "Last Login", description: "Last login date/time", category: "user", source: "user", fieldPath: "lastLogin", fieldType: "date", isActive: true, isSystem: true, order: 210 },
  { key: "user_created_at", label: "Created Date", description: "Account creation date", category: "user", source: "user", fieldPath: "createdAt", fieldType: "date", isActive: true, isSystem: true, order: 211 },

  // ── ASSET GROUP (source: asset) ────────────────────────────────────────────
  { key: "asset_name", label: "Asset Name", description: "Name of the asset", category: "asset", source: "asset", fieldPath: "name", fieldType: "string", isActive: true, isSystem: true, order: 300 },
  { key: "asset_category", label: "Asset Category", description: "Asset category", category: "asset", source: "asset", fieldPath: "categoryName", fieldType: "string", isActive: true, isSystem: true, order: 301 },
  { key: "asset_count", label: "Predefined Count", description: "Configured asset quantity", category: "asset", source: "asset", fieldPath: "predefinedCount", fieldType: "number", isActive: true, isSystem: true, order: 302 },
  { key: "asset_unit", label: "Unit", description: "Unit of measure", category: "asset", source: "asset", fieldPath: "unit", fieldType: "string", isActive: true, isSystem: true, order: 303 },
  { key: "asset_project", label: "Project", description: "Project the asset belongs to", category: "asset", source: "asset", fieldPath: "projectName", fieldType: "string", isActive: true, isSystem: true, order: 304 },
  { key: "asset_status", label: "Status", description: "Active / Inactive", category: "asset", source: "asset", fieldPath: "statusLabel", fieldType: "string", isActive: true, isSystem: true, order: 305 },
  { key: "asset_created_at", label: "Created Date", description: "When the asset was created", category: "asset", source: "asset", fieldPath: "createdAt", fieldType: "date", isActive: true, isSystem: true, order: 306 },

  // ── ASSET AUDIT GROUP (source: asset_audit) ────────────────────────────────
  { key: "audit_asset_name", label: "Asset", description: "Audited asset name", category: "asset_audit", source: "asset_audit", fieldPath: "assetName", fieldType: "string", isActive: true, isSystem: true, order: 400 },
  { key: "audit_center", label: "Offline Center", description: "Offline center where the audit happened", category: "asset_audit", source: "asset_audit", fieldPath: "centerName", fieldType: "string", isActive: true, isSystem: true, order: 401 },
  { key: "audit_change_type", label: "Change Type", description: "working / not-working / both", category: "asset_audit", source: "asset_audit", fieldPath: "changeType", fieldType: "string", isActive: true, isSystem: true, order: 402 },
  { key: "audit_prev_working", label: "Prev Working", description: "Working count before change", category: "asset_audit", source: "asset_audit", fieldPath: "prevWorking", fieldType: "number", isActive: true, isSystem: true, order: 403 },
  { key: "audit_prev_notworking", label: "Prev Not-Working", description: "Not-working count before change", category: "asset_audit", source: "asset_audit", fieldPath: "prevNotWorking", fieldType: "number", isActive: true, isSystem: true, order: 404 },
  { key: "audit_curr_working", label: "New Working", description: "Working count after change", category: "asset_audit", source: "asset_audit", fieldPath: "currWorking", fieldType: "number", isActive: true, isSystem: true, order: 405 },
  { key: "audit_curr_notworking", label: "New Not-Working", description: "Not-working count after change", category: "asset_audit", source: "asset_audit", fieldPath: "currNotWorking", fieldType: "number", isActive: true, isSystem: true, order: 406 },
  { key: "audit_changed_by", label: "Changed By", description: "User who made the change", category: "asset_audit", source: "asset_audit", fieldPath: "changedByName", fieldType: "string", isActive: true, isSystem: true, order: 407 },
  { key: "audit_changed_at", label: "Changed At", description: "When the audit change was made", category: "asset_audit", source: "asset_audit", fieldPath: "changedAt", fieldType: "date", isActive: true, isSystem: true, order: 408 },
  { key: "audit_remarks", label: "Remarks", description: "Audit remarks/notes", category: "asset_audit", source: "asset_audit", fieldPath: "remarks", fieldType: "string", isActive: true, isSystem: true, order: 409 },

  // ── ASSET INVENTORY GROUP (source: asset_inventory — CenterAssetMapping) ────
  { key: "inv_asset_name", label: "Asset", description: "Asset name", category: "asset_inventory", source: "asset_inventory", fieldPath: "assetName", fieldType: "string", isActive: true, isSystem: true, order: 450 },
  { key: "inv_center", label: "Offline Center", description: "Offline center the asset is mapped to", category: "asset_inventory", source: "asset_inventory", fieldPath: "centerName", fieldType: "string", isActive: true, isSystem: true, order: 451 },
  { key: "inv_project", label: "Project", description: "Project", category: "asset_inventory", source: "asset_inventory", fieldPath: "projectName", fieldType: "string", isActive: true, isSystem: true, order: 452 },
  { key: "inv_total_assigned", label: "Total Assigned", description: "Total assets assigned", category: "asset_inventory", source: "asset_inventory", fieldPath: "totalAssigned", fieldType: "number", isActive: true, isSystem: true, order: 453 },
  { key: "inv_used", label: "Used", description: "Assets in use", category: "asset_inventory", source: "asset_inventory", fieldPath: "assetUsed", fieldType: "number", isActive: true, isSystem: true, order: 454 },
  { key: "inv_not_used", label: "Not Used", description: "Assets not in use", category: "asset_inventory", source: "asset_inventory", fieldPath: "assetNotUsed", fieldType: "number", isActive: true, isSystem: true, order: 455 },
  { key: "inv_working", label: "Working", description: "Working asset count", category: "asset_inventory", source: "asset_inventory", fieldPath: "workingAsset", fieldType: "number", isActive: true, isSystem: true, order: 456 },
  { key: "inv_not_working", label: "Not Working", description: "Not-working asset count", category: "asset_inventory", source: "asset_inventory", fieldPath: "notWorkingAsset", fieldType: "number", isActive: true, isSystem: true, order: 457 },
  { key: "inv_remark", label: "Remark", description: "Inventory remark/notes", category: "asset_inventory", source: "asset_inventory", fieldPath: "remark", fieldType: "string", isActive: true, isSystem: true, order: 458 },
  { key: "inv_audit_submitted", label: "Audit Submitted", description: "Whether the current audit cycle is submitted", category: "asset_inventory", source: "asset_inventory", fieldPath: "auditSubmittedLabel", fieldType: "string", isActive: true, isSystem: true, order: 459 },
  { key: "inv_last_audit_submitted_by", label: "Audit Submitted By", description: "Who submitted the last audit", category: "asset_inventory", source: "asset_inventory", fieldPath: "auditSubmittedByName", fieldType: "string", isActive: true, isSystem: true, order: 460 },
  { key: "inv_last_audit_submitted_at", label: "Audit Submitted At", description: "When the last audit was submitted", category: "asset_inventory", source: "asset_inventory", fieldPath: "lastAuditSubmittedAt", fieldType: "date", isActive: true, isSystem: true, order: 461 },
  { key: "inv_last_audit_date", label: "Last Audit Date", description: "Configured last audit date", category: "asset_inventory", source: "asset_inventory", fieldPath: "lastAuditDate", fieldType: "date", isActive: true, isSystem: true, order: 462 },
  { key: "inv_next_audit_date", label: "Next Audit Date", description: "When the next audit is due", category: "asset_inventory", source: "asset_inventory", fieldPath: "nextAuditDate", fieldType: "date", isActive: true, isSystem: true, order: 463 },
  { key: "inv_audit_frequency", label: "Audit Frequency (months)", description: "Audit frequency in months", category: "asset_inventory", source: "asset_inventory", fieldPath: "auditFrequencyMonths", fieldType: "number", isActive: true, isSystem: true, order: 464 },
  { key: "inv_updated_by", label: "Last Updated By", description: "Who last updated this inventory record", category: "asset_inventory", source: "asset_inventory", fieldPath: "updatedByName", fieldType: "string", isActive: true, isSystem: true, order: 465 },
  { key: "inv_updated_at", label: "Last Updated At", description: "When the inventory record was last updated", category: "asset_inventory", source: "asset_inventory", fieldPath: "updatedAt", fieldType: "date", isActive: true, isSystem: true, order: 466 },

  // ── FEEDBACK GROUP (source: feedback — direct from FeedbackResponse) ────────
  { key: "fbr_rating", label: "Overall Rating", description: "Overall feedback rating", category: "feedback", source: "feedback", fieldPath: "rating", fieldType: "number", isActive: true, isSystem: true, order: 500 },
  { key: "fbr_submitted_at", label: "Submitted Date", description: "When the feedback was submitted", category: "feedback", source: "feedback", fieldPath: "submittedAt", fieldType: "date", isActive: true, isSystem: true, order: 501 },
  { key: "fbr_ticket_number", label: "Ticket #", description: "Ticket the feedback is for", category: "feedback", source: "feedback", fieldPath: "ticketNumber", fieldType: "string", isActive: true, isSystem: true, order: 502 },
  { key: "fbr_submitter", label: "Submitted By", description: "Student / submitter name", category: "feedback", source: "feedback", fieldPath: "submitterName", fieldType: "string", isActive: true, isSystem: true, order: 503 },
  { key: "fbr_project", label: "Project", description: "Project the feedback belongs to", category: "feedback", source: "feedback", fieldPath: "projectName", fieldType: "string", isActive: true, isSystem: true, order: 504 },
  { key: "fbr_form", label: "Feedback Form", description: "Name of the feedback form", category: "feedback", source: "feedback", fieldPath: "formName", fieldType: "string", isActive: true, isSystem: true, order: 505 },
  { key: "fbr_answers_count", label: "# Answers", description: "Number of answered questions", category: "feedback", source: "feedback", fieldPath: "answersCount", fieldType: "number", isActive: true, isSystem: true, order: 506 },
  { key: "fbr_answers", label: "Answers", description: "All question/answer pairs", category: "feedback", source: "feedback", fieldPath: "answersText", fieldType: "string", isActive: true, isSystem: true, order: 507 },
  { key: "fbr_center", label: "Offline Center", description: "Offline center of the ticket this feedback is for", category: "feedback", source: "feedback", fieldPath: "centerName", fieldType: "string", isActive: true, isSystem: true, order: 508 },
  { key: "fbr_district", label: "District", description: "District of the ticket's offline center", category: "feedback", source: "feedback", fieldPath: "centerDistrict", fieldType: "string", isActive: true, isSystem: true, order: 509 },

  // ── SERVICE REQUEST GROUP (source: ticket — PSR/ISR live on the ticket spine) ─
  { key: "sr_interaction_type", label: "Request Type", description: "Normal / PSR / ISR (interaction type)", category: "service_request", source: "ticket", fieldPath: "interactionTypeLabel", fieldType: "string", isActive: true, isSystem: true, order: 600 },
  { key: "sr_cancelled", label: "Cancelled?", description: "Whether the SR was cancelled", category: "service_request", source: "ticket", fieldPath: "srCancelledLabel", fieldType: "string", isActive: true, isSystem: true, order: 601 },
  { key: "sr_cancel_reason", label: "Cancellation Reason", description: "Reason captured when the SR was cancelled", category: "service_request", source: "ticket", fieldPath: "srCancelReason", fieldType: "string", isActive: true, isSystem: true, order: 602 },
  { key: "sr_reopened", label: "Re-opened?", description: "Whether the SR was re-opened", category: "service_request", source: "ticket", fieldPath: "srReopenedLabel", fieldType: "string", isActive: true, isSystem: true, order: 603 },
  { key: "sr_reopen_count", label: "Re-open Count", description: "Number of times the SR was re-opened", category: "service_request", source: "ticket", fieldPath: "srReopenCount", fieldType: "number", isActive: true, isSystem: true, order: 604 },
  { key: "sr_wip_committed_date", label: "WIP Committed Date", description: "Committed closure date set during WIP", category: "service_request", source: "ticket", fieldPath: "srWipCommittedDate", fieldType: "date", isActive: true, isSystem: true, order: 605 },
  { key: "sr_wip_revision_count", label: "WIP Revisions", description: "Number of committed-date revisions", category: "service_request", source: "ticket", fieldPath: "srWipRevisionCount", fieldType: "number", isActive: true, isSystem: true, order: 606 },
  { key: "sr_parent_satisfied", label: "Parent Satisfaction", description: "Parent closure feedback (Satisfied / Not satisfied)", category: "service_request", source: "ticket", fieldPath: "srParentSatisfiedLabel", fieldType: "string", isActive: true, isSystem: true, order: 607 },
  { key: "sr_auto_closed", label: "Auto-closed?", description: "Whether an auto-close rule closed the SR on creation", category: "service_request", source: "ticket", fieldPath: "srAutoClosedLabel", fieldType: "string", isActive: true, isSystem: true, order: 608 },
  { key: "sr_sla_source", label: "SLA Source", description: "Which SLA drove the TAT (category / priority / default)", category: "service_request", source: "ticket", fieldPath: "srSlaSource", fieldType: "string", isActive: true, isSystem: true, order: 609 },
];
