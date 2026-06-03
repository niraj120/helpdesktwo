// @ts-nocheck
import mongoose from "mongoose";
import { IReportFilter } from "../models/reports/SavedReport";

/**
 * Maps a data point key to the computed field name that appears in the
 * aggregation pipeline after $addFields.
 */
export const DATA_POINT_FIELD_MAP: Record<string, string> = {
  // Ticket
  ticket_number: "ticketNumber",
  ticket_subject: "subject",
  ticket_status: "statusLabel",
  ticket_priority: "priority",
  ticket_category: "categoryDisplay",
  ticket_assigned_to: "assignedToName",
  ticket_created_by: "createdByName",
  ticket_created_at: "createdAt",
  ticket_resolved_at: "resolvedAt",
  ticket_closed_at: "closedAt",
  ticket_resolution_time_hrs: "resolutionTimeHrs",
  ticket_sla_status: "slaStatus",
  ticket_sla_due_at: "slaDueAt",
  ticket_sla_breached_at: "slaBreachedAt",
  ticket_source: "submissionSource",
  ticket_tags: "tags",
  ticket_project: "projectName",
  ticket_escalation_level: "currentEscalationLevelNumber",
  ticket_assigned_via: "assignedVia",
  ticket_escalation_count: "escalationCount",
  // Customer
  customer_name: "createdByName",
  customer_email: "createdByEmail",
  customer_department: "createdByDepartment",
  customer_unique_id: "createdByUniqueId",
  // SLA (joined via slaRuleId lookup if available, else null)
  sla_response_sla_hrs: "responseSlaHrs",
  sla_resolution_sla_hrs: "resolutionSlaHrs",
  // Channel
  channel_source_email: "sourceEmail",
  channel_offline_center: "centerName",
  // Agent
  agent_role_name: "assignedToRoleName",
  // Feedback (joined from FeedbackResponse)
  feedback_csat_score: "csatScore",
  feedback_comment: "feedbackComment",
  // Footfall
  student_portal_email: "studentPortalEmail",
  ticket_response_count: "responseCount",
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converts a single IReportFilter into a MongoDB $match expression.
 * The field must already be the computed name (from DATA_POINT_FIELD_MAP).
 */
function filterToMongo(
  field: string,
  operator: string,
  value: any,
  value2?: any,
): any {
  switch (operator) {
    case "equals":
      return { [field]: { $eq: value } };
    case "not_equals":
      return { [field]: { $ne: value } };
    case "contains":
      return { [field]: { $regex: escapeRegex(String(value)), $options: "i" } };
    case "not_contains":
      return {
        [field]: {
          $not: { $regex: escapeRegex(String(value)), $options: "i" },
        },
      };
    case "greater_than":
      return {
        [field]: {
          $gt: isNaN(Number(value)) ? new Date(value) : Number(value),
        },
      };
    case "less_than":
      return {
        [field]: {
          $lt: isNaN(Number(value)) ? new Date(value) : Number(value),
        },
      };
    case "between":
      return { [field]: { $gte: new Date(value), $lte: new Date(value2) } };
    case "in":
      if (Array.isArray(value)) return { [field]: { $in: value } };
      if (typeof value === "string" && value.includes(","))
        return { [field]: { $in: value.split(",").filter(Boolean) } };
      return { [field]: { $in: [value] } };
    case "is_empty":
      return { [field]: { $in: [null, "", []] } };
    case "is_not_empty":
      return { [field]: { $nin: [null, "", []] } };
    default:
      return {};
  }
}

/**
 * Builds and executes a MongoDB aggregation pipeline for a saved report.
 *
 * @param dataPoints  - RBAC-filtered list of data point keys to return
 * @param filters     - filter conditions from the saved report
 * @param sortBy      - data point key to sort by
 * @param sortOrder   - 'asc' | 'desc'
 * @param projectId   - optional project scope
 * @param page        - 1-based page number
 * @param pageSize    - rows per page
 * @returns { rows, total }
 */
export async function runReportQuery(
  dataPoints: string[],
  filters: IReportFilter[],
  sortBy?: string,
  sortOrder: string = "desc",
  projectId?: string,
  page: number = 1,
  pageSize: number = 100,
): Promise<{ rows: any[]; total: number }> {
  const Ticket = mongoose.model("Ticket");

  // ── 1. Base match ─────────────────────────────────────────────────────────
  const baseMatch: any = { isMerged: { $ne: true } };
  if (projectId) {
    // metadata.projectId may be stored as ObjectId or string — match both
    const oid = new mongoose.Types.ObjectId(projectId);
    baseMatch.$or = [
      { "metadata.projectId": oid },
      { "metadata.projectId": projectId },
    ];
  }

  // ── 2. Lookups ────────────────────────────────────────────────────────────
  const lookups: any[] = [
    {
      $lookup: {
        from: "users",
        localField: "assignedTo",
        foreignField: "_id",
        as: "_assignedUser",
        pipeline: [
          {
            $lookup: {
              from: "roles",
              localField: "role",
              foreignField: "_id",
              as: "_roleDoc",
              pipeline: [{ $project: { name: 1, code: 1 } }],
            },
          },
          {
            $addFields: {
              roleName: {
                $ifNull: [{ $arrayElemAt: ["$_roleDoc.name", 0] }, ""],
              },
              roleCode: {
                $ifNull: [{ $arrayElemAt: ["$_roleDoc.code", 0] }, ""],
              },
            },
          },
          {
            $project: {
              firstName: 1,
              lastName: 1,
              email: 1,
              roleName: 1,
              roleCode: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "_createdByUser",
        pipeline: [
          {
            $project: {
              firstName: 1,
              lastName: 1,
              email: 1,
              department: 1,
              uniqueId: 1,
            },
          },
        ],
      },
    },
    {
      // Use pipeline-based lookup so we can compare string-to-string, handling
      // tickets where metadata.projectId was stored as a string instead of ObjectId
      $lookup: {
        from: "projects",
        let: { pid: "$metadata.projectId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [{ $toString: "$_id" }, { $toString: "$$pid" }],
              },
            },
          },
          { $project: { name: 1 } },
        ],
        as: "_projectData",
      },
    },
    // Optional: join feedback responses (left join on ticketId)
    {
      $lookup: {
        from: "feedbackresponses",
        localField: "_id",
        foreignField: "ticketId",
        as: "_feedbackData",
        pipeline: [
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { rating: 1, comment: 1 } },
        ],
      },
    },
    // Optional: join SLA rules for sla_response_sla_hrs / sla_resolution_sla_hrs
    {
      $lookup: {
        from: "slarules",
        localField: "slaRuleId",
        foreignField: "_id",
        as: "_slaRule",
        pipeline: [{ $project: { responseTime: 1, resolutionTime: 1 } }],
      },
    },
    // Center lookup for offline tickets
    {
      $lookup: {
        from: "centers",
        localField: "metadata.centerId",
        foreignField: "_id",
        as: "_centerData",
        pipeline: [{ $project: { centerName: 1 } }],
      },
    },
  ];

  // ── 3. $addFields — compute derived columns ───────────────────────────────
  const addFields = {
    $addFields: {
      assignedToName: {
        $cond: {
          if: { $gt: [{ $size: "$_assignedUser" }, 0] },
          then: {
            $trim: {
              input: {
                $concat: [
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$_assignedUser.firstName", 0] },
                      "",
                    ],
                  },
                  " ",
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$_assignedUser.lastName", 0] },
                      "",
                    ],
                  },
                ],
              },
            },
          },
          else: "Unassigned",
        },
      },
      createdByName: {
        $trim: {
          input: {
            $concat: [
              {
                $ifNull: [
                  { $arrayElemAt: ["$_createdByUser.firstName", 0] },
                  "",
                ],
              },
              " ",
              {
                $ifNull: [
                  { $arrayElemAt: ["$_createdByUser.lastName", 0] },
                  "",
                ],
              },
            ],
          },
        },
      },
      createdByEmail: {
        $ifNull: [{ $arrayElemAt: ["$_createdByUser.email", 0] }, ""],
      },
      createdByDepartment: {
        $ifNull: [{ $arrayElemAt: ["$_createdByUser.department", 0] }, ""],
      },
      createdByUniqueId: {
        $ifNull: [{ $arrayElemAt: ["$_createdByUser.uniqueId", 0] }, ""],
      },
      projectName: {
        $ifNull: [{ $arrayElemAt: ["$_projectData.name", 0] }, ""],
      },
      statusLabel: {
        $switch: {
          branches: [
            { case: { $eq: ["$status", 1] }, then: "Open" },
            { case: { $eq: ["$status", 2] }, then: "In Progress" },
            { case: { $eq: ["$status", 3] }, then: "On Hold" },
            { case: { $eq: ["$status", 4] }, then: "Resolved" },
            { case: { $eq: ["$status", 5] }, then: "Closed" },
          ],
          default: "Unknown",
        },
      },
      categoryDisplay: {
        $ifNull: ["$categoryHierarchy.displayPath", "$category"],
      },
      slaDueAt: { $ifNull: ["$roleLevelSLA.dueAt", "$ticketLevelSLA.dueAt"] },
      slaBreachedAt: {
        $ifNull: ["$roleLevelSLA.breachedAt", "$ticketLevelSLA.breachedAt"],
      },
      slaStatus: {
        $cond: {
          if: {
            $or: [
              { $ifNull: ["$roleLevelSLA.breachedAt", false] },
              { $ifNull: ["$ticketLevelSLA.breachedAt", false] },
            ],
          },
          then: "Breached",
          else: "Within SLA",
        },
      },
      resolutionTimeHrs: {
        $cond: {
          if: {
            $and: [
              { $ifNull: ["$resolvedAt", false] },
              { $ifNull: ["$createdAt", false] },
            ],
          },
          then: {
            $round: [
              {
                $divide: [
                  { $subtract: ["$resolvedAt", "$createdAt"] },
                  3_600_000,
                ],
              },
              1,
            ],
          },
          else: null,
        },
      },
      escalationCount: { $size: { $ifNull: ["$escalationHistory", []] } },
      assignedToRoleName: {
        $ifNull: [{ $arrayElemAt: ["$_assignedUser.roleName", 0] }, ""],
      },
      centerName: {
        $ifNull: [{ $arrayElemAt: ["$_centerData.centerName", 0] }, ""],
      },
      csatScore: {
        $ifNull: [{ $arrayElemAt: ["$_feedbackData.rating", 0] }, null],
      },
      feedbackComment: {
        $ifNull: [{ $arrayElemAt: ["$_feedbackData.comment", 0] }, ""],
      },
      responseSlaHrs: {
        $ifNull: [{ $arrayElemAt: ["$_slaRule.responseTime.value", 0] }, null],
      },
      resolutionSlaHrs: {
        $ifNull: [
          { $arrayElemAt: ["$_slaRule.resolutionTime.value", 0] },
          null,
        ],
      },
      // Footfall computed fields
      studentPortalEmail: { $ifNull: ["$metadata.studentEmail", ""] },
      responseCount: { $size: { $ifNull: ["$comments", []] } },
    },
  };

  // ── Dynamic custom form field additions ───────────────────────────────────
  // For any dataPoint key starting with "custom_field_", we derive the value
  // from ticket.metadata.customFields.{fieldName} and add it as a computed
  // field so the $project and row-mapping stages can reference it.
  const fieldMap: Record<string, string> = { ...DATA_POINT_FIELD_MAP };
  for (const key of dataPoints) {
    if (key.startsWith("custom_field_")) {
      const rawName = key.replace(/^custom_field_/, "");
      const computedName = `customField_${rawName}`;
      fieldMap[key] = computedName;
      (addFields.$addFields as any)[computedName] = {
        $ifNull: [`$metadata.customFields.${rawName}`, ""],
      };
    }
  }

  // ── 4. Post-compute $match for filters ────────────────────────────────────
  // Group by mongo field: multiple conditions on the SAME field are OR'd
  // (e.g. two project filters → any-of), different fields are AND'd.
  const fieldConditionGroups = new Map<string, any[]>();
  for (const f of filters) {
    const fieldName = fieldMap[f.field] ?? f.field;
    const expr = filterToMongo(fieldName, f.operator, f.value, f.value2);
    if (Object.keys(expr).length === 0) continue;
    if (!fieldConditionGroups.has(fieldName))
      fieldConditionGroups.set(fieldName, []);
    fieldConditionGroups.get(fieldName)!.push(expr);
  }
  const filterConditions: any[] = [];
  for (const [, exprs] of fieldConditionGroups) {
    filterConditions.push(exprs.length === 1 ? exprs[0] : { $or: exprs });
  }

  // ── 5. $project — only requested columns ─────────────────────────────────
  const projectStage: any = { _id: 1 };
  for (const key of dataPoints) {
    const field = fieldMap[key];
    if (field) projectStage[field] = 1;
  }

  // ── 6. Sort ───────────────────────────────────────────────────────────────
  const sortField = (sortBy && fieldMap[sortBy]) ?? "createdAt";
  const sortDir = sortOrder === "asc" ? 1 : -1;

  // ── Assemble pipeline ─────────────────────────────────────────────────────
  const pipeline: any[] = [
    { $match: baseMatch },
    ...lookups,
    addFields,
    ...(filterConditions.length
      ? [{ $match: { $and: filterConditions } }]
      : []),
    { $project: projectStage },
    { $sort: { [sortField]: sortDir } },
  ];

  // Count before pagination
  const countPipeline = [...pipeline, { $count: "total" }];
  const countResult = await Ticket.aggregate(countPipeline);
  const total: number = countResult[0]?.total ?? 0;

  // Add pagination
  pipeline.push({ $skip: (page - 1) * pageSize });
  pipeline.push({ $limit: pageSize });

  const rawRows = await Ticket.aggregate(pipeline);

  const rows = rawRows.map((row) => {
    const out: any = { _id: row._id };
    for (const key of dataPoints) {
      const field = fieldMap[key];
      if (field) out[key] = row[field] ?? null;
    }
    return out;
  });

  return { rows, total };
}

/**
 * Strips data points from the report that the user's role is not allowed to see.
 * Super-admin bypasses this check.
 */
export function applyDataPointRbac(
  requestedKeys: string[],
  allowedKeys: string[],
  isSuperAdmin: boolean,
): string[] {
  if (isSuperAdmin) return requestedKeys;
  return requestedKeys.filter((k) => allowedKeys.includes(k));
}
