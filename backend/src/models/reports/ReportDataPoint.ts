import mongoose, { Document, Schema } from "mongoose";

export type DataPointCategory =
  | "ticket"
  | "agent"
  | "customer"
  | "sla"
  | "channel"
  | "feedback"
  | "footfall"
  | "custom_form";
export type FieldType = "string" | "number" | "date" | "boolean" | "array";

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
      ],
      required: true,
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
    description: "Category / sub-category hierarchy",
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
];
