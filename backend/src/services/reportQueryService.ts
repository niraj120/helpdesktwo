// @ts-nocheck
import mongoose from "mongoose";
import { IReportFilter } from "../models/reports/SavedReport";
import { SYSTEM_DATA_POINTS } from "../models/reports/ReportDataPoint";

/** key → base source, derived from the data-point registry (default 'ticket'). */
export const SOURCE_BY_KEY: Record<string, string> = Object.fromEntries(
  SYSTEM_DATA_POINTS.map((dp: any) => [dp.key, dp.source || "ticket"]),
);

/** Infer the report's source from its selected data points (first non-ticket wins). */
export function inferSource(dataPoints: string[]): string {
  for (const k of dataPoints) {
    const s = SOURCE_BY_KEY[k];
    if (s && s !== "ticket") return s;
  }
  return "ticket";
}

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
  ticket_category_level_1: "categoryLevel1Name",
  ticket_category_level_2: "categoryLevel2Name",
  ticket_category_level_3: "categoryLevel3Name",
  ticket_category_level_4: "categoryLevel4Name",
  ticket_category_level_5: "categoryLevel5Name",
  ticket_category_level_6: "categoryLevel6Name",
  ticket_category_level_7: "categoryLevel7Name",
  ticket_category_level_8: "categoryLevel8Name",
  ticket_category_level_9: "categoryLevel9Name",
  ticket_category_level_10: "categoryLevel10Name",
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
  // Service Request (PSR/ISR) — all in the Ticket collection
  sr_interaction_type: "interactionTypeLabel",
  sr_cancelled: "srCancelledLabel",
  sr_cancel_reason: "srCancelReason",
  sr_reopened: "srReopenedLabel",
  sr_reopen_count: "srReopenCount",
  sr_wip_committed_date: "srWipCommittedDate",
  sr_wip_revision_count: "srWipRevisionCount",
  sr_parent_satisfied: "srParentSatisfiedLabel",
  sr_auto_closed: "srAutoClosedLabel",
  sr_sla_source: "srSlaSource",
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
  channel_district: "centerDistrict",
  // Agent
  agent_role_name: "assignedToRoleName",
  // Feedback (joined from FeedbackResponse)
  feedback_csat_score: "csatScore",
  feedback_comment: "feedbackComment",
  // Footfall
  student_portal_email: "studentPortalEmail",
  ticket_response_count: "responseCount",
  // User source
  user_name: "userName",
  user_email: "email",
  user_mobile: "mobile",
  user_employee_code: "employeeCode",
  user_role: "roleName",
  user_department: "department",
  user_payroll_type: "payrollType",
  user_projects: "projectNames",
  user_centers: "centerNames",
  user_status: "statusLabel",
  user_last_login: "lastLogin",
  user_created_at: "createdAt",
  // Asset source
  asset_name: "name",
  asset_category: "categoryName",
  asset_count: "predefinedCount",
  asset_unit: "unit",
  asset_project: "projectName",
  asset_status: "statusLabel",
  asset_created_at: "createdAt",
  // Asset audit source
  audit_asset_name: "assetName",
  audit_center: "centerName",
  audit_change_type: "changeType",
  audit_prev_working: "prevWorking",
  audit_prev_notworking: "prevNotWorking",
  audit_curr_working: "currWorking",
  audit_curr_notworking: "currNotWorking",
  audit_changed_by: "changedByName",
  audit_changed_at: "changedAt",
  audit_remarks: "remarks",
  // Asset inventory source (CenterAssetMapping)
  inv_asset_name: "assetName",
  inv_center: "centerName",
  inv_project: "projectName",
  inv_total_assigned: "totalAssigned",
  inv_used: "assetUsed",
  inv_not_used: "assetNotUsed",
  inv_working: "workingAsset",
  inv_not_working: "notWorkingAsset",
  inv_remark: "remark",
  inv_audit_submitted: "auditSubmittedLabel",
  inv_last_audit_submitted_by: "auditSubmittedByName",
  inv_last_audit_submitted_at: "lastAuditSubmittedAt",
  inv_last_audit_date: "lastAuditDate",
  inv_next_audit_date: "nextAuditDate",
  inv_audit_frequency: "auditFrequencyMonths",
  inv_updated_by: "updatedByName",
  inv_updated_at: "updatedAt",
  // Feedback source (direct from FeedbackResponse)
  fbr_rating: "rating",
  fbr_submitted_at: "submittedAt",
  fbr_ticket_number: "ticketNumber",
  fbr_submitter: "submitterName",
  fbr_project: "projectName",
  fbr_form: "formName",
  fbr_answers_count: "answersCount",
  fbr_answers: "answersText",
  fbr_center: "centerName",
  fbr_district: "centerDistrict",
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
 * Anything declared in the data-point registry that is not spelled out above
 * maps key -> fieldPath directly. New data points therefore need declaring in
 * one place only, and the map above stays as the record of the older columns
 * whose computed name differs from their key.
 */
for (const dp of SYSTEM_DATA_POINTS as any[]) {
  if (!DATA_POINT_FIELD_MAP[dp.key]) DATA_POINT_FIELD_MAP[dp.key] = dp.fieldPath;
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
  // Non-ticket sources (User / Asset / Asset-Audit / Feedback / Call) use a
  // dedicated pipeline against a different base collection.
  //
  // Service requests are the exception: they live on the ticket spine, so they
  // run the ticket pipeline — but the report is narrowed to PSR/ISR, which is
  // what someone picking the Service Requests source is asking for.
  const source = inferSource(dataPoints);
  const isSrReport = source === "service_request";
  if (source !== "ticket" && !isSrReport) {
    return runNonTicketQuery(
      source,
      dataPoints,
      filters,
      sortBy,
      sortOrder,
      projectId,
      page,
      pageSize,
    );
  }

  const Ticket = mongoose.model("Ticket");

  // ── 1. Base match ─────────────────────────────────────────────────────────
  // Merged-away requests are left out by default so totals are not counted
  // twice; a report that asks about merging obviously wants them included.
  const wantsMerged = dataPoints.some((k) =>
    ["sr_merged", "sr_merged_into"].includes(k),
  );
  const baseMatch: any = wantsMerged ? {} : { isMerged: { $ne: true } };
  if (isSrReport) baseMatch.interactionType = { $in: ["PSR", "ISR"] };
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
          { $project: { overallRating: 1, answers: 1 } },
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
    // Center lookup for offline tickets.
    // metadata.centerId is stored as a STRING but centers._id is an ObjectId,
    // so a plain localField/foreignField join never matches. Convert the string
    // to an ObjectId inside the pipeline ($convert with onError/onNull => null
    // safely handles online tickets that have no/invalid centerId).
    {
      $lookup: {
        from: "centers",
        let: { cid: "$metadata.centerId" },
        as: "_centerData",
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  "$_id",
                  {
                    $convert: {
                      input: "$$cid",
                      to: "objectId",
                      onError: null,
                      onNull: null,
                    },
                  },
                ],
              },
            },
          },
          { $project: { centerName: 1, city: 1 } },
        ],
      },
    },
    // Category hierarchy levels → category names (for per-level report columns).
    { $lookup: { from: "categories", localField: "categoryHierarchy.level1", foreignField: "_id", as: "_catL1", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level2", foreignField: "_id", as: "_catL2", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level3", foreignField: "_id", as: "_catL3", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level4", foreignField: "_id", as: "_catL4", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level5", foreignField: "_id", as: "_catL5", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level6", foreignField: "_id", as: "_catL6", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level7", foreignField: "_id", as: "_catL7", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level8", foreignField: "_id", as: "_catL8", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level9", foreignField: "_id", as: "_catL9", pipeline: [{ $project: { name: 1 } }] } },
    { $lookup: { from: "categories", localField: "categoryHierarchy.level10", foreignField: "_id", as: "_catL10", pipeline: [{ $project: { name: 1 } }] } },
  ];

  // ── Service request joins ────────────────────────────────────────────────
  // Only added when the report actually asks for a service-request column, so
  // ordinary ticket reports carry none of this weight.
  const wantsSr = dataPoints.some((k) => k.startsWith("sr_"));
  if (wantsSr) {
    const personName = ["firstName", "lastName", "fullName"];
    const person = (path: string, as: string) => ({
      $lookup: {
        from: "users",
        localField: path,
        foreignField: "_id",
        as,
        pipeline: [{ $project: Object.fromEntries(personName.map((f) => [f, 1])) }],
      },
    });
    lookups.push(
      // The status name as the project configured it, rather than a hardcoded
      // list — projects do not agree on what a code means.
      {
        $lookup: {
          from: "statuses",
          let: {
            code: "$status",
            proj: { $ifNull: ["$metadata.projectId", "$project"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$code", "$$code"] },
                    {
                      $eq: [
                        "$projectId",
                        { $convert: { input: "$$proj", to: "objectId", onError: null, onNull: null } },
                      ],
                    },
                  ],
                },
              },
            },
            { $project: { name: 1 } },
          ],
          as: "_srStatus",
        },
      },
      { $lookup: { from: "tickets", localField: "linkedPsrId", foreignField: "_id", as: "_linkedPsr", pipeline: [{ $project: { ticketNumber: 1 } }] } },
      { $lookup: { from: "tickets", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$linkedPsrId", "$$id"] } } }, { $count: "n" }], as: "_isrChildren" } },
      { $lookup: { from: "tickets", localField: "mergedInto", foreignField: "_id", as: "_mergedInto", pipeline: [{ $project: { ticketNumber: 1 } }] } },
      { $lookup: { from: "tickets", localField: "cancel.replacementSrId", foreignField: "_id", as: "_replacementSr", pipeline: [{ $project: { ticketNumber: 1 } }] } },
      // Who set the latest committed date (the last WIP history entry).
      {
        $lookup: {
          from: "users",
          let: { uid: { $arrayElemAt: [{ $ifNull: ["$wip.history.setBy", []] }, -1] } },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
            { $project: { firstName: 1, lastName: 1, fullName: 1 } },
          ],
          as: "_wipSetBy",
        },
      },
      person("reopen.reopenedBy", "_reopenedBy"),
      person("cancel.by", "_cancelledBy"),
      person("pslCall.calledBy", "_pslCalledBy"),
      person("delegation.delegatedTo", "_delegatedTo"),
      person("delegation.delegatedBy", "_delegatedBy"),
      person("delegation.originalAssignee", "_originalAssignee"),
      {
        $lookup: {
          from: "users",
          localField: "cc",
          foreignField: "_id",
          as: "_watchers",
          pipeline: [{ $project: { firstName: 1, lastName: 1, fullName: 1 } }],
        },
      },
    );
  }

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
            { case: { $eq: ["$status", 6] }, then: "Re-open" },
            { case: { $eq: ["$status", 7] }, then: "Re-Opened WIP" },
            { case: { $eq: ["$status", 8] }, then: "Cancelled" },
          ],
          default: "Unknown",
        },
      },
      categoryDisplay: {
        $ifNull: ["$categoryHierarchy.displayPath", "$category"],
      },
      // Per-level category names (blank when that level isn't set).
      categoryLevel1Name: { $ifNull: [{ $arrayElemAt: ["$_catL1.name", 0] }, ""] },
      categoryLevel2Name: { $ifNull: [{ $arrayElemAt: ["$_catL2.name", 0] }, ""] },
      categoryLevel3Name: { $ifNull: [{ $arrayElemAt: ["$_catL3.name", 0] }, ""] },
      categoryLevel4Name: { $ifNull: [{ $arrayElemAt: ["$_catL4.name", 0] }, ""] },
      categoryLevel5Name: { $ifNull: [{ $arrayElemAt: ["$_catL5.name", 0] }, ""] },
      categoryLevel6Name: { $ifNull: [{ $arrayElemAt: ["$_catL6.name", 0] }, ""] },
      categoryLevel7Name: { $ifNull: [{ $arrayElemAt: ["$_catL7.name", 0] }, ""] },
      categoryLevel8Name: { $ifNull: [{ $arrayElemAt: ["$_catL8.name", 0] }, ""] },
      categoryLevel9Name: { $ifNull: [{ $arrayElemAt: ["$_catL9.name", 0] }, ""] },
      categoryLevel10Name: { $ifNull: [{ $arrayElemAt: ["$_catL10.name", 0] }, ""] },
      slaDueAt: { $ifNull: ["$roleLevelSLA.dueAt", "$ticketLevelSLA.dueAt"] },
      slaBreachedAt: {
        $ifNull: ["$roleLevelSLA.breachedAt", "$ticketLevelSLA.breachedAt"],
      },
      // SLA status is derived from the actual deadline, not just a stored
      // breachedAt flag (which the cron may not have stamped). A ticket is
      // "Breached" if it was explicitly flagged, OR it was resolved AFTER its
      // due date, OR it is still open and already past its due date.
      slaStatus: {
        $let: {
          vars: {
            due: {
              $ifNull: ["$roleLevelSLA.dueAt", "$ticketLevelSLA.dueAt"],
            },
            breachedFlag: {
              $or: [
                { $ifNull: ["$roleLevelSLA.breachedAt", false] },
                { $ifNull: ["$ticketLevelSLA.breachedAt", false] },
              ],
            },
            doneAt: { $ifNull: ["$resolvedAt", "$closedAt"] },
          },
          in: {
            $cond: {
              if: {
                $or: [
                  "$$breachedFlag",
                  {
                    $and: [
                      { $ne: ["$$due", null] },
                      { $ne: ["$$doneAt", null] },
                      { $gt: ["$$doneAt", "$$due"] },
                    ],
                  },
                  {
                    $and: [
                      { $ne: ["$$due", null] },
                      { $eq: ["$$doneAt", null] },
                      { $lt: ["$$due", "$$NOW"] },
                    ],
                  },
                ],
              },
              then: "Breached",
              else: "Within SLA",
            },
          },
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
      // District is stored on the centre's `city` field (see Center model usage).
      centerDistrict: {
        $ifNull: [{ $arrayElemAt: ["$_centerData.city", 0] }, ""],
      },
      csatScore: {
        $ifNull: [{ $arrayElemAt: ["$_feedbackData.overallRating", 0] }, null],
      },
      // Derive a readable comment by joining the latest response's answers.
      feedbackComment: {
        $reduce: {
          input: { $ifNull: [{ $arrayElemAt: ["$_feedbackData.answers", 0] }, []] },
          initialValue: "",
          in: {
            $concat: [
              "$$value",
              { $cond: [{ $eq: ["$$value", ""] }, "", "; "] },
              { $ifNull: ["$$this.questionLabel", ""] },
              ": ",
              { $convert: { input: "$$this.answer", to: "string", onError: "", onNull: "" } },
            ],
          },
        },
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
      // ── Service Request (PSR/ISR) computed fields ────────────────────────
      interactionTypeLabel: { $ifNull: ["$interactionType", "normal"] },
      srCancelledLabel: {
        $cond: [{ $eq: ["$status", 8] }, "Yes", "No"],
      },
      srCancelReason: { $ifNull: ["$cancel.reason", ""] },
      srReopenedLabel: {
        $cond: [{ $gt: [{ $ifNull: ["$reopen.count", 0] }, 0] }, "Yes", "No"],
      },
      srReopenCount: { $ifNull: ["$reopen.count", 0] },
      srWipCommittedDate: { $ifNull: ["$wip.committedDate", null] },
      srWipRevisionCount: { $ifNull: ["$wip.revisionCount", 0] },
      srParentSatisfiedLabel: {
        $switch: {
          branches: [
            { case: { $eq: ["$parentClosure.satisfied", true] }, then: "Satisfied" },
            { case: { $eq: ["$parentClosure.satisfied", false] }, then: "Not satisfied" },
          ],
          default: "",
        },
      },
      srAutoClosedLabel: {
        $cond: [{ $eq: ["$metadata.autoClose", true] }, "Yes", "No"],
      },
      srSlaSource: { $ifNull: ["$slaSource", ""] },
    },
  };

  if (wantsSr) {
    // Name of a user pulled in by one of the joins above.
    const nameOf = (arr: string) => ({
      $trim: {
        input: {
          $ifNull: [
            { $arrayElemAt: [`${arr}.fullName`, 0] },
            {
              $concat: [
                { $ifNull: [{ $arrayElemAt: [`${arr}.firstName`, 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: [`${arr}.lastName`, 0] }, ""] },
              ],
            },
          ],
        },
      },
    });
    const yesNo = (cond: any) => ({ $cond: [cond, "Yes", "No"] });
    const hours = (a: any, b: any) => ({
      $round: [{ $divide: [{ $subtract: [a, b] }, 3600000] }, 2],
    });
    const days = (a: any, b: any) => ({
      $round: [{ $divide: [{ $subtract: [a, b] }, 86400000] }, 2],
    });
    const committed = { $ifNull: ["$wip.committedDate", null] };
    const endedAt = { $ifNull: ["$closedAt", "$$NOW"] };
    // The two SLA clocks are held together; either one answers the question.
    // Both clocks are held together, so either answers the question. The inner
    // null matters: with both fields absent $ifNull yields missing, and missing
    // is not null to $ne — every request would read as held.
    const pausedAt = {
      $ifNull: ["$roleLevelSLA.pausedAt", { $ifNull: ["$ticketLevelSLA.pausedAt", null] }],
    };
    const statusChanges = {
      $filter: {
        input: { $ifNull: ["$changeHistory", []] },
        as: "h",
        cond: { $eq: ["$$h.field", "status"] },
      },
    };
    const assigneeChanges = {
      $filter: {
        input: { $ifNull: ["$changeHistory", []] },
        as: "h",
        cond: {
          $or: [
            { $eq: ["$$h.field", "assignedTo"] },
            { $eq: ["$$h.changeType", "reassigned"] },
          ],
        },
      },
    };

    Object.assign(addFields.$addFields as any, {
      // Identity & classification
      srRequestType: { $ifNull: ["$requestType", ""] },
      srModeOfContact: { $ifNull: ["$modeOfContact", ""] },
      srSourceLabel: {
        $ifNull: ["$metadata.sourceLabel", { $ifNull: ["$submissionSource", ""] }],
      },
      srLinkedPsrNumber: { $ifNull: [{ $arrayElemAt: ["$_linkedPsr.ticketNumber", 0] }, ""] },
      srLinkedIsrCount: { $ifNull: [{ $arrayElemAt: ["$_isrChildren.n", 0] }, 0] },
      srMergedLabel: yesNo({ $eq: ["$isMerged", true] }),
      srMergedIntoNumber: { $ifNull: [{ $arrayElemAt: ["$_mergedInto.ticketNumber", 0] }, ""] },
      srMergedCount: { $size: { $ifNull: ["$mergedTickets", []] } },
      srWatcherCount: { $size: { $ifNull: ["$cc", []] } },

      // Requester / beneficiary
      srRequestedByName: { $ifNull: ["$metadata.requestedByName", ""] },
      srRequestedByMobile: { $ifNull: ["$metadata.requestedByMobile", ""] },
      srRequestedByEmail: { $ifNull: ["$metadata.requestedByEmail", ""] },
      srRequestedByType: { $ifNull: ["$metadata.requestedByType", ""] },
      srStudentCount: {
        $cond: [
          { $isArray: "$metadata.children" },
          { $size: "$metadata.children" },
          0,
        ],
      },
      srStudentNames: {
        $reduce: {
          input: {
            $cond: [{ $isArray: "$metadata.children" }, "$metadata.children", []],
          },
          initialValue: "",
          in: {
            $let: {
              vars: {
                nm: {
                  $ifNull: [
                    "$$this.name",
                    { $ifNull: ["$$this.studentName", { $ifNull: ["$$this.fullName", ""] }] },
                  ],
                },
              },
              in: {
                $cond: [
                  { $eq: ["$$nm", ""] },
                  "$$value",
                  {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$nm",
                      { $concat: ["$$value", ", ", "$$nm"] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },

      // WIP commitment
      srWipFirstCommittedDate: {
        $ifNull: [{ $arrayElemAt: [{ $ifNull: ["$wip.history.committedDate", []] }, 0] }, null],
      },
      srWipLastSetByName: nameOf("$_wipSetBy"),
      srWipLastSetAt: {
        $ifNull: [{ $arrayElemAt: [{ $ifNull: ["$wip.history.setAt", []] }, -1] }, null],
      },
      srWipLastReason: {
        $ifNull: [{ $arrayElemAt: [{ $ifNull: ["$wip.history.reason", []] }, -1] }, ""],
      },
      srWipReminderSentAt: { $ifNull: ["$wip.reminderSentAt", null] },
      srWipEscalatedAt: { $ifNull: ["$wip.escalatedAt", null] },
      srWipExpiredLabel: {
        $cond: [
          { $eq: [committed, null] },
          "",
          yesNo({
            $and: [{ $lt: [committed, "$$NOW"] }, { $eq: [{ $ifNull: ["$closedAt", null] }, null] }],
          }),
        ],
      },
      srWipCommitDays: {
        $cond: [{ $eq: [committed, null] }, null, days(committed, "$createdAt")],
      },
      srWipMetLabel: {
        $cond: [
          { $or: [{ $eq: [committed, null] }, { $eq: [{ $ifNull: ["$closedAt", null] }, null] }] },
          "",
          yesNo({ $lte: ["$closedAt", committed] }),
        ],
      },
      srWipOverdueHrs: {
        $cond: [
          { $or: [{ $eq: [committed, null] }, { $lte: [endedAt, committed] }] },
          0,
          hours(endedAt, committed),
        ],
      },

      // SLA hold
      srSlaOnHoldLabel: yesNo({ $ne: [pausedAt, null] }),
      srSlaPausedAt: pausedAt,
      srSlaResumeAt: {
        $ifNull: ["$roleLevelSLA.resumeAt", { $ifNull: ["$ticketLevelSLA.resumeAt", null] }],
      },
      srSlaHoldHrs: {
        $round: [
          {
            $divide: [
              {
                $ifNull: [
                  "$roleLevelSLA.pausedDuration",
                  { $ifNull: ["$ticketLevelSLA.pausedDuration", 0] },
                ],
              },
              60,
            ],
          },
          2,
        ],
      },

      // Lifecycle timings
      srAgeDays: days(endedAt, "$createdAt"),
      srTimeToResolveHrs: {
        $cond: [
          { $eq: [{ $ifNull: ["$resolvedAt", null] }, null] },
          null,
          hours("$resolvedAt", "$createdAt"),
        ],
      },
      srTimeToCloseHrs: {
        $cond: [
          { $eq: [{ $ifNull: ["$closedAt", null] }, null] },
          null,
          hours("$closedAt", "$createdAt"),
        ],
      },
      srStatusChangeCount: { $size: statusChanges },
      srLastStatusChangeAt: { $max: { $map: { input: statusChanges, as: "h", in: "$$h.changedAt" } } },
      srAttachmentCount: { $size: { $ifNull: ["$attachments", []] } },
      srFollowUpCount: { $size: { $ifNull: ["$comments", []] } },

      // Re-open / cancellation
      srReopenedByName: nameOf("$_reopenedBy"),
      srReopenedAt: { $ifNull: ["$reopen.reopenedAt", null] },
      srCancelledByName: nameOf("$_cancelledBy"),
      srCancelledAt: { $ifNull: ["$cancel.at", null] },
      srReplacementNumber: { $ifNull: [{ $arrayElemAt: ["$_replacementSr.ticketNumber", 0] }, ""] },

      // Parent closure & PSL call
      srParentClosedAt: { $ifNull: ["$parentClosure.closedAt", null] },
      srParentComments: { $ifNull: ["$parentClosure.comments", ""] },
      srPslSpokenLabel: {
        $cond: [
          { $eq: [{ $ifNull: ["$pslCall.spoken", null] }, null] },
          "",
          yesNo({ $eq: ["$pslCall.spoken", true] }),
        ],
      },
      srPslSatisfiedLabel: {
        $switch: {
          branches: [
            { case: { $eq: ["$pslCall.parentSatisfied", true] }, then: "Satisfied" },
            { case: { $eq: ["$pslCall.parentSatisfied", false] }, then: "Not satisfied" },
          ],
          default: "",
        },
      },
      srPslCalledByName: nameOf("$_pslCalledBy"),
      srPslCalledAt: { $ifNull: ["$pslCall.calledAt", null] },
      srPslComments: { $ifNull: ["$pslCall.comments", ""] },

      // Hand-over
      srDelegatedLabel: yesNo({ $ne: [{ $ifNull: ["$delegation.delegatedTo", null] }, null] }),
      srDelegatedToName: nameOf("$_delegatedTo"),
      srDelegatedByName: nameOf("$_delegatedBy"),
      srDelegatedAt: { $ifNull: ["$delegation.delegatedAt", null] },
      srDelegationReason: { $ifNull: ["$delegation.reason", ""] },
      srOriginalAssigneeName: nameOf("$_originalAssignee"),
      srReassignCount: { $size: assigneeChanges },

      // Everyday columns, so a service request report does not have to reach
      // into the ticket source for them.
      srRegisteredLabel: yesNo({ $eq: ["$isRegistered", true] }),
      srSubmissionType: { $ifNull: ["$metadata.submissionType", ""] },
      srStudentName: { $ifNull: ["$metadata.studentName", ""] },
      srUnreadLabel: yesNo({ $eq: ["$hasNewReply", true] }),
      srWatcherNames: {
        $reduce: {
          input: { $ifNull: ["$_watchers", []] },
          initialValue: "",
          in: {
            $let: {
              vars: {
                nm: {
                  $trim: {
                    input: {
                      $ifNull: [
                        "$$this.fullName",
                        {
                          $concat: [
                            { $ifNull: ["$$this.firstName", ""] },
                            " ",
                            { $ifNull: ["$$this.lastName", ""] },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              in: {
                $cond: [
                  { $eq: ["$$nm", ""] },
                  "$$value",
                  {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$nm",
                      { $concat: ["$$value", ", ", "$$nm"] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      srInternalNoteCount: { $size: { $ifNull: ["$internalNotes", []] } },
      srThreadCount: { $size: { $ifNull: ["$threads", []] } },

      // SLA and escalation
      srSlaBreachedLabel: yesNo({
        $ne: [
          { $ifNull: ["$ticketLevelSLA.breachedAt", { $ifNull: ["$roleLevelSLA.breachedAt", null] }] },
          null,
        ],
      }),
      srFirstResponseHrs: {
        $cond: [
          { $eq: [{ $ifNull: ["$firstRespondedAt", null] }, null] },
          null,
          hours("$firstRespondedAt", "$createdAt"),
        ],
      },
      srLastEscalatedAt: {
        $max: {
          $map: {
            input: { $ifNull: ["$escalationHistory", []] },
            as: "e",
            in: { $ifNull: ["$$e.escalatedAt", "$$e.createdAt"] },
          },
        },
      },
      srWipAllCommittedDates: {
        $reduce: {
          input: { $ifNull: ["$wip.history", []] },
          initialValue: "",
          in: {
            $let: {
              vars: {
                d: {
                  $dateToString: {
                    format: "%Y-%m-%d %H:%M",
                    date: "$$this.committedDate",
                    onNull: "",
                  },
                },
              },
              in: {
                $cond: [
                  { $eq: ["$$d", ""] },
                  "$$value",
                  {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$d",
                      { $concat: ["$$value", " -> ", "$$d"] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      srScheduleDispatchDate: { $ifNull: ["$metadata.scheduleDispatchDate", null] },
      srCreatedByReLabel: yesNo({ $eq: ["$metadata.createdByRE", true] }),
      srAssignmentRule: { $ifNull: ["$metadata.assignmentRule", ""] },
    });
  }

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
    } else if (key.startsWith("sr_form_field_")) {
      // A field from the project's service request form, stored under
      // metadata.formData rather than the ordinary custom-field bag.
      const name = key.replace(/^sr_form_field_/, "");
      const computedName = `srFormField_${name}`;
      fieldMap[key] = computedName;
      (addFields.$addFields as any)[computedName] = {
        $ifNull: [`$metadata.formData.${name}`, ""],
      };
    } else if (key.startsWith("sr_category_level_")) {
      // Same column as the ticket level, offered on the SR source.
      const n = key.replace(/^sr_category_level_/, "");
      fieldMap[key] = `categoryLevel${n}Name`;
    } else if (key.startsWith("sr_routing_scope_")) {
      // PSR entity-routing scope dimension (e.g. sr_routing_scope_school →
      // ticket.routing.scope.school). Dimensions are configurable per project.
      const dim = key.replace(/^sr_routing_scope_/, "");
      const computedName = `srRoutingScope_${dim}`;
      fieldMap[key] = computedName;
      (addFields.$addFields as any)[computedName] = {
        $ifNull: [`$routing.scope.${dim}`, ""],
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
  // The configured status name, with the computed label as the fallback. A
  // second stage because it reads a field the stage above adds.
  const srSecondPass = wantsSr
    ? [
        {
          $addFields: {
            srStatusName: {
              $ifNull: [{ $arrayElemAt: ["$_srStatus.name", 0] }, "$statusLabel"],
            },
          },
        },
      ]
    : [];

  const pipeline: any[] = [
    { $match: baseMatch },
    ...lookups,
    addFields,
    ...srSecondPass,
    ...(filterConditions.length
      ? [{ $match: { $and: filterConditions } }]
      : []),
    // Sort BEFORE project so the sort field still exists (project would drop it).
    { $sort: { [sortField]: sortDir } },
    { $project: projectStage },
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

/**
 * Per-source pipeline for User / Asset / Asset-Audit reports. Mirrors the ticket
 * engine's output shape (rows keyed by data-point KEY) but against a different
 * base collection with source-specific lookups + computed fields.
 */
async function runNonTicketQuery(
  source: string,
  dataPoints: string[],
  filters: IReportFilter[],
  sortBy: string | undefined,
  sortOrder: string,
  projectId: string | undefined,
  page: number,
  pageSize: number,
): Promise<{ rows: any[]; total: number }> {
  const oid = projectId ? new mongoose.Types.ObjectId(projectId) : null;

  let Model: any;
  const baseMatch: any = {};
  let lookups: any[] = [];
  const computed: Record<string, any> = {};

  if (source === "user") {
    Model = mongoose.model("User");
    if (oid) baseMatch.projects = oid;
    lookups = [
      { $lookup: { from: "roles", localField: "role", foreignField: "_id", as: "_role", pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: "projects", localField: "projects", foreignField: "_id", as: "_projects", pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: "centers", localField: "centers", foreignField: "_id", as: "_centers", pipeline: [{ $project: { centerName: 1 } }] } },
    ];
    computed.userName = { $trim: { input: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] } } };
    computed.roleName = { $ifNull: [{ $arrayElemAt: ["$_role.name", 0] }, ""] };
    computed.projectNames = { $reduce: { input: "$_projects.name", initialValue: "", in: { $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", ", ", "$$this"] }] } } };
    computed.centerNames = { $reduce: { input: "$_centers.centerName", initialValue: "", in: { $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", ", ", "$$this"] }] } } };
    computed.statusLabel = { $cond: ["$isActive", "Active", "Inactive"] };
  } else if (source === "asset") {
    Model = mongoose.model("Asset");
    if (oid) baseMatch.projectId = oid;
    lookups = [
      { $lookup: { from: "assetcategories", localField: "category", foreignField: "_id", as: "_cat", pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_proj", pipeline: [{ $project: { name: 1 } }] } },
    ];
    computed.categoryName = { $ifNull: [{ $arrayElemAt: ["$_cat.name", 0] }, ""] };
    computed.projectName = { $ifNull: [{ $arrayElemAt: ["$_proj.name", 0] }, ""] };
    computed.statusLabel = { $cond: ["$isActive", "Active", "Inactive"] };
  } else if (source === "asset_inventory") {
    Model = mongoose.model("CenterAssetMapping");
    if (oid) baseMatch.projectId = oid;
    lookups = [
      { $lookup: { from: "assets", localField: "assetId", foreignField: "_id", as: "_asset", pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: "centers", localField: "centerId", foreignField: "_id", as: "_center", pipeline: [{ $project: { centerName: 1 } }] } },
      { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_proj", pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: "users", localField: "lastUpdatedBy", foreignField: "_id", as: "_upd", pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
      { $lookup: { from: "users", localField: "lastAuditSubmittedBy", foreignField: "_id", as: "_auditBy", pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
    ];
    const fullName = (arr: string) => ({
      $trim: {
        input: {
          $concat: [
            { $ifNull: [{ $arrayElemAt: [`${arr}.firstName`, 0] }, ""] },
            " ",
            { $ifNull: [{ $arrayElemAt: [`${arr}.lastName`, 0] }, ""] },
          ],
        },
      },
    });
    computed.assetName = { $ifNull: [{ $arrayElemAt: ["$_asset.name", 0] }, ""] };
    computed.centerName = { $ifNull: [{ $arrayElemAt: ["$_center.centerName", 0] }, ""] };
    computed.projectName = { $ifNull: [{ $arrayElemAt: ["$_proj.name", 0] }, ""] };
    computed.updatedByName = fullName("$_upd");
    computed.auditSubmittedByName = fullName("$_auditBy");
    computed.auditSubmittedLabel = { $cond: ["$auditSubmitted", "Yes", "No"] };
  } else if (source === "feedback") {
    Model = mongoose.model("FeedbackResponse");
    if (oid) baseMatch.projectId = oid;
    lookups = [
      // Feedback → ticket. Also pull the ticket's center so feedback can be reported center-wise.
      { $lookup: { from: "tickets", localField: "ticketId", foreignField: "_id", as: "_ticket", pipeline: [{ $project: { ticketNumber: 1, centerId: "$metadata.centerId" } }] } },
      // ticket.metadata.centerId (stored as a STRING) → centers (_id is ObjectId),
      // so convert before matching; online/portal tickets have no centre → blank.
      { $lookup: { from: "centers", let: { cid: { $arrayElemAt: ["$_ticket.centerId", 0] } }, pipeline: [{ $match: { $expr: { $eq: ["$_id", { $convert: { input: "$$cid", to: "objectId", onError: null, onNull: null } }] } } }, { $project: { centerName: 1, city: 1 } }], as: "_center" } },
      { $lookup: { from: "users", localField: "studentId", foreignField: "_id", as: "_submitter", pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
      { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_proj", pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: "feedbackforms", localField: "formId", foreignField: "_id", as: "_form", pipeline: [{ $project: { name: 1, title: 1 } }] } },
    ];
    computed.rating = { $ifNull: ["$overallRating", null] };
    computed.ticketNumber = { $ifNull: [{ $arrayElemAt: ["$_ticket.ticketNumber", 0] }, ""] };
    computed.centerName = { $ifNull: [{ $arrayElemAt: ["$_center.centerName", 0] }, ""] };
    // District is stored on the centre's `city` field (see Center model usage).
    computed.centerDistrict = { $ifNull: [{ $arrayElemAt: ["$_center.city", 0] }, ""] };
    computed.submitterName = {
      $trim: {
        input: {
          $concat: [
            { $ifNull: [{ $arrayElemAt: ["$_submitter.firstName", 0] }, ""] },
            " ",
            { $ifNull: [{ $arrayElemAt: ["$_submitter.lastName", 0] }, ""] },
          ],
        },
      },
    };
    computed.projectName = { $ifNull: [{ $arrayElemAt: ["$_proj.name", 0] }, ""] };
    computed.formName = {
      $ifNull: [
        { $arrayElemAt: ["$_form.name", 0] },
        { $ifNull: [{ $arrayElemAt: ["$_form.title", 0] }, ""] },
      ],
    };
    computed.answersCount = { $size: { $ifNull: ["$answers", []] } };
    computed.answersText = {
      $reduce: {
        input: { $ifNull: ["$answers", []] },
        initialValue: "",
        in: {
          $concat: [
            "$$value",
            { $cond: [{ $eq: ["$$value", ""] }, "", "; "] },
            { $ifNull: ["$$this.questionLabel", ""] },
            ": ",
            { $convert: { input: "$$this.answer", to: "string", onError: "", onNull: "" } },
          ],
        },
      },
    };
  } else if (source === "call") {
    // ── IVR call inbox (CallIntake) ────────────────────────────────────────
    // The call record is what the SR desk works from before a request exists,
    // so it reports on its own rather than only through the requests it made.
    Model = mongoose.model("CallIntake");
    if (oid) baseMatch.projectId = oid;
    lookups = [
      { $lookup: { from: "users", localField: "assignedTo", foreignField: "_id", as: "_agent", pipeline: [{ $project: { firstName: 1, lastName: 1, fullName: 1 } }] } },
      { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_proj", pipeline: [{ $project: { name: 1 } }] } },
    ];
    computed.assignedToName = {
      $trim: {
        input: {
          $ifNull: [
            { $arrayElemAt: ["$_agent.fullName", 0] },
            {
              $concat: [
                { $ifNull: [{ $arrayElemAt: ["$_agent.firstName", 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: ["$_agent.lastName", 0] }, ""] },
              ],
            },
          ],
        },
      },
    };
    computed.projectName = { $ifNull: [{ $arrayElemAt: ["$_proj.name", 0] }, ""] };
    computed.callTypeLabel = {
      $cond: [{ $eq: ["$callType", "answered"] }, "Answered", "Missed"],
    };
    computed.directionLabel = { $ifNull: ["$direction", "inbound"] };
    computed.statusLabel = {
      $cond: [{ $eq: ["$status", "closed"] }, "Closed", "Open"],
    };
    computed.registeredLabel = { $cond: ["$registered", "Yes", "No"] };
    computed.resolvedOnCallLabel = { $cond: ["$resolvedOnCall", "Yes", "No"] };
    computed.convertedCount = { $size: { $ifNull: ["$convertedTickets", []] } };
    computed.followUpCount = { $size: { $ifNull: ["$followUps", []] } };
    computed.lastFollowUpOutcome = {
      $ifNull: [{ $arrayElemAt: [{ $ifNull: ["$followUps.outcome", []] }, -1] }, ""],
    };
    computed.outboundCount = { $size: { $ifNull: ["$outboundCalls", []] } };
    computed.commentCount = { $size: { $ifNull: ["$comments", []] } };
    computed.digitsDialedText = {
      $reduce: {
        input: { $ifNull: ["$digitsDialed", []] },
        initialValue: "",
        in: {
          $cond: [
            { $eq: ["$$value", ""] },
            { $toString: "$$this" },
            { $concat: ["$$value", ", ", { $toString: "$$this" }] },
          ],
        },
      },
    };
    // The call-back ladder: the step the call is on is the last one logged.
    const lastFollowUp = { $arrayElemAt: [{ $ifNull: ["$followUps", []] }, -1] };
    computed.pendingFollowUpCount = {
      $size: {
        $filter: {
          input: { $ifNull: ["$followUps", []] },
          as: "f",
          cond: { $eq: ["$$f.status", "pending"] },
        },
      },
    };
    computed.lastFollowUpAt = { $ifNull: [{ $getField: { field: "createdAt", input: lastFollowUp } }, null] };
    computed.lastWipLevel = { $ifNull: [{ $getField: { field: "wipLevel", input: lastFollowUp } }, null] };
    computed.lastWipLabel = { $ifNull: [{ $getField: { field: "wipLabel", input: lastFollowUp } }, ""] };
    computed.lastTatHours = { $ifNull: [{ $getField: { field: "tatHours", input: lastFollowUp } }, null] };
    // Notes, including a time the caller asked to be rung back.
    const lastComment = { $arrayElemAt: [{ $ifNull: ["$comments", []] }, -1] };
    computed.lastCommentText = { $ifNull: [{ $getField: { field: "text", input: lastComment } }, ""] };
    computed.lastCommentBy = { $ifNull: [{ $getField: { field: "createdByName", input: lastComment } }, ""] };
    computed.lastCommentAt = { $ifNull: [{ $getField: { field: "createdAt", input: lastComment } }, null] };
    computed.lastCallbackRequestedAt = {
      $max: {
        $map: {
          input: { $ifNull: ["$comments", []] },
          as: "c",
          in: "$$c.callbackRequestedAt",
        },
      },
    };
    // Outbound call-back attempts — each is its own call with its own recording.
    const lastOutbound = { $arrayElemAt: [{ $ifNull: ["$outboundCalls", []] }, -1] };
    computed.outboundTalkSeconds = {
      $sum: {
        $map: {
          input: { $ifNull: ["$outboundCalls", []] },
          as: "o",
          in: { $ifNull: ["$$o.durationSeconds", 0] },
        },
      },
    };
    computed.lastOutboundAgent = { $ifNull: [{ $getField: { field: "agentName", input: lastOutbound } }, ""] };
    computed.lastOutboundDuration = { $ifNull: [{ $getField: { field: "durationSeconds", input: lastOutbound } }, null] };
    computed.lastOutboundRecording = { $ifNull: [{ $getField: { field: "recordingUrl", input: lastOutbound } }, ""] };
    computed.convertedNumbers = {
      $reduce: {
        input: { $ifNull: ["$convertedTickets", []] },
        initialValue: "",
        in: {
          $let: {
            vars: { n: { $ifNull: ["$$this.ticketNumber", ""] } },
            in: {
              $cond: [
                { $eq: ["$$n", ""] },
                "$$value",
                {
                  $cond: [
                    { $eq: ["$$value", ""] },
                    "$$n",
                    { $concat: ["$$value", ", ", "$$n"] },
                  ],
                },
              ],
            },
          },
        },
      },
    };
  } else if (source === "email_intake") {
    // ── Email triage queue (EmailIntake) ───────────────────────────────────
    // Email is the other way a request arrives; it has its own TAT and
    // escalation, so it reports in its own right.
    Model = mongoose.model("EmailIntake");
    if (oid) baseMatch.projectId = oid;
    const personName = (arr: string) => ({
      $trim: {
        input: {
          $ifNull: [
            { $arrayElemAt: [`${arr}.fullName`, 0] },
            {
              $concat: [
                { $ifNull: [{ $arrayElemAt: [`${arr}.firstName`, 0] }, ""] },
                " ",
                { $ifNull: [{ $arrayElemAt: [`${arr}.lastName`, 0] }, ""] },
              ],
            },
          ],
        },
      },
    });
    lookups = [
      { $lookup: { from: "users", localField: "assignedTo", foreignField: "_id", as: "_agent", pipeline: [{ $project: { firstName: 1, lastName: 1, fullName: 1 } }] } },
      { $lookup: { from: "users", localField: "closedBy", foreignField: "_id", as: "_closedBy", pipeline: [{ $project: { firstName: 1, lastName: 1, fullName: 1 } }] } },
      { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "_proj", pipeline: [{ $project: { name: 1 } }] } },
    ];
    computed.assignedToName = personName("$_agent");
    computed.closedByName = personName("$_closedBy");
    computed.projectName = { $ifNull: [{ $arrayElemAt: ["$_proj.name", 0] }, ""] };
    computed.actionCount = { $size: { $ifNull: ["$actions", []] } };
    computed.overdueLabel = {
      $cond: [
        {
          $and: [
            { $ne: [{ $ifNull: ["$dueAt", null] }, null] },
            { $lt: ["$dueAt", "$$NOW"] },
            { $eq: [{ $ifNull: ["$closedAt", null] }, null] },
          ],
        },
        "Yes",
        "No",
      ],
    };
    computed.ageHrs = {
      $round: [
        {
          $divide: [
            { $subtract: [{ $ifNull: ["$closedAt", "$$NOW"] }, "$receivedAt"] },
            3600000,
          ],
        },
        2,
      ],
    };
    computed.timeToCloseHrs = {
      $cond: [
        { $eq: [{ $ifNull: ["$closedAt", null] }, null] },
        null,
        { $round: [{ $divide: [{ $subtract: ["$closedAt", "$receivedAt"] }, 3600000] }, 2] },
      ],
    };
  } else {
    // asset_audit
    Model = mongoose.model("AssetAuditLog");
    lookups = [
      { $lookup: { from: "assets", localField: "assetId", foreignField: "_id", as: "_asset", pipeline: [{ $project: { name: 1, projectId: 1 } }] } },
      { $lookup: { from: "centers", localField: "centerId", foreignField: "_id", as: "_center", pipeline: [{ $project: { centerName: 1 } }] } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "_user", pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
    ];
    computed.assetName = { $ifNull: [{ $arrayElemAt: ["$_asset.name", 0] }, ""] };
    computed.centerName = { $ifNull: [{ $arrayElemAt: ["$_center.centerName", 0] }, ""] };
    computed.changedByName = {
      $trim: {
        input: {
          $concat: [
            { $ifNull: [{ $arrayElemAt: ["$_user.firstName", 0] }, ""] },
            " ",
            { $ifNull: [{ $arrayElemAt: ["$_user.lastName", 0] }, ""] },
          ],
        },
      },
    };
    computed.prevWorking = { $ifNull: ["$previousValues.workingAsset", 0] };
    computed.prevNotWorking = { $ifNull: ["$previousValues.notWorkingAsset", 0] };
    computed.currWorking = { $ifNull: ["$newValues.workingAsset", 0] };
    computed.currNotWorking = { $ifNull: ["$newValues.notWorkingAsset", 0] };
    if (oid) {
      // Scope audits to a project via the joined asset's projectId.
      computed._assetProjectId = { $arrayElemAt: ["$_asset.projectId", 0] };
    }
  }

  const addFields = { $addFields: computed };

  // Filters → $match (computed field names from the map).
  const groups = new Map<string, any[]>();
  for (const f of filters) {
    const fieldName = DATA_POINT_FIELD_MAP[f.field] ?? f.field;
    const expr = filterToMongo(fieldName, f.operator, f.value, f.value2);
    if (Object.keys(expr).length === 0) continue;
    if (!groups.has(fieldName)) groups.set(fieldName, []);
    groups.get(fieldName)!.push(expr);
  }
  const filterConditions: any[] = [];
  for (const [, exprs] of groups) {
    filterConditions.push(exprs.length === 1 ? exprs[0] : { $or: exprs });
  }
  // Asset-audit project scoping (after the asset lookup computed _assetProjectId).
  if (source === "asset_audit" && oid) {
    filterConditions.push({ _assetProjectId: oid });
  }

  const projectStage: any = { _id: 1 };
  for (const key of dataPoints) {
    const field = DATA_POINT_FIELD_MAP[key];
    if (field) projectStage[field] = 1;
  }

  const sortField = (sortBy && DATA_POINT_FIELD_MAP[sortBy]) || "createdAt";
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const pipeline: any[] = [
    { $match: baseMatch },
    ...lookups,
    addFields,
    ...(filterConditions.length ? [{ $match: { $and: filterConditions } }] : []),
    // Sort BEFORE project so the sort field (e.g. createdAt/updatedAt) still
    // exists — projecting first would drop it and silently break ordering.
    { $sort: { [sortField]: sortDir } },
    { $project: projectStage },
  ];

  const countResult = await Model.aggregate([...pipeline, { $count: "total" }]);
  const total: number = countResult[0]?.total ?? 0;

  pipeline.push({ $skip: (page - 1) * pageSize });
  pipeline.push({ $limit: pageSize });
  const rawRows = await Model.aggregate(pipeline);

  const rows = rawRows.map((row: any) => {
    const out: any = { _id: row._id };
    for (const key of dataPoints) {
      const field = DATA_POINT_FIELD_MAP[key];
      if (field) out[key] = row[field] ?? null;
    }
    return out;
  });

  return { rows, total };
}
