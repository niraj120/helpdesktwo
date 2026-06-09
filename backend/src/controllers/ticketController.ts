import { Request, Response } from "express";
import { Ticket } from "../models/Ticket";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { Permission } from "../models/Permission";
import { Center } from "../models/Center";
import { Category } from "../models/Category";
import { Status } from "../models/Status";
import SLATracking from "../models/sla-module/SLATracking";
import EscalationPolicy from "../models/sla-module/EscalationPolicy";
import { UserReportingHierarchy } from "../models/UserReportingHierarchy";
import { UserDashboardConfig } from "../models/UserDashboardConfig";
import { Priority } from "../models/master-data/Priority";
import { WorkingCalendar } from "../models/WorkingCalendar";
import { EscalationMatrix } from "../models/escalation-matrix";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { GCSService } from "../services/gcsService";
import { canModifyTicket } from "../utils/ticketAuth";
import {
  sendTicketCreatedEmail,
  sendStudentWelcomeEmail,
  sendTicketAssignedEmail,
  sendTicketCommentAddedEmail,
} from "../utils/emailService";
import { logActivity } from "../utils/logger";
import { config } from "../config";
import { initializeSLATracking } from "../services/slaHelperService";
import {
  autoAssignMatrixToTicket,
  getMatrixByProjectId,
} from "../services/escalationMatrixService";
import {
  autoAssignTicket,
  AutoAssignResult,
} from "../utils/ticketAutoAssignment";
import * as slaService from "../services/slaService";
import { dashboardEvents } from "../services/dashboardEventBus";
import {
  toObjectId,
  toObjectIdArray,
  ensureObjectId,
} from "../utils/objectIdUtils";
import { fireNotification } from "../services/notificationEngine";
import { TRIGGER_TYPES } from "../constants/notificationTriggers";

// Helper: Convert status code to name for emails/display
const getStatusName = (statusCode: number): string => {
  const statusMap: Record<number, string> = {
    1: "Open",
    2: "In Progress",
    3: "On Hold",
    4: "Resolved",
    5: "Closed",
  };
  return statusMap[statusCode] || `Status ${statusCode}`;
};

const emitTicketRealtimeUpdate = async (
  ticketDoc: any,
  eventType: string = "ticket-updated",
  extraTicketFields: Record<string, any> = {},
) => {
  try {
    const ticketId = ticketDoc?._id?.toString();
    if (!ticketId) return;

    const projectIdRaw =
      ticketDoc?.project?.toString() ||
      ticketDoc?.metadata?.projectId?._id?.toString?.() ||
      ticketDoc?.metadata?.projectId?.toString?.();

    let statusName: string | undefined;
    let statusColor: string | undefined;
    let isClosedStatus: boolean | undefined;

    const statusNum = Number(ticketDoc?.status);
    if (
      projectIdRaw &&
      mongoose.Types.ObjectId.isValid(projectIdRaw) &&
      !Number.isNaN(statusNum)
    ) {
      const statusDoc = await Status.findOne({
        projectId: new mongoose.Types.ObjectId(projectIdRaw),
        code: statusNum,
        isActive: true,
      })
        .select("name color isClosed")
        .lean();

      if (statusDoc) {
        statusName = (statusDoc as any).name;
        statusColor = (statusDoc as any).color;
        isClosedStatus = !!(statusDoc as any).isClosed;
      }
    }

    const payloadTicket = {
      _id: ticketId,
      ticketNumber: ticketDoc?.ticketNumber,
      status: ticketDoc?.status,
      updatedAt: ticketDoc?.updatedAt,
      assignedTo: ticketDoc?.assignedTo,
      statusName,
      statusColor,
      isClosedStatus,
      ...extraTicketFields,
    };

    const { getIo } = require("../socket/ioInstance");
    const {
      emitTicketUpdate,
      emitTicketListUpdate,
    } = require("../socket/socketHandlers");
    const io = getIo();
    if (!io) return;

    emitTicketUpdate(io, ticketId, {
      type: eventType,
      ticket: payloadTicket,
    });

    if (projectIdRaw) {
      emitTicketListUpdate(io, projectIdRaw, {
        type: "ticket-updated",
        ticket: payloadTicket,
      });
    }
  } catch (socketErr) {
    console.error("⚠️ Failed to emit ticket realtime update:", socketErr);
  }
};

// Ownership-scoped ticket authorization (canModifyTicket / hasModifyAnyTicket)
// lives in ../utils/ticketAuth and is imported at the top of this file so the
// same rule is reused by the comment & attachment controllers.

/**
 * Helper function to track changes in ticket history
 */
const trackChange = async (
  ticket: any,
  field: string,
  oldValue: string,
  newValue: string,
  userId: string,
  changeType: "update" | "add" | "remove" = "update",
) => {
  if (!ticket.changeHistory) {
    ticket.changeHistory = [];
  }

  ticket.changeHistory.push({
    _id: new mongoose.Types.ObjectId(),
    field,
    oldValue: oldValue || "None",
    newValue: newValue || "None",
    changedBy: userId,
    changedAt: new Date(),
    changeType,
  });
};

/**
 * Get next agent for round-robin assignment
 */
const getNextRoundRobinAgent = async (
  projectId: string,
  eligibleUserIds: mongoose.Types.ObjectId[],
): Promise<mongoose.Types.ObjectId | null> => {
  if (eligibleUserIds.length === 0) return null;

  // Find the last assigned ticket for this project
  const lastTicket = await Ticket.findOne({
    "metadata.projectId": projectId,
    assignedTo: { $exists: true, $ne: null },
  }).sort({ createdAt: -1 });

  if (!lastTicket || !lastTicket.assignedTo) {
    // No previous assignment, return first agent
    return eligibleUserIds[0];
  }

  // Find the index of last assigned agent
  const lastAgentIndex = eligibleUserIds.findIndex(
    (id) => id.toString() === lastTicket.assignedTo?.toString(),
  );

  // Return next agent in rotation (or first if last was the end of list)
  const nextIndex = (lastAgentIndex + 1) % eligibleUserIds.length;
  return eligibleUserIds[nextIndex];
};

/**
 * Get agent with least active tickets (load-balanced)
 * Optimized: Single aggregation instead of N countDocuments queries
 */
const getLeastLoadedAgent = async (
  eligibleUserIds: mongoose.Types.ObjectId[],
): Promise<mongoose.Types.ObjectId | null> => {
  if (eligibleUserIds.length === 0) return null;

  // Single aggregation to count active tickets for all agents at once
  const ticketCounts = await Ticket.aggregate([
    {
      $match: {
        assignedTo: { $in: eligibleUserIds },
        status: { $in: [1, 2, 3] }, // 1=Open, 2=In Progress, 3=On Hold
      },
    },
    {
      $group: {
        _id: "$assignedTo",
        count: { $sum: 1 },
      },
    },
  ]);

  // Create a map of userId -> ticket count
  const countMap = new Map(
    ticketCounts.map((tc: any) => [tc._id.toString(), tc.count]),
  );

  // Find agent with least tickets (agents with 0 tickets won't be in aggregation result)
  let minCount = Infinity;
  let leastLoadedAgent = eligibleUserIds[0];

  for (const userId of eligibleUserIds) {
    const count = countMap.get(userId.toString()) || 0;
    if (count < minCount) {
      minCount = count;
      leastLoadedAgent = userId;
    }
  }

  return leastLoadedAgent;
};

/**
 * Submit a ticket from student portal
 */
export const submitTicket = async (req: Request, res: Response) => {
  const perfStart = Date.now();
  console.time("⏱️ Total submitTicket");

  try {
    const { projectId, formData } = req.body;
    // Read category & hierarchy sent as separate FormData fields by the frontend
    const rawCategoryFromBody = req.body.category || null;
    const rawCategoryHierarchyFromBody = req.body.categoryHierarchy
      ? (() => {
          try {
            return JSON.parse(req.body.categoryHierarchy);
          } catch {
            return null;
          }
        })()
      : null;

    console.log(`📝 Submitting ticket for project: ${projectId}`);

    // Check if user is authenticated (optional for this endpoint)
    const authHeader = req.headers.authorization;
    let authenticatedUserId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        authenticatedUserId = decoded.userId;
        console.log(
          `🔐 Authenticated submission from user: ${authenticatedUserId}`,
        );
      } catch (error) {
        console.log(`⚠️ Invalid token, treating as public submission`);
      }
    }

    // Validate project exists
    console.time("⏱️ Project lookup");
    const project = await Project.findById(projectId);
    console.timeEnd("⏱️ Project lookup");

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Parse form data
    const ticketData = JSON.parse(formData);

    // Handle file attachments — upload to GCS (or local fallback)
    const attachments: any[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        const uploaded = await GCSService.uploadTicketFile(
          file,
          "ticket-attachments",
        );
        attachments.push({
          fieldName: file.fieldname,
          filename: uploaded.filename,
          originalName: file.originalname,
          path: uploaded.path,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
        });
      }
    }

    // Generate unique ticket number with retry mechanism
    console.time("⏱️ Generate ticket number");
    const generateUniqueTicketNumber = async (): Promise<string> => {
      // Get ticket number configuration from project
      const ticketNumberConfig = project.configuration?.ticketNumberSettings;
      console.log(
        "🔧 Ticket Number Config:",
        JSON.stringify(ticketNumberConfig, null, 2),
      );
      const prefix = ticketNumberConfig?.prefix || "TKT";
      const format =
        ticketNumberConfig?.format || "{PREFIX}-{YYYY}{MM}{DD}-{NNNN}";
      const resetPeriod = ticketNumberConfig?.resetPeriod || "daily";
      console.log(
        `🎫 Using: prefix="${prefix}", format="${format}", resetPeriod="${resetPeriod}"`,
      );

      const today = new Date();
      let datePrefix = "";

      // Build date prefix based on reset period
      if (resetPeriod === "daily") {
        datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      } else if (resetPeriod === "monthly") {
        datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
      } else if (resetPeriod === "yearly") {
        datePrefix = `${today.getFullYear()}`;
      }

      // Build search pattern based on format
      let searchPattern = format
        .replace("{PREFIX}", prefix)
        .replace("{YYYY}", String(today.getFullYear()))
        .replace("{MM}", String(today.getMonth() + 1).padStart(2, "0"))
        .replace("{DD}", String(today.getDate()).padStart(2, "0"))
        .replace("{NNNN}", ""); // Remove the number part for search

      // Find the highest ticket number for the current period
      const latestTicket = await Ticket.findOne({
        projectId,
        ticketNumber: new RegExp(`^${searchPattern.replace(/[-]/g, "\\-")}`),
      }).sort({ ticketNumber: -1 });

      let nextNumber = ticketNumberConfig?.startingNumber || 1;
      if (latestTicket && latestTicket.ticketNumber) {
        // Extract the sequence number from the last ticket
        const lastNumber = parseInt(
          latestTicket.ticketNumber.split("-").pop() || "0",
        );
        nextNumber = lastNumber + 1;
      }

      // Try up to 10 times to find a unique number (in case of race conditions)
      for (let attempt = 0; attempt < 10; attempt++) {
        // Generate ticket number based on format
        let ticketNumber = format
          .replace("{PREFIX}", prefix)
          .replace("{YYYY}", String(today.getFullYear()))
          .replace("{MM}", String(today.getMonth() + 1).padStart(2, "0"))
          .replace("{DD}", String(today.getDate()).padStart(2, "0"))
          .replace("{NNNN}", String(nextNumber).padStart(4, "0"));

        // Check if this number already exists
        const exists = await Ticket.findOne({ ticketNumber });
        if (!exists) {
          return ticketNumber;
        }

        nextNumber++;
      }

      // Fallback: use timestamp if all attempts fail
      return `${prefix}-${datePrefix}-${Date.now().toString().slice(-4)}`;
    };

    const ticketNumber = await generateUniqueTicketNumber();
    console.timeEnd("⏱️ Generate ticket number");
    console.log(`🎫 Generated ticket number: ${ticketNumber}`);

    // Auto-assignment logic (US-001 category-aware engine)
    console.time("⏱️ Auto-assignment");
    let assignedAgent: mongoose.Types.ObjectId | null = null;
    let assignmentResult: AutoAssignResult | null = null;

    // Resolve the category ObjectId — prefer req.body.category (sent as a separate FormData field
    // by the frontend's hierarchy selector) over ticketData.Category (legacy in-JSON field).
    const rawCategory =
      rawCategoryFromBody ||
      ticketData.Category ||
      rawCategoryHierarchyFromBody?.level1 ||
      null;
    let categoryObjectId: mongoose.Types.ObjectId | null = null;
    if (
      rawCategory &&
      mongoose.Types.ObjectId.isValid(rawCategory) &&
      rawCategory.length === 24
    ) {
      categoryObjectId = new mongoose.Types.ObjectId(rawCategory);
    }

    // For auto-assignment, use the DEEPEST selected category so that leaf-level
    // CategoryAssignmentConfigs are matched first (resolveConfigForCategory walks
    // up to parents automatically if no config exists at the leaf).
    const deepestCategoryRaw =
      rawCategoryHierarchyFromBody?.level5 ||
      rawCategoryHierarchyFromBody?.level4 ||
      rawCategoryHierarchyFromBody?.level3 ||
      rawCategoryHierarchyFromBody?.level2 ||
      rawCategoryHierarchyFromBody?.level1 ||
      rawCategoryFromBody ||
      null;
    let deepestCategoryObjectId: mongoose.Types.ObjectId | null = null;
    if (
      deepestCategoryRaw &&
      mongoose.Types.ObjectId.isValid(deepestCategoryRaw) &&
      deepestCategoryRaw.length === 24
    ) {
      deepestCategoryObjectId = new mongoose.Types.ObjectId(deepestCategoryRaw);
    }

    // If an EscalationMatrix is configured for this project/category, skip the legacy
    // CategoryAssignmentConfig engine entirely.  The matrix's Level 1 role/user pool
    // will handle initial assignment inside autoAssignMatrixToTicket (post-save).
    const existingMatrix = await getMatrixByProjectId(
      projectId.toString(),
      undefined, // priority not yet resolved at this point
      (deepestCategoryObjectId ?? categoryObjectId)?.toString(),
    );

    if (!existingMatrix) {
      assignmentResult = await autoAssignTicket(
        projectId.toString(),
        deepestCategoryObjectId ?? categoryObjectId,
      );
      if (assignmentResult) {
        assignedAgent = assignmentResult.agentId;
      }
    } else {
      console.log(
        `ℹ️ [Auto-assign] EscalationMatrix "${(existingMatrix as any).name}" found for project — skipping legacy assignment engine, matrix L1 will assign on save`,
      );
    }
    console.timeEnd("⏱️ Auto-assignment");

    // Check if student user exists, create if first time (MUST DO THIS BEFORE CREATING TICKET)
    console.time("⏱️ Student user lookup/create");
    const studentEmail = ticketData.Email;
    const studentName = ticketData.Name || "Student";
    let studentUserId: mongoose.Types.ObjectId;
    let isNewStudent = false;

    // If authenticated, use the authenticated user's ID
    if (authenticatedUserId) {
      console.log(`🔐 Using authenticated user ID: ${authenticatedUserId}`);
      studentUserId = new mongoose.Types.ObjectId(authenticatedUserId);

      // Get student info from database for notifications
      const authenticatedUser = await User.findById(authenticatedUserId);
      if (authenticatedUser) {
        ticketData.Email = authenticatedUser.email;
        ticketData.Name =
          `${authenticatedUser.firstName} ${authenticatedUser.lastName}`.trim();
      }
    } else if (studentEmail) {
      // Public submission - check if student exists or create new
      // Parallelize student user lookup and role lookup
      const [studentUser, studentRole] = await Promise.all([
        User.findOne({ email: studentEmail }),
        Role.findOne({ code: "STUDENT" }),
      ]);

      if (!studentUser) {
        console.log(
          `📧 First-time student submission detected: ${studentEmail}`,
        );
        isNewStudent = true;

        if (studentRole) {
          // Create new student user
          const nameParts = studentName.split(" ");
          const newStudent = await User.create({
            email: studentEmail,
            firstName: nameParts[0] || "Student",
            lastName: nameParts.slice(1).join(" ") || "",
            role: studentRole._id,
            projects: [projectId],
            isActive: true,
            requirePasswordSetup: true, // Flag for first-time password setup via OTP
            registrationSource: "online", // Mark as online registration
          });

          console.log(
            `✅ Student user created: ${newStudent._id} | ${studentEmail}`,
          );
          studentUserId = newStudent._id as mongoose.Types.ObjectId;

          // Check feedback triggers for student registration (non-blocking)
          (async () => {
            try {
              const {
                checkAndTriggerFeedback,
              } = require("../services/feedbackTriggerService");
              await checkAndTriggerFeedback("student_registered", {
                projectId: projectId,
                studentId: newStudent._id.toString(),
              });
            } catch (error) {
              console.error(
                "Error checking student_registered feedback triggers:",
                error,
              );
            }
          })();
        } else {
          console.error(
            "⚠️ STUDENT role not found - cannot create student user",
          );
          // Use a placeholder if role doesn't exist
          studentUserId = new mongoose.Types.ObjectId();
        }
      } else {
        // Use the existing student user ID
        studentUserId = studentUser._id as mongoose.Types.ObjectId;
      }
    } else {
      // No email provided - use placeholder (shouldn't happen in normal flow)
      studentUserId = new mongoose.Types.ObjectId();
    }
    console.timeEnd("⏱️ Student user lookup/create");

    // Fetch category to get default priority
    console.time("⏱️ Category lookup");
    let ticketPriority = "NORMAL"; // Dynamic fallback replaced below from project priority master
    // Use the resolved rawCategory (req.body.category takes priority over ticketData.Category)
    const categoryValue = rawCategory || ticketData.Category || null;

    try {
      // Dynamic fallback from project-mapped Priority master (default first, then display order)
      const projectPriorityDefault = await Priority.findOne({
        projectId,
        isActive: true,
      })
        .select("code name isDefault order")
        .sort({ isDefault: -1, order: 1, createdAt: 1 })
        .lean();

      if (projectPriorityDefault?.code) {
        ticketPriority = String(projectPriorityDefault.code)
          .trim()
          .toUpperCase();
        console.log(
          `✅ Using project default priority fallback: ${ticketPriority} (${projectPriorityDefault.name || projectPriorityDefault.code})`,
        );
      }

      const CategoryModel = mongoose.models.Category || Category;
      const HierarchyConfigModel =
        mongoose.models.HierarchyConfig ||
        require("../models/HierarchyConfig").HierarchyConfig;

      // Load the project's hierarchy config to determine which level drives priority
      const hierarchyConfig = await HierarchyConfigModel.findOne({
        projectId,
      })
        .select("priorityFromLevel")
        .lean();
      const priorityFromLevel: number =
        (hierarchyConfig as any)?.priorityFromLevel || 0;

      // Resolve category dynamically from selected hierarchy.
      // Preference order:
      // 1) configured priorityFromLevel
      // 2) deepest selected level (L4 -> L1)
      // 3) direct category field fallback
      const configuredLevelKey =
        priorityFromLevel >= 1 && priorityFromLevel <= 4
          ? (`level${priorityFromLevel}` as
              | "level1"
              | "level2"
              | "level3"
              | "level4")
          : null;

      const categoryCandidates: string[] = [];
      const pushCandidate = (v: any) => {
        const s = String(v || "").trim();
        if (s && !categoryCandidates.includes(s)) categoryCandidates.push(s);
      };

      if (
        configuredLevelKey &&
        rawCategoryHierarchyFromBody?.[configuredLevelKey]
      ) {
        pushCandidate(rawCategoryHierarchyFromBody[configuredLevelKey]);
      }
      pushCandidate(rawCategoryHierarchyFromBody?.level4);
      pushCandidate(rawCategoryHierarchyFromBody?.level3);
      pushCandidate(rawCategoryHierarchyFromBody?.level2);
      pushCandidate(rawCategoryHierarchyFromBody?.level1);
      pushCandidate(categoryValue);

      console.log("🔍 Priority lookup candidates:", {
        priorityFromLevel,
        configuredLevelKey,
        categoryCandidates,
      });

      let matchedCategory: any = null;

      for (const candidate of categoryCandidates) {
        let candidateCategory: any = null;

        if (
          mongoose.Types.ObjectId.isValid(candidate) &&
          candidate.length === 24
        ) {
          candidateCategory = await CategoryModel.findOne({
            _id: candidate,
            projectId: projectId,
            isActive: true,
          });
        } else {
          candidateCategory = await CategoryModel.findOne({
            name: candidate,
            projectId: projectId,
            isActive: true,
          });
        }

        if (!candidateCategory) continue;

        if (!matchedCategory) {
          matchedCategory = candidateCategory;
        }

        if (candidateCategory.defaultPriority) {
          matchedCategory = candidateCategory;
          break;
        }
      }

      console.log(
        `🔍 Category resolved for priority:`,
        matchedCategory
          ? {
              _id: matchedCategory._id,
              name: matchedCategory.name,
              defaultPriority: matchedCategory.defaultPriority,
            }
          : "NOT FOUND",
      );

      if (matchedCategory?.defaultPriority) {
        ticketPriority = String(matchedCategory.defaultPriority)
          .trim()
          .toUpperCase();
        console.log(
          `✅ Using category-mapped priority: ${ticketPriority} (from category: ${matchedCategory.name})`,
        );
      } else if (matchedCategory) {
        console.log(
          `⚠️ Resolved category has no defaultPriority: ${matchedCategory.name}; using project fallback ${ticketPriority}`,
        );
      } else {
        console.log(
          `⚠️ No matching category resolved from selection; using project fallback: ${ticketPriority}`,
        );
      }
    } catch (error) {
      console.error("Error fetching category:", error);
    }
    console.timeEnd("⏱️ Category lookup");

    // Create ticket (using actual student user ID)
    console.time("⏱️ Ticket save");

    // IMPORTANT: Always convert projectId to ObjectId to prevent String/ObjectId mismatch issues
    const projectObjectIdForMetadata =
      typeof projectId === "string"
        ? new mongoose.Types.ObjectId(projectId)
        : projectId;

    // Resolve slaRuleId for name-change-resilient dashboard priority matching
    let slaRuleIdForTicket: mongoose.Types.ObjectId | undefined;
    try {
      const SLARuleModel = require("../models/sla-module/SLARule").default;
      const matchedSlaRule = await SLARuleModel.findOne({
        projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
        name: {
          $regex: new RegExp(
            `^${ticketPriority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
        isActive: true,
      })
        .select("_id")
        .lean();
      if (matchedSlaRule) slaRuleIdForTicket = matchedSlaRule._id;
    } catch (_e) {
      /* non-critical - ticket still saves without slaRuleId */
    }

    // Snapshot the form schema at the moment of submission (US-7)
    const formSchemaSnapshot =
      project.configuration?.ticketSubmissionSettings?.onlineFormFields || [];

    // Validate field-level rules (minLength, maxLength, regex) from the schema
    for (const field of formSchemaSnapshot as any[]) {
      const v = field.validation;
      if (!v) continue;
      const rawVal = ticketData[field.fieldName];
      const value = rawVal == null ? "" : String(rawVal);
      if (!value) continue; // required check already done above
      const label = field.displayLabel || field.fieldName;
      if (v.minLength != null && value.length < Number(v.minLength)) {
        return res.status(400).json({
          success: false,
          message: `${label} must be at least ${v.minLength} characters`,
        });
      }
      if (v.maxLength != null && value.length > Number(v.maxLength)) {
        return res.status(400).json({
          success: false,
          message: `${label} must be at most ${v.maxLength} characters`,
        });
      }
      if (v.regex) {
        try {
          const re = new RegExp(v.regex);
          if (!re.test(value)) {
            return res.status(400).json({
              success: false,
              message: `${label} is not in the correct format`,
            });
          }
        } catch {
          // invalid regex — skip
        }
      }
    }

    // Build categoryHierarchy from the body — prefer the parsed hierarchy object;
    // at minimum populate level1 from the resolved categoryObjectId so SLA lookups work.
    const builtCategoryHierarchy = rawCategoryHierarchyFromBody
      ? {
          level1: rawCategoryHierarchyFromBody.level1
            ? mongoose.Types.ObjectId.isValid(
                rawCategoryHierarchyFromBody.level1,
              )
              ? new mongoose.Types.ObjectId(rawCategoryHierarchyFromBody.level1)
              : undefined
            : (categoryObjectId ?? undefined),
          level2:
            rawCategoryHierarchyFromBody.level2 &&
            mongoose.Types.ObjectId.isValid(rawCategoryHierarchyFromBody.level2)
              ? new mongoose.Types.ObjectId(rawCategoryHierarchyFromBody.level2)
              : undefined,
          level3:
            rawCategoryHierarchyFromBody.level3 &&
            mongoose.Types.ObjectId.isValid(rawCategoryHierarchyFromBody.level3)
              ? new mongoose.Types.ObjectId(rawCategoryHierarchyFromBody.level3)
              : undefined,
          level4:
            rawCategoryHierarchyFromBody.level4 &&
            mongoose.Types.ObjectId.isValid(rawCategoryHierarchyFromBody.level4)
              ? new mongoose.Types.ObjectId(rawCategoryHierarchyFromBody.level4)
              : undefined,
          level5:
            rawCategoryHierarchyFromBody.level5 &&
            mongoose.Types.ObjectId.isValid(rawCategoryHierarchyFromBody.level5)
              ? new mongoose.Types.ObjectId(rawCategoryHierarchyFromBody.level5)
              : undefined,
          displayPath: rawCategoryHierarchyFromBody.displayPath,
        }
      : categoryObjectId
        ? { level1: categoryObjectId }
        : undefined;

    // Collect custom form fields — everything except the standard mapped fields
    const standardKeys = new Set([
      "Name",
      "Email",
      "Phone",
      "Subject",
      "Description",
      "Category",
    ]);
    const customFieldsForMetadata: Record<string, any> = {};
    for (const [key, val] of Object.entries(ticketData)) {
      if (!standardKeys.has(key)) customFieldsForMetadata[key] = val;
    }

    const ticket = new Ticket({
      ticketNumber,
      subject: ticketData.Subject || "New Ticket", // ← was incorrectly "title:"
      description: ticketData.Description || "",
      status: 1, // 1 = Open (numeric code)
      priority: ticketPriority, // Use priority from category default or fallback
      slaRuleId: slaRuleIdForTicket, // ObjectId ref to SLA rule (rename-resilient)
      category: categoryObjectId ?? undefined, // ObjectId (or omit if invalid)
      categoryHierarchy: builtCategoryHierarchy, // Full hierarchy from HierarchyCategorySelector
      project: projectObjectIdForMetadata, // Required for project-scoped queries
      createdBy: studentUserId, // Use actual student user ID
      assignedTo: assignedAgent, // Auto-assigned agent (if enabled)
      assignedVia: assignmentResult?.assignedVia ?? undefined,
      assignmentAttempts: assignmentResult?.attempts ?? 0,
      submissionSource: "online", // Mark as online submission
      attachments,
      tags: [`student-submission`, `project-${projectId}`, "online"], // Add 'online' tag for online submissions
      formSchemaSnapshot,
      // Store student contact info and custom field values in metadata
      metadata: {
        studentName: ticketData.Name,
        studentEmail: ticketData.Email,
        studentPhone: ticketData.Phone,
        projectId: projectObjectIdForMetadata, // Always use ObjectId
        centerId: "online", // Online tickets have center marked as 'online'
        submissionType: "online",
        autoAssigned: !!assignedAgent,
        assignedVia: assignmentResult?.assignedVia ?? null,
        customFields: customFieldsForMetadata, // Persist Application ID and all other custom fields
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ticket.save();
    console.timeEnd("⏱️ Ticket save");

    // Emit real-time event so all connected agents on the ticket list refresh automatically
    (() => {
      try {
        const { getIo } = require("../socket/ioInstance");
        const { emitTicketListUpdate } = require("../socket/socketHandlers");
        const io = getIo();
        if (io) {
          emitTicketListUpdate(io, projectId, {
            type: "new-ticket",
            ticket: {
              _id: ticket._id,
              ticketNumber: ticket.ticketNumber,
              subject: ticket.subject,
              status: ticket.status,
              priority: ticket.priority,
              createdAt: ticket.createdAt,
              metadata: { projectId },
            },
          });
        }
      } catch (socketErr) {
        console.error(
          "⚠️ Failed to emit ticket-list-update socket event:",
          socketErr,
        );
      }
    })();

    console.log(
      `✅ Ticket created successfully: ${ticket._id} | Created by: ${studentUserId}${assignedAgent ? ` | Assigned to: ${assignedAgent}` : " | Unassigned"}`,
    );

    // Dashboard cache invalidation (fire-and-forget)
    dashboardEvents.emit("ticket.created", { tenantId: projectId, projectId });

    // Notification engine: ticket_created — only notify the assigned agent.
    // When a ticket is assigned, TICKET_ASSIGNED_TO_ME (below) already fires, so
    // we do NOT fan-out TICKET_CREATED to all counselors in the centre; that was
    // causing every counselor to see notifications for tickets not assigned to them.
    // If the ticket is unassigned there is nobody to notify yet — they will be
    // notified via TICKET_ASSIGNED_TO_ME once the ticket is manually assigned.
    // (Role-based fan-out is intentionally removed here.)

    // Notification engine: ticket_assigned_to_me (direct to assigned agent)
    if (assignedAgent) {
      fireNotification({
        triggerType: TRIGGER_TYPES.TICKET_ASSIGNED_TO_ME,
        triggeredByUserId: studentUserId,
        projectId: projectId,
        entityType: "ticket",
        entityId: ticket._id as mongoose.Types.ObjectId,
        deepLinkUrl: `/projects/${projectId}/tickets/${ticket._id}`,
        templateVars: { ticketNumber: ticket.ticketNumber },
        recipientOverride: [
          new mongoose.Types.ObjectId(assignedAgent.toString()),
        ],
      }).catch(console.error);
    }

    // Send in-app + push notification to the assigned agent (non-blocking)
    if (assignedAgent) {
      (async () => {
        try {
          const {
            createNotification,
          } = require("../controllers/notificationController");
          const isProduction = process.env.NODE_ENV === "production";
          const frontendUrl = isProduction
            ? process.env.PRODUCTION_FRONTEND_URL ||
              "https://helpdesk.hubblehox.ai"
            : process.env.FRONTEND_URL || "http://localhost:3001";
          await createNotification({
            userId: new mongoose.Types.ObjectId(assignedAgent.toString()),
            projectId: new mongoose.Types.ObjectId(projectId),
            type: "info" as const,
            title: `New Ticket: ${ticket.ticketNumber}`,
            message: ticket.subject,
            ticketId: ticket._id as mongoose.Types.ObjectId,
            link: `${frontendUrl}/tickets/${ticket._id}`,
          });
        } catch (notifErr) {
          console.error("⚠️ Failed to send new-ticket notification:", notifErr);
        }
      })();
    }

    // US-ASSIGN-001: Record truly-unresolvable fallback (self-assign) in changeHistory for dashboard tracking
    // Note: project-level round-robin is assignedVia='round-robin' and does NOT enter this block
    if (assignmentResult?.assignedVia === "fallback") {
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $push: {
            changeHistory: {
              field: "assignment_fallback",
              oldValue: "unassigned",
              newValue: "fallback",
              changedBy: new mongoose.Types.ObjectId(studentUserId),
              changedAt: new Date(),
              changeType: "update" as const,
              reassignmentReason:
                "Assignment fallback: no eligible agents in pool, assigned to submitting user",
            },
          },
        },
      );
    }

    // Initialize priority-level SLA tracking (non-blocking)
    (async () => {
      try {
        // Get working calendar for the project
        const calendar = await slaService.getDefaultWorkingCalendar(projectId);

        // Get priority details - first try Priority model, fallback to SLARule
        let priority = await Priority.findOne({
          code: ticketPriority.toUpperCase(),
          projectId: projectId,
        });

        // Fallback: If no Priority record exists, try to get resolution time from SLARule
        if (!priority) {
          const SLARule = (await import("../models/sla-module/SLARule.js"))
            .default;
          const slaRule = await SLARule.findOne({
            projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
            priority: ticketPriority.toUpperCase(),
            isActive: true,
          });

          if (slaRule) {
            // Create a virtual priority object from SLA rule
            priority = {
              code: ticketPriority.toUpperCase(),
              resolutionTime: slaRule.resolutionTime,
              responseTime: slaRule.responseTime || { value: 1, unit: "hours" },
            } as any;
            console.log(
              `📋 Using SLARule for priority ${ticketPriority}: ${JSON.stringify(slaRule.resolutionTime)}`,
            );
          }
        }

        if (priority && calendar) {
          // Calculate ticket-level SLA
          const ticketSLADueDate = await slaService.calculateTicketLevelSLA(
            ticket.createdAt,
            priority.code,
            project._id as mongoose.Types.ObjectId,
            calendar._id as mongoose.Types.ObjectId,
          );

          if (ticketSLADueDate) {
            // Use atomic updateOne to avoid overwriting escalationMatrixId/roleLevelSLA
            // set by the concurrent autoAssignMatrixToTicket IIFE (race condition fix).
            await Ticket.updateOne(
              { _id: ticket._id },
              {
                $set: {
                  ticketLevelSLA: {
                    dueAt: ticketSLADueDate,
                    pausedDuration: 0,
                  },
                  workingCalendarId: calendar._id,
                },
              },
            );
            console.log(
              `✅ Priority-level SLA tracking initialized for ticket ${ticket.ticketNumber}`,
            );
          }
        }
      } catch (error) {
        console.error(
          "❌ Failed to initialize priority-level SLA tracking:",
          error,
        );
      }
    })();

    // Initialize SLA tracking for the new ticket (non-blocking)
    (async () => {
      try {
        await initializeSLATracking(
          ticket._id,
          new mongoose.Types.ObjectId(projectId),
          ticketPriority,
          ticket.createdAt,
          ticket.categoryHierarchy?.level1, // US-017: category SLA override
        );
        console.log(
          `✅ SLA tracking initialized for ticket ${ticket.ticketNumber}`,
        );
      } catch (error) {
        console.error("❌ Failed to initialize SLA tracking:", error);
      }
    })();

    // Auto-assign escalation matrix based on project and priority (non-blocking)
    (async () => {
      try {
        const result = await autoAssignMatrixToTicket(
          ticket._id,
          projectId,
          ticketPriority,
          (deepestCategoryObjectId ?? categoryObjectId)?.toString(), // US-021: use deepest category for matrix lookup
        );
        if (result.success) {
          console.log(
            `✅ Escalation matrix auto-assigned for ticket ${ticket.ticketNumber}`,
          );
        } else {
          console.log(
            `ℹ️ No escalation matrix for ticket ${ticket.ticketNumber}: ${result.message}`,
          );
        }
      } catch (error) {
        console.error("❌ Failed to auto-assign escalation matrix:", error);
      }
    })();

    // Check feedback triggers for ticket creation (non-blocking)
    (async () => {
      try {
        const {
          checkAndTriggerFeedback,
        } = require("../services/feedbackTriggerService");
        await checkAndTriggerFeedback("ticket_created", {
          projectId: projectId,
          ticketId: ticket._id.toString(),
        });
      } catch (error) {
        console.error(
          "Error checking ticket_created feedback triggers:",
          error,
        );
      }
    })();

    // Log activity (non-blocking - fire and forget)
    (async () => {
      try {
        await logActivity({
          userId: studentUserId.toString(),
          userName: studentName || "Student",
          userEmail: studentEmail || "unknown@student.com",
          action: "create",
          entity: "ticket",
          entityId: ticket._id.toString(),
          entityName: ticket.subject,
          projectId: projectId,
          projectName: project.name,
          description: `Ticket ${ticket.ticketNumber} created via online submission`,
          req,
          metadata: { ticketNumber: ticket.ticketNumber, source: "online" },
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }
    })();

    // Send email notifications to student (non-blocking - fire and forget)
    if (studentEmail) {
      // Send emails in background without blocking the response
      (async () => {
        try {
          // Send welcome email if this is a new student
          if (isNewStudent) {
            const customUrlPath = project.branding?.customUrlPath || "portal";
            const isProduction = process.env.NODE_ENV === "production";
            const frontendUrl = isProduction
              ? process.env.PRODUCTION_FRONTEND_URL ||
                "https://helpdesk.hubblehox.ai"
              : process.env.FRONTEND_URL || "http://localhost:3001";
            const loginUrl = `${frontendUrl}/${customUrlPath}/student/login`;

            await sendStudentWelcomeEmail(
              studentEmail,
              studentName,
              project.name,
              loginUrl,
              projectId,
            );
          }

          // Send ticket creation confirmation
          await sendTicketCreatedEmail(
            studentEmail,
            ticket.ticketNumber,
            ticket.subject,
            projectId,
            {
              studentName: studentName,
              status: getStatusName(ticket.status),
              priority: ticket.priority,
            },
          );
        } catch (emailError) {
          console.error("Failed to send email notifications:", emailError);
          // Don't fail the request if email fails
        }
      })();
    }

    console.timeEnd("⏱️ Total submitTicket");
    const totalTime = Date.now() - perfStart;
    console.log(`⚡ Total API response time: ${totalTime}ms`);

    return res.status(201).json({
      success: true,
      message: "Ticket submitted successfully",
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
      },
    });
  } catch (error) {
    console.timeEnd("⏱️ Total submitTicket");
    console.error("Submit ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit ticket",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get all tickets created by a specific student within a project.
 * Used by agents for duplicate-check display ONLY — no center/assignment filters applied.
 * Requires caller to be authenticated; any agent role may call this.
 */
export const getStudentTicketHistory = async (req: Request, res: Response) => {
  try {
    const callerId = (req as any).user?.userId;
    if (!callerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const studentId = req.query.studentId as string;
    const projectId = req.query.projectId as string;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid studentId" });
    }

    const query: any = {
      createdBy: new mongoose.Types.ObjectId(studentId),
      isMerged: { $ne: true },
    };

    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      query["metadata.projectId"] = {
        $in: [projectId, new mongoose.Types.ObjectId(projectId)],
      };
    }

    const tickets = await Ticket.find(query)
      .select(
        "ticketNumber subject status categoryHierarchy category assignedTo metadata createdAt",
      )
      .populate("assignedTo", "firstName lastName")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Populate center names
    const centerIds = [
      ...new Set(
        tickets
          .map((t: any) => {
            const c = t.metadata?.centerId;
            return c && c !== "online" ? c.toString() : null;
          })
          .filter(Boolean),
      ),
    ];
    const centers =
      centerIds.length > 0
        ? await Center.find({ _id: { $in: centerIds } })
            .select("centerName")
            .lean()
        : [];
    const centerMap = new Map(
      centers.map((c: any) => [c._id.toString(), c.centerName]),
    );

    const result = tickets.map((t: any) => {
      if (t.metadata?.centerId && t.metadata.centerId !== "online") {
        const name = centerMap.get(t.metadata.centerId.toString());
        if (name) t.metadata.centerId = { centerName: name };
      }
      return t;
    });

    return res.status(200).json({
      success: true,
      data: { tickets: result },
    });
  } catch (error) {
    console.error("getStudentTicketHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch student ticket history",
    });
  }
};

/**
 * Get tickets for logged-in student user
 */
export const getMyTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Convert userId to ObjectId for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get user with role (lean for speed), then fetch role permissions separately
    const userDoc = await User.findById(userId).populate("role").lean();
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Fetch permissions for the role (single targeted query)
    let roleWithPerms = userDoc.role as any;
    if (roleWithPerms?._id) {
      const rp = await (mongoose.model("Role") as any)
        .findById(roleWithPerms._id)
        .populate("permissions", "code")
        .lean();
      if (rp) roleWithPerms = rp;
    }
    const user = { ...userDoc, role: roleWithPerms };

    // Check if user has TICKET_VIEW_ALL permission
    const role = roleWithPerms;
    const permissions = role?.permissions || [];
    const permissionCodes = permissions
      .map((p: any) => p.code)
      .filter((c: any) => c); // Filter out undefined
    const hasViewAll = permissionCodes.includes("TICKET_VIEW_ALL");
    const hasViewOwn = permissionCodes.includes("TICKET_VIEW_OWN");
    const isSuperAdmin = role?.code === "SUPER_ADMIN";

    // Check if user is a student based on role code
    const isStudent = role?.code === "STUDENT";
    // Agent roles: L1, L2, L3, PM, AGENT, or has isAgent flag, or has agent-like permissions
    const agentRoleCodes = [
      "L1",
      "L2",
      "L3",
      "PM",
      "AGENT ",
      "COUNSELOR_L1",
      "COUNSELOR",
      "DISTRICT_NODAL_OFFICER",
      "DNO",
      "HUB_COORDINATOR",
      "HC",
    ];
    // Detect as agent if role has isAgent flag, role code is in the list, or user has agent-like permissions
    const agentPermissions = [
      "TICKET_ASSIGN",
      "TICKET_ESCALATE",
      "TICKET_RESPOND",
      "TICKET_CLOSE",
    ];
    const hasAgentPermission = agentPermissions.some((perm) =>
      permissionCodes.includes(perm),
    );
    const isAgent =
      role?.isAgent === true ||
      agentRoleCodes.includes(role?.code) ||
      hasAgentPermission;

    // Build query based on permissions and role type
    let query: any = {};

    // Super Admin should see EMPTY list in My Tickets (no tickets assigned to them)
    if (isSuperAdmin) {
      return res.status(200).json({
        success: true,
        data: [],
        message:
          "Super Admin has no assigned tickets. Use View Tickets to see all tickets.",
      });
    } else if (isStudent) {
      // Students always see tickets by their email (tickets they created)
      query["metadata.studentEmail"] = user.email;
    } else if (hasViewOwn) {
      query.assignedTo = userObjectId;
    } else {
      query.assignedTo = userObjectId;
    }

    // Filter by project if projectId is provided in query params
    if (req.query.projectId) {
      // Query for both ObjectId and string for backward compatibility
      // (older email-to-ticket stored as string, newer stores as ObjectId)
      const projectIdStr = req.query.projectId as string;
      try {
        const projectObjectId = new mongoose.Types.ObjectId(projectIdStr);
        // Match either ObjectId or string representation
        const existingQuery = { ...query };
        query = {
          $and: [
            existingQuery,
            {
              $or: [
                { "metadata.projectId": projectObjectId },
                { "metadata.projectId": projectIdStr },
              ],
            },
          ],
        };
        // no extra log
      } catch (e) {
        query["metadata.projectId"] = projectIdStr;
      }
    } else {
      const userProjectIds = (user.projects || []).map((p: any) =>
        typeof p === "string" ? p : p._id?.toString() || p.toString(),
      );
      const roleProjectIds = (role?.projects || []).map((p: any) =>
        typeof p === "string" ? p : p._id?.toString() || p.toString(),
      );
      const allUserProjectIds = [
        ...new Set([...userProjectIds, ...roleProjectIds]),
      ];

      if (allUserProjectIds.length > 0) {
        const projectObjectIds = allUserProjectIds.map((id) => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch (e) {
            return id;
          }
        });
        query["metadata.projectId"] = {
          $in: [...projectObjectIds, ...allUserProjectIds],
        };
      }
    }

    // ============================================
    // CENTER FILTERING (based on project settings)
    // ============================================
    // Apply center filtering ONLY if project is in offline mode
    if (isAgent && (user.centers || []).length > 0) {
      // Determine which projects are being queried
      let projectIdsToCheck: string[] = [];

      if (req.query.projectId) {
        projectIdsToCheck = [req.query.projectId as string];
      } else {
        const userProjectIds = (user.projects || []).map((p: any) =>
          typeof p === "string" ? p : p._id?.toString() || p.toString(),
        );
        const roleProjectIds = (role?.projects || []).map((p: any) =>
          typeof p === "string" ? p : p._id?.toString() || p.toString(),
        );
        projectIdsToCheck = [
          ...new Set([...userProjectIds, ...roleProjectIds]),
        ];
      }

      // Fetch project settings to check if offline mode is enabled
      const projects = await Project.find({
        _id: {
          $in: projectIdsToCheck.map((id) => new mongoose.Types.ObjectId(id)),
        },
      })
        .select("settings.mode settings.enableOfflineCenter")
        .lean();

      // Check if ANY of the projects have offline mode enabled
      const hasOfflineProject = projects.some((proj: any) => {
        const mode = proj.settings?.mode;
        const enableOffline = proj.settings?.enableOfflineCenter;
        // Only apply center filtering if explicitly set to offline or both with offline enabled
        // If mode is not set or is 'online', don't apply center filtering
        if (!mode || mode === "online") return false;
        if (mode === "offline") return true;
        if (mode === "both") return enableOffline !== false; // Default to true for 'both' mode
        return false;
      });

      if (hasOfflineProject) {
        // Apply center filtering only for offline projects
        const userCenterIds = (user.centers || []).map((c: any) =>
          typeof c === "string" ? c : c._id?.toString() || c.toString(),
        );

        const centerFilter = {
          $or: [
            { "metadata.centerId": "online" }, // Include all online tickets
            { "metadata.centerId": { $in: userCenterIds } }, // Include offline tickets from assigned centers
            { "metadata.centerId": { $exists: false } }, // Include tickets without center (legacy data)
            { "metadata.createdByAgent": userId }, // Include tickets created by this agent
          ],
        };

        // Merge center filter with existing query
        const existingQuery = { ...query };
        if (existingQuery.$and) {
          query = { $and: [...existingQuery.$and, centerFilter] };
        } else {
          query = { $and: [existingQuery, centerFilter] };
        }
      }
    }

    // ============================================
    // ADDITIONAL FILTERS (status, priority, search, dates, category)
    // ============================================

    // Status filter (1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed)
    if (req.query.status) {
      const statusValues = String(req.query.status)
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((s) => [1, 2, 3, 4, 5].includes(s));
      if (statusValues.length > 0) {
        query.status = { $in: statusValues };
        console.log(`🔍 [FILTER] Status: ${statusValues.join(", ")}`);
      }
    }

    // Priority filter (dynamic - accepts any configured project priority code)
    if (req.query.priority) {
      const priorityValues = String(req.query.priority)
        .split(",")
        .map((p) => p.trim().toUpperCase())
        .filter((p) => p.length > 0);
      if (priorityValues.length > 0) {
        query.priority = { $in: [...new Set(priorityValues)] };
        console.log(`🔍 [FILTER] Priority: ${priorityValues.join(", ")}`);
      }
    }

    // Search filter (global — searches across all relevant ticket and student fields)
    if (req.query.search) {
      const searchTerm = String(req.query.search)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .trim();
      if (searchTerm) {
        const searchRegex = { $regex: searchTerm, $options: "i" };

        // Find users whose name, email, or mobile matches the query
        const matchingUsers = await User.find(
          {
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { mobile: searchRegex },
              { phone: searchRegex },
            ],
          },
          { _id: 1 },
        ).lean();
        const matchingUserIds = matchingUsers.map((u: any) => u._id);

        query.$or = [
          { ticketNumber: searchRegex },
          { subject: searchRegex },
          { description: searchRegex },
          { mobile: searchRegex },
          { sourceEmail: searchRegex },
          { sourceEmailName: searchRegex },
          { "metadata.studentName": searchRegex },
          { "metadata.studentEmail": searchRegex },
          { "metadata.studentPhone": searchRegex },
          ...(matchingUserIds.length > 0
            ? [{ createdBy: { $in: matchingUserIds } }]
            : []),
        ];
        console.log(
          `🔍 [FILTER] Global search: "${searchTerm}" (matched ${matchingUserIds.length} users)`,
        );
      }
    }

    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) {
          query.createdAt.$gte = afterDate;
        }
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // Category filter
    if (req.query.categoryId) {
      query.category = req.query.categoryId;
      console.log(`🔍 [FILTER] Category: ${req.query.categoryId}`);
    }

    // Custom field filters (customField_FieldName=value)
    Object.keys(req.query).forEach((key) => {
      if (key.startsWith("customField_")) {
        const fieldName = key.replace(/^customField_/, "");
        const value = req.query[key] as string;
        if (value && value.trim()) {
          query[`metadata.customFields.${fieldName}`] = new RegExp(
            value.trim(),
            "i",
          );
        }
      }
    });

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "priority",
      "status",
      "ticketNumber",
    ];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Get pagination parameters with max limit enforcement.
    // The My Tickets page loads the user's full (scoped) ticket set and does its
    // own client-side status/priority filtering + pagination, so it must be able
    // to request all of them — not just the first 50. Allow a large explicit
    // limit (default stays 50 for any caller that doesn't ask for more).
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100000);
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalTickets = await Ticket.countDocuments(query);

    // Find tickets based on query with pagination
    // OPTIMIZED: Exclude heavy fields (threads, comments, history) from list view
    const tickets = await Ticket.find(query)
      .select(
        "-threads -comments -internalNotes -changeHistory -escalationHistory -description",
      )
      .populate("assignedTo", "firstName lastName email")
      .populate("category", "name code")
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // OPTIMIZED: Batch fetch all projects and centers instead of N+1 queries
    const projectIds = [
      ...new Set(
        tickets
          .map((t) => (t as any).metadata?.projectId?.toString())
          .filter(Boolean),
      ),
    ];
    const centerIds = [
      ...new Set(
        tickets
          .map((t) => {
            const centerId = (t as any).metadata?.centerId;
            return centerId && centerId !== "online"
              ? centerId.toString()
              : null;
          })
          .filter(Boolean),
      ),
    ];

    const [projects, centers, statusRecords] = await Promise.all([
      projectIds.length > 0
        ? Project.find({ _id: { $in: projectIds } })
            .select("name code")
            .lean()
        : Promise.resolve([]),
      centerIds.length > 0
        ? Center.find({ _id: { $in: centerIds } })
            .select("centerName city state")
            .lean()
        : Promise.resolve([]),
      projectIds.length > 0
        ? Status.find({ projectId: { $in: projectIds }, isActive: true })
            .select("name code color projectId")
            .lean()
        : Promise.resolve([]),
    ]);

    // Batch-fetch category names for hierarchy levels 2-4
    const hierarchyCategoryIdsMyTickets = [
      ...new Set(
        tickets.flatMap((t: any) => {
          const h = t.categoryHierarchy;
          if (!h) return [];
          return [h.level1, h.level2, h.level3, h.level4, h.level5]
            .filter(Boolean)
            .map((id: any) => id.toString());
        }),
      ),
    ];
    const hierarchyCategoryDocsMyTickets =
      hierarchyCategoryIdsMyTickets.length > 0
        ? await Category.find({ _id: { $in: hierarchyCategoryIdsMyTickets } })
            .select("name")
            .lean()
        : [];
    const hierarchyCategoryMapMyTickets = new Map(
      hierarchyCategoryDocsMyTickets.map((c: any) => [
        c._id.toString(),
        c.name,
      ]),
    );

    const projectMap = new Map(
      projects.map((p: any) => [
        p._id.toString(),
        { _id: p._id, name: p.name, code: p.code },
      ]),
    );
    const centerMap = new Map(
      centers.map((c: any) => [
        c._id.toString(),
        { _id: c._id, centerName: c.centerName, city: c.city, state: c.state },
      ]),
    );
    // statusLookup key: "<projectId>_<statusCode>"
    const statusLookup = new Map(
      (statusRecords as any[]).map((s) => [
        `${s.projectId.toString()}_${s.code}`,
        { name: s.name, color: s.color },
      ]),
    );

    // Map tickets with populated data (no additional queries)
    // Note: Using lean() so tickets are already plain objects
    const ticketsWithProject = tickets.map((ticket: any) => {
      const ticketObj = { ...ticket };
      if (ticketObj.metadata?.projectId) {
        const project = projectMap.get(ticketObj.metadata.projectId.toString());
        if (project) {
          ticketObj.metadata.projectId = project;
        }
      }
      if (
        ticketObj.metadata?.centerId &&
        ticketObj.metadata.centerId !== "online"
      ) {
        const center = centerMap.get(ticketObj.metadata.centerId.toString());
        if (center) {
          ticketObj.metadata.centerId = center;
        } else {
          // Convert to string so frontend receives a string, not a raw BSON ObjectId object
          ticketObj.metadata.centerId = ticketObj.metadata.centerId.toString();
        }
      }
      // Enrich with project-specific status name and color
      const rawProjectId =
        typeof ticketObj.metadata?.projectId === "object"
          ? ticketObj.metadata.projectId._id?.toString()
          : ticketObj.metadata?.projectId?.toString();
      if (rawProjectId) {
        const statusEntry = statusLookup.get(
          `${rawProjectId}_${ticketObj.status}`,
        );
        if (statusEntry) {
          ticketObj.statusName = statusEntry.name;
          ticketObj.statusColor = statusEntry.color;
        }
      }
      // Enrich categoryHierarchyNames so hierarchy_level_N columns can render names
      if (ticketObj.categoryHierarchy) {
        const h = ticketObj.categoryHierarchy;
        ticketObj.categoryHierarchyNames = {
          // level1 = the TRUE level-1 category (categoryHierarchy.level1); the
          // populated `category` field is the DEEPEST level for offline tickets.
          level1: h.level1
            ? hierarchyCategoryMapMyTickets.get(h.level1.toString())
            : ticketObj.category?.name || undefined,
          level2: h.level2
            ? hierarchyCategoryMapMyTickets.get(h.level2.toString())
            : undefined,
          level3: h.level3
            ? hierarchyCategoryMapMyTickets.get(h.level3.toString())
            : undefined,
          level4: h.level4
            ? hierarchyCategoryMapMyTickets.get(h.level4.toString())
            : undefined,
          level5: h.level5
            ? hierarchyCategoryMapMyTickets.get(h.level5.toString())
            : undefined,
        };
      }
      return ticketObj;
    });

    console.log(
      `📋 Retrieved ${tickets.length} tickets for ${hasViewAll ? "all users" : `student ${user.email}`}${req.query.projectId ? ` in project ${req.query.projectId}` : ""}`,
    );

    return res.status(200).json({
      success: true,
      data: ticketsWithProject,
      pagination: {
        total: totalTickets,
        page,
        limit,
        totalPages: Math.ceil(totalTickets / limit),
      },
    });
  } catch (error) {
    console.error("Get my tickets error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get all tickets for View Tickets page
 * - Super Admin: ALL tickets across all projects
 * - Users with TICKET_VIEW_ALL: Tickets from their assigned projects
 * - Agents (isAgent=true): Tickets assigned to them in their assigned projects
 */
export const getAllTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get project context from middleware (if available)
    const projectContext = (req as any).projectContext;
    console.log(`🔍 [VIEW_TICKETS] Project context:`, projectContext);

    // Get pagination parameters with max limit enforcement
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100
    const skip = (page - 1) * limit;

    // Get filter parameters
    const statusFilter = req.query.status
      ? (req.query.status as string).split(",").map(Number)
      : null;
    const priorityFilter = req.query.priority
      ? (req.query.priority as string).split(",")
      : null;
    const searchQuery = req.query.search as string;
    const projectIdsFilter = req.query.projectIds
      ? (req.query.projectIds as string).split(",")
      : null;

    // NEW: Hierarchy-based filtering for "Assign Queries" page
    const forAssignment = req.query.forAssignment === "true";

    // Get user with their role and permissions
    const user = await User.findById(userId)
      .populate({
        path: "role",
        populate: {
          path: "permissions",
          model: "Permission",
        },
      })
      .populate("projects");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const role = user.role as any;
    const isSuperAdmin = role?.code === "SUPER_ADMIN";
    const isAgent = role?.isAgent || false;
    const permissions = role?.permissions || [];
    const permissionCodes = permissions
      .map((p: any) => p.code)
      .filter((c: any) => c);
    const hasViewAll = permissionCodes.includes("TICKET_VIEW_ALL");
    const hasViewOwn = permissionCodes.includes("TICKET_VIEW_OWN");

    console.log(`🔍 [VIEW_TICKETS] User: ${user.email}`);
    console.log(`🔍 [VIEW_TICKETS] Role: ${role?.name} (${role?.code})`);
    console.log(
      `🔍 [VIEW_TICKETS] isSuperAdmin: ${isSuperAdmin}, hasViewAll: ${hasViewAll}, isAgent: ${isAgent}, hasViewOwn: ${hasViewOwn}`,
    );
    console.log(`🔍 [VIEW_TICKETS] forAssignment: ${forAssignment}`);

    let query: any = {};

    // ============ HIERARCHY-BASED FILTERING FOR ASSIGN QUERIES ============
    // When forAssignment=true, filter to only show tickets assigned to:
    // 1. The current user (self)
    // 2. All users who report to the current user (subordinates)
    // Uses the 'reportingManager' field on User documents (NOT the userreportinghierarchies collection)
    if (forAssignment && !isSuperAdmin) {
      try {
        // Get all users who have current user as their reportingManager (direct + recursive)
        const getAllReporteesRecursive = async (
          managerId: mongoose.Types.ObjectId,
          visited = new Set<string>(),
        ): Promise<mongoose.Types.ObjectId[]> => {
          const managerIdStr = managerId.toString();
          if (visited.has(managerIdStr)) return []; // Prevent infinite loops
          visited.add(managerIdStr);

          // Find all users who report to this manager
          const directReportees = await User.find({
            reportingManager: managerId,
          })
            .select("_id")
            .lean();
          const reporteeIds = directReportees.map(
            (r: any) => r._id as mongoose.Types.ObjectId,
          );

          // Recursively get reportees of reportees
          const allReportees: mongoose.Types.ObjectId[] = [...reporteeIds];
          for (const reporteeId of reporteeIds) {
            const subReportees = await getAllReporteesRecursive(
              reporteeId,
              visited,
            );
            allReportees.push(...subReportees);
          }

          return allReportees;
        };

        const currentUserObjectId = new mongoose.Types.ObjectId(userId);
        const allReporteeIds =
          await getAllReporteesRecursive(currentUserObjectId);

        // Build list: current user (FIRST) + all reportees
        const assignableObjectIds = [currentUserObjectId, ...allReporteeIds];

        console.log(
          `📊 [ASSIGN QUERIES] Hierarchy-based filtering (using User.reportingManager):`,
        );
        console.log(`   - Current user (SELF): ${userId}`);
        console.log(`   - Reportee count: ${allReporteeIds.length}`);
        console.log(
          `   - Total assignable users: ${assignableObjectIds.length}`,
        );

        // Filter tickets assigned to these users (self + subordinates)
        query.assignedTo = { $in: assignableObjectIds };
      } catch (hierarchyError) {
        console.log(
          "⚠️ Hierarchy fetch failed, showing only user's own tickets:",
          hierarchyError,
        );
        // Fallback: show only tickets assigned to current user
        query.assignedTo = new mongoose.Types.ObjectId(userId);
      }
    }

    // Get user's role projects (projects assigned to their role)
    const Role = await mongoose.model("Role").findById(role?._id);
    const roleProjectIds = toObjectIdArray((Role as any)?.projects || []);

    // SIMPLIFIED LOGIC FOR ASSIGN QUERIES PAGE:
    // 1. Super Admin: Show ALL tickets (no filters)
    // 2. Single Project Mode: Show ALL tickets from selected project
    // 3. Unified Mode: Show ALL tickets from user's assigned projects
    // 4. If offline mode with center: Filter by project + center

    console.log(
      `🔍 [ASSIGN QUERIES] ==================== FILTER LOGIC START ====================`,
    );
    console.log(`🔍 [ASSIGN QUERIES] User: ${user.email}, Role: ${role?.code}`);
    console.log(`🔍 [ASSIGN QUERIES] isSuperAdmin: ${isSuperAdmin}`);
    console.log(
      `🔍 [ASSIGN QUERIES] projectContext:`,
      JSON.stringify(projectContext, null, 2),
    );
    console.log(
      `🔍 [ASSIGN QUERIES] roleProjectIds count: ${roleProjectIds.length}`,
    );
    console.log(
      `🔍 [ASSIGN QUERIES] Query params - viewMode: ${req.query.viewMode}, projectId: ${req.query.projectId}`,
    );

    // Track whether project filter was applied in the branches below.
    // This is needed because the center filter later restructures `query` into
    // { $and: [originalQuery, centerFilter] }, making query['metadata.projectId']
    // undefined at the top level. The fallback block must NOT re-add the project
    // filter after the restructure, as it would create a conflicting top-level
    // condition that restricts results to only ObjectId-stored projectIds.
    let projectFilterApplied = false;

    if (isSuperAdmin) {
      // Super Admin: ALL projects by default, but honor an explicit Project
      // filter when one is selected (the Project dropdown sends projectId →
      // projectContext.currentProjectId). Without this the Project filter was
      // silently ignored for super admins.
      const saProjectId = projectContext?.currentProjectId;
      if (saProjectId && mongoose.Types.ObjectId.isValid(String(saProjectId))) {
        const pidStr = String(saProjectId);
        query["metadata.projectId"] = {
          $in: [pidStr, new mongoose.Types.ObjectId(pidStr)],
        };
        projectFilterApplied = true;
        console.log(
          `✅ [VIEW_TICKETS] Super Admin - filtered to project ${pidStr}`,
        );
      } else {
        console.log(`✅ [VIEW_TICKETS] Super Admin - showing ALL tickets`);
      }
    } else if (
      projectContext?.viewMode === "single" &&
      projectContext.currentProjectId
    ) {
      // Single Project Mode: Show ALL tickets from selected project
      // Database has mixed types (string and ObjectId), so query for BOTH
      const projectIdStr = projectContext.currentProjectId.toString();
      query["metadata.projectId"] = {
        $in: [projectIdStr, new mongoose.Types.ObjectId(projectIdStr)],
      };
      projectFilterApplied = true;
      console.log(
        `✅ [ASSIGN QUERIES] Single Project Mode - filtering by projectId (both string and ObjectId)`,
      );
      console.log(`   Query filter:`, query["metadata.projectId"]);
    } else if (
      projectContext?.viewMode === "unified" ||
      !projectContext?.currentProjectId
    ) {
      // Unified/All Projects Mode: Show ALL tickets from user's role projects
      if (roleProjectIds.length > 0) {
        // Query for both string and ObjectId versions of each project ID
        const projectIdsWithBothTypes = roleProjectIds.flatMap((id: any) => {
          const idStr = id.toString();
          return [idStr, new mongoose.Types.ObjectId(idStr)];
        });
        query["metadata.projectId"] = { $in: projectIdsWithBothTypes };
        projectFilterApplied = true;
        console.log(
          `✅ [ASSIGN QUERIES] Unified Mode - showing ALL tickets from ${roleProjectIds.length} project(s)`,
        );
      } else {
        // User has no projects assigned - return empty
        console.log(
          `❌ [ASSIGN QUERIES] User has no assigned projects - returning empty`,
        );
        return res.status(200).json({
          success: true,
          data: {
            tickets: [],
            pagination: { total: 0, page, limit, pages: 0 },
          },
        });
      }
    }

    console.log(
      `🔍 [ASSIGN QUERIES] Query after project filter:`,
      JSON.stringify(query, null, 2),
    );

    // ONLY additional filter: Center filter for offline mode
    const additionalFilters: any[] = [];

    // Check if user has centers assigned (for offline mode)
    const userCenterIds = (user.centers || []).map((c: any) => {
      const centerId =
        typeof c === "string" ? c : c._id?.toString() || c.toString();
      return centerId;
    });

    // Centre scoping applies ONLY to centre-restricted users. Super admins and
    // anyone with TICKET_VIEW_ALL must see every ticket regardless of which
    // centres happen to be assigned to their own account — otherwise two
    // super-admin accounts show different totals (and differ from the export,
    // which isn't centre-scoped).
    if (!isSuperAdmin && !hasViewAll && userCenterIds.length > 0) {
      // Filter by centers: show tickets from assigned centers OR online tickets
      const centerObjectIds = userCenterIds.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
      additionalFilters.push({
        $or: [
          { "metadata.centerId": "online" },
          {
            "metadata.centerId": {
              $in: [...userCenterIds, ...centerObjectIds],
            },
          },
          { "metadata.centerId": { $exists: false } },
          { "metadata.centerId": null },
        ],
      });
      console.log(
        `✅ [ASSIGN QUERIES] Filtering by ${userCenterIds.length} assigned center(s) + online tickets`,
      );
    }

    console.log(
      `🔍 [ASSIGN QUERIES] Additional filters count: ${additionalFilters.length}`,
    );

    // Combine all filters
    if (additionalFilters.length > 0) {
      if (query.$and) {
        query.$and.push(...additionalFilters);
      } else {
        query = { $and: [query, ...additionalFilters] };
      }
      console.log(
        `🔍 [STEP 2] Query after combining filters:`,
        JSON.stringify(query, null, 2),
      );
    }

    // Apply additional filters from query params
    if (statusFilter && statusFilter.length > 0) {
      query.status = { $in: statusFilter };
      console.log(`🔍 [VIEW_TICKETS] Filtering by status: ${statusFilter}`);
    }

    if (priorityFilter && priorityFilter.length > 0) {
      query.priority = { $in: priorityFilter };
      console.log(`🔍 [VIEW_TICKETS] Filtering by priority: ${priorityFilter}`);
    }

    if (searchQuery) {
      // Sanitize search to prevent regex injection
      const sanitizedSearch = searchQuery.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const searchRegex = { $regex: sanitizedSearch, $options: "i" };

      // Find users whose name, email, or mobile matches the query
      const matchingUsers = await User.find(
        {
          $or: [
            { name: searchRegex },
            { email: searchRegex },
            { mobile: searchRegex },
            { phone: searchRegex },
          ],
        },
        { _id: 1 },
      ).lean();
      const matchingUserIds = matchingUsers.map((u: any) => u._id);

      query.$or = [
        { ticketNumber: searchRegex },
        { subject: searchRegex },
        { description: searchRegex },
        { mobile: searchRegex },
        { sourceEmail: searchRegex },
        { sourceEmailName: searchRegex },
        { "metadata.studentName": searchRegex },
        { "metadata.studentEmail": searchRegex },
        { "metadata.studentPhone": searchRegex },
        ...(matchingUserIds.length > 0
          ? [{ createdBy: { $in: matchingUserIds } }]
          : []),
      ];
      console.log(
        `🔍 [VIEW_TICKETS] Global search for: ${sanitizedSearch} (matched ${matchingUserIds.length} users)`,
      );
    }

    // ============================================
    // ADDITIONAL FILTERS (date range, category, assignment, center)
    // ============================================

    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = query.createdAt || {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) {
          query.createdAt.$gte = afterDate;
          console.log(
            `🔍 [VIEW_TICKETS] Created after: ${afterDate.toISOString()}`,
          );
        }
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
          console.log(
            `🔍 [VIEW_TICKETS] Created before: ${beforeDate.toISOString()}`,
          );
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // Category filter
    if (req.query.categoryId) {
      query.category = req.query.categoryId;
      console.log(
        `🔍 [VIEW_TICKETS] Filtering by category: ${req.query.categoryId}`,
      );
    }

    // Assigned agent filter
    if (req.query.assignedTo) {
      if (req.query.assignedTo === "unassigned") {
        query.assignedTo = { $exists: false };
        console.log(`🔍 [VIEW_TICKETS] Filtering unassigned tickets`);
      } else {
        query.assignedTo = new mongoose.Types.ObjectId(
          req.query.assignedTo as string,
        );
        console.log(
          `🔍 [VIEW_TICKETS] Filtering by assigned agent: ${req.query.assignedTo}`,
        );
      }
    }

    // Created-by student filter (for prior-ticket lookup in offline module)
    if (req.query.createdBy) {
      const createdByStr = req.query.createdBy as string;
      if (mongoose.Types.ObjectId.isValid(createdByStr)) {
        query.createdBy = new mongoose.Types.ObjectId(createdByStr);
        console.log(
          `🔍 [VIEW_TICKETS] Filtering by createdBy: ${createdByStr}`,
        );
      }
    }

    // Submission source filter (online/offline/email/whatsapp)
    if (req.query.submissionSource) {
      query.submissionSource = req.query.submissionSource;
      console.log(
        `🔍 [VIEW_TICKETS] Filtering by source: ${req.query.submissionSource}`,
      );
    }

    // Center filter
    if (req.query.centerId) {
      query["metadata.centerId"] = req.query.centerId;
      console.log(
        `🔍 [VIEW_TICKETS] Filtering by center: ${req.query.centerId}`,
      );
    }

    // Custom field filters (customField_FieldName=value)
    Object.keys(req.query).forEach((key) => {
      if (key.startsWith("customField_")) {
        const fieldName = key.replace(/^customField_/, "");
        const value = req.query[key] as string;
        if (value && value.trim()) {
          query[`metadata.customFields.${fieldName}`] = new RegExp(
            value.trim(),
            "i",
          );
        }
      }
    });

    // Hierarchy level filters (hierarchyFilter_level2, hierarchyFilter_level3, hierarchyFilter_level4)
    for (const levelNum of [2, 3, 4]) {
      const paramKey = `hierarchyFilter_level${levelNum}`;
      const filterVal = req.query[paramKey] as string | undefined;
      if (filterVal && filterVal.trim()) {
        const matchingCategories = await Category.find({
          name: new RegExp(filterVal.trim(), "i"),
          level: levelNum,
        })
          .select("_id")
          .lean();
        if (matchingCategories.length > 0) {
          query[`categoryHierarchy.level${levelNum}`] = {
            $in: matchingCategories.map((c: any) => c._id),
          };
        } else {
          // No matching categories → force zero results for this filter
          query[`categoryHierarchy.level${levelNum}`] = null;
        }
      }
    }

    // Additional project filter from query params (for unified view multi-select)
    if (
      projectIdsFilter &&
      projectIdsFilter.length > 0 &&
      projectContext?.viewMode === "unified"
    ) {
      query["metadata.projectId"] = {
        $in: projectIdsFilter.map((id) => new mongoose.Types.ObjectId(id)),
      };
      console.log(
        `🔍 [VIEW_TICKETS] Filtering by specific projects: ${projectIdsFilter.length}`,
      );
    }

    // Single projectId filter from query params (for reports page)
    // IMPORTANT: Super admins should NOT be restricted by projectId unless explicitly provided
    // NOTE: Do NOT use !query['metadata.projectId'] here — after the center filter restructures
    // the query into { $and: [...] }, that check becomes true even when the filter was set.
    // Use the projectFilterApplied flag instead to avoid adding a conflicting top-level filter.
    if (req.query.projectId && !projectFilterApplied) {
      // For super admins, only apply project filter if they explicitly selected one
      // (empty projectId or "all" means show all projects)
      const projectIdStr = req.query.projectId as string;

      if (projectIdStr && projectIdStr !== "all" && projectIdStr !== "") {
        // Database stores metadata.projectId as both string and ObjectId, query for BOTH
        if (mongoose.Types.ObjectId.isValid(projectIdStr)) {
          query["metadata.projectId"] = {
            $in: [projectIdStr, new mongoose.Types.ObjectId(projectIdStr)],
          };
          console.log(
            `🔍 [VIEW_TICKETS] Filtering by single projectId (both string and ObjectId): ${projectIdStr}`,
          );
        } else {
          query["metadata.projectId"] = projectIdStr;
          console.log(
            `🔍 [VIEW_TICKETS] Filtering by single projectId (string): ${projectIdStr}`,
          );
        }
      } else if (isSuperAdmin) {
        console.log(
          `✅ [VIEW_TICKETS] Super Admin with no/empty projectId - showing ALL projects`,
        );
      }
    }

    // Exclude merged (secondary) tickets from listing unless caller explicitly opts in
    if (req.query.includeMerged !== "true") {
      if (query.$and) {
        query.$and.push({ isMerged: { $ne: true } });
      } else {
        query.isMerged = { $ne: true };
      }
    }

    // ============================================
    // RBAC: TICKET_VIEW_OWN vs TICKET_VIEW_ALL
    // ============================================
    // If user has ONLY TICKET_VIEW_OWN (not TICKET_VIEW_ALL), filter by assignedTo
    if (hasViewOwn && !hasViewAll && !isSuperAdmin) {
      if (isAgent) {
        // Agents with VIEW_OWN see only tickets assigned to them
        query.assignedTo = new mongoose.Types.ObjectId(userId);
        console.log(
          `🔒 [RBAC] TICKET_VIEW_OWN applied - filtering by assignedTo: ${userId}`,
        );
      } else {
        // Students with VIEW_OWN see only tickets created by them
        query["metadata.studentEmail"] = user.email;
        console.log(
          `🔒 [RBAC] TICKET_VIEW_OWN applied - filtering by studentEmail: ${user.email}`,
        );
      }
    } else if (!hasViewOwn && !hasViewAll && !isSuperAdmin) {
      // User has no viewing permissions - return empty
      console.log(
        `❌ [RBAC] User has no TICKET_VIEW_OWN or TICKET_VIEW_ALL permission`,
      );
      return res.status(200).json({
        success: true,
        data: { tickets: [], pagination: { total: 0, page, limit, pages: 0 } },
      });
    }

    // Exclude merged (secondary) tickets from getAllTickets listing unless caller explicitly opts in
    if (req.query.includeMerged !== "true") {
      if (query.$and) {
        query.$and.push({ isMerged: { $ne: true } });
      } else {
        query.isMerged = { $ne: true };
      }
    }

    console.log(
      `🔍 [FINAL QUERY] Query object:`,
      JSON.stringify(query, null, 2),
    );
    console.log(`🔍 [FINAL QUERY] Query keys:`, Object.keys(query));

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "priority",
      "status",
      "ticketNumber",
      "slaDeadline",
    ];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Count total tickets
    const totalTickets = await Ticket.countDocuments(query);
    console.log(`📊 [DB RESULT] Total tickets matching query: ${totalTickets}`);

    // Find tickets based on query with pagination
    // OPTIMIZED: Exclude heavy fields (threads, comments, history) from list view
    const tickets = await Ticket.find(query)
      .select(
        "-threads -comments -internalNotes -changeHistory -escalationHistory -description",
      )
      .populate("assignedTo", "firstName lastName email")
      .populate("category", "name")
      .populate("metadata.projectId", "name code")
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(
      `📊 [DB RESULT] Tickets returned (paginated): ${tickets.length}`,
    );

    // Get priorities for SLA calculation
    const Priority = require("../models/master-data/Priority").Priority;
    const priorities = await Priority.find({});
    console.log(`📊 [SLA] Found ${priorities.length} priorities in database`);
    const priorityMap = new Map();
    priorities.forEach((p: any) => {
      priorityMap.set(p.code.toUpperCase(), p);
      console.log(
        `📊 [SLA] Loaded priority: ${p.code} (${p.name}) - ResolutionTime: ${p.resolutionTime?.value} ${p.resolutionTime?.unit}`,
      );
    });

    // OPTIMIZED: Batch fetch all projects and centers instead of N+1 queries
    const projectIds = [
      ...new Set(
        tickets
          .map((t) => (t as any).metadata?.projectId?.toString())
          .filter(Boolean),
      ),
    ];
    const centerIds = [
      ...new Set(
        tickets
          .map((t) => {
            const centerId = (t as any).metadata?.centerId;
            return centerId && centerId !== "online"
              ? centerId.toString()
              : null;
          })
          .filter(Boolean),
      ),
    ];

    const [projects, centers, statusRecordsAll] = await Promise.all([
      projectIds.length > 0
        ? Project.find({ _id: { $in: projectIds } })
            .select("name code")
            .lean()
        : Promise.resolve([]),
      centerIds.length > 0
        ? Center.find({ _id: { $in: centerIds } })
            .select("centerName city state")
            .lean()
        : Promise.resolve([]),
      projectIds.length > 0
        ? Status.find({ projectId: { $in: projectIds }, isActive: true })
            .select("name code color projectId")
            .lean()
        : Promise.resolve([]),
    ]);

    // Batch-fetch category names for hierarchy levels 2-4 so they can be
    // displayed as individual columns without N+1 queries.
    const hierarchyCategoryIds = [
      ...new Set(
        tickets.flatMap((t: any) => {
          const h = t.categoryHierarchy;
          if (!h) return [];
          return [h.level1, h.level2, h.level3, h.level4, h.level5]
            .filter(Boolean)
            .map((id: any) => id.toString());
        }),
      ),
    ];
    const hierarchyCategoryDocs =
      hierarchyCategoryIds.length > 0
        ? await Category.find({ _id: { $in: hierarchyCategoryIds } })
            .select("name")
            .lean()
        : [];
    const hierarchyCategoryMap = new Map(
      hierarchyCategoryDocs.map((c: any) => [c._id.toString(), c.name]),
    );

    const projectMap = new Map(
      projects.map((p: any) => [
        p._id.toString(),
        { _id: p._id, name: p.name, code: p.code },
      ]),
    );
    const centerMap = new Map(
      centers.map((c: any) => [
        c._id.toString(),
        { _id: c._id, centerName: c.centerName, city: c.city, state: c.state },
      ]),
    );
    // statusLookupAll key: "<projectId>_<statusCode>"
    const statusLookupAll = new Map(
      (statusRecordsAll as any[]).map((s) => [
        `${s.projectId.toString()}_${s.code}`,
        { name: s.name, color: s.color },
      ]),
    );

    // Map tickets with populated data and SLA calculation (no additional queries)
    // Note: Using lean() so tickets are already plain objects
    const ticketsWithProject = tickets.map((ticket: any) => {
      const ticketObj = { ...ticket };

      // Populate project data from batch query
      if (ticketObj.metadata?.projectId) {
        const project = projectMap.get(ticketObj.metadata.projectId.toString());
        if (project) {
          ticketObj.metadata.projectId = project;
        }
      }

      // Populate center data from batch query
      if (
        ticketObj.metadata?.centerId &&
        ticketObj.metadata.centerId !== "online"
      ) {
        const center = centerMap.get(ticketObj.metadata.centerId.toString());
        if (center) {
          ticketObj.metadata.centerId = center;
        } else {
          // Convert to string so frontend receives a string, not a raw BSON ObjectId object
          ticketObj.metadata.centerId = ticketObj.metadata.centerId.toString();
        }
      }

      // Enrich with project-specific status name and color
      const rawProjectIdAll =
        typeof ticketObj.metadata?.projectId === "object"
          ? ticketObj.metadata.projectId._id?.toString()
          : ticketObj.metadata?.projectId?.toString();
      if (rawProjectIdAll) {
        const statusEntry = statusLookupAll.get(
          `${rawProjectIdAll}_${ticketObj.status}`,
        );
        if (statusEntry) {
          ticketObj.statusName = statusEntry.name;
          ticketObj.statusColor = statusEntry.color;
        }
      }

      // Enrich categoryHierarchyNames so hierarchy_level_N columns can render names
      if (ticketObj.categoryHierarchy) {
        const h = ticketObj.categoryHierarchy;
        ticketObj.categoryHierarchyNames = {
          // level1 = the TRUE level-1 category (categoryHierarchy.level1); the
          // populated `category` field holds the DEEPEST level for offline tickets.
          level1: h.level1
            ? hierarchyCategoryMap.get(h.level1.toString())
            : ticketObj.category?.name || undefined,
          level2: h.level2
            ? hierarchyCategoryMap.get(h.level2.toString())
            : undefined,
          level3: h.level3
            ? hierarchyCategoryMap.get(h.level3.toString())
            : undefined,
          level4: h.level4
            ? hierarchyCategoryMap.get(h.level4.toString())
            : undefined,
          level5: h.level5
            ? hierarchyCategoryMap.get(h.level5.toString())
            : undefined,
        };
      }

      // Calculate resolution time and SLA status for resolved/closed tickets
      if (
        (ticketObj.status === 4 || ticketObj.status === 5) &&
        ticketObj.resolvedAt
      ) {
        const createdDate = new Date(ticketObj.createdAt);
        const resolvedDate = new Date(ticketObj.resolvedAt);
        const timeDiffMs = resolvedDate.getTime() - createdDate.getTime();
        const hours = Math.floor(timeDiffMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        if (days > 0) {
          ticketObj.resolutionTime = `${days}d ${remainingHours}h`;
        } else {
          ticketObj.resolutionTime = `${hours}h`;
        }

        // Calculate SLA status
        let prioritySettings = null;
        if (typeof ticketObj.priority === "string") {
          const priorityCode = ticketObj.priority.toUpperCase();
          prioritySettings = priorityMap.get(priorityCode);
        }

        if (prioritySettings && prioritySettings.resolutionTime) {
          const resTime = prioritySettings.resolutionTime;
          let resolutionTimeMs = 0;

          if (resTime.unit === "minutes") {
            resolutionTimeMs = resTime.value * 60 * 1000;
          } else if (resTime.unit === "hours") {
            resolutionTimeMs = resTime.value * 60 * 60 * 1000;
          } else if (resTime.unit === "days") {
            resolutionTimeMs = resTime.value * 24 * 60 * 60 * 1000;
          }

          const slaDeadline = new Date(
            createdDate.getTime() + resolutionTimeMs,
          );
          const withinSLA = resolvedDate <= slaDeadline;
          ticketObj.slaStatus = withinSLA ? "Within SLA" : "Outside SLA";
        } else {
          ticketObj.slaStatus = "N/A";
        }
      } else {
        ticketObj.slaStatus = "Pending";
      }

      return ticketObj;
    });

    console.log(
      `📋 Retrieved ${ticketsWithProject.length} tickets for View Tickets (Total: ${totalTickets})`,
    );

    return res.status(200).json({
      success: true,
      data: {
        tickets: ticketsWithProject,
        pagination: {
          total: totalTickets,
          page,
          limit,
          totalPages: Math.ceil(totalTickets / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all tickets error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get tickets assigned to the current agent
 */
export const getAgentAssignedTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Pagination parameters with max limit enforcement
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
    const skip = (page - 1) * limit;

    // Build query to find tickets assigned to this agent
    const query: any = {
      assignedTo: userId,
    };

    // Filter by project if projectId is provided (convert to ObjectId)
    if (req.query.projectId) {
      const projectIdStr = req.query.projectId as string;
      if (mongoose.Types.ObjectId.isValid(projectIdStr)) {
        query["metadata.projectId"] = new mongoose.Types.ObjectId(projectIdStr);
      } else {
        query["metadata.projectId"] = projectIdStr;
      }
    }

    // ============================================
    // ADDITIONAL FILTERS (status, priority, search, dates, category)
    // ============================================

    // Status filter (1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed)
    if (req.query.status) {
      const statusValues = String(req.query.status)
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((s) => [1, 2, 3, 4, 5].includes(s));
      if (statusValues.length > 0) {
        query.status = { $in: statusValues };
      }
    }

    // Priority filter (dynamic - accepts any configured project priority code)
    if (req.query.priority) {
      const priorityValues = String(req.query.priority)
        .split(",")
        .map((p) => p.trim().toUpperCase())
        .filter((p) => p.length > 0);
      if (priorityValues.length > 0) {
        query.priority = { $in: [...new Set(priorityValues)] };
      }
    }

    // Search filter (searches ticketNumber, subject)
    if (req.query.search) {
      const searchTerm = String(req.query.search)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .trim();
      if (searchTerm) {
        query.$or = [
          { ticketNumber: { $regex: searchTerm, $options: "i" } },
          { subject: { $regex: searchTerm, $options: "i" } },
        ];
      }
    }

    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) query.createdAt.$gte = afterDate;
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // Category filter
    if (req.query.categoryId) {
      query.category = req.query.categoryId;
    }

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "priority",
      "status",
      "ticketNumber",
    ];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Get total count for pagination
    const totalTickets = await Ticket.countDocuments(query);

    // Find tickets with pagination - using lean() for read-only access
    // OPTIMIZED: Exclude heavy fields (threads, comments, history) from list view
    const tickets = await Ticket.find(query)
      .select(
        "-threads -comments -internalNotes -changeHistory -escalationHistory -description +submissionSource",
      )
      .populate("assignedTo", "firstName lastName email")
      .populate("createdBy", "firstName lastName email")
      .populate("category", "name")
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // OPTIMIZED: Batch fetch all projects and centers instead of N+1 queries
    const projectIds = [
      ...new Set(
        tickets
          .map((t) => (t as any).metadata?.projectId?.toString())
          .filter(Boolean),
      ),
    ];
    const centerIds = [
      ...new Set(
        tickets
          .map((t) => {
            const centerId = (t as any).metadata?.centerId;
            return centerId && centerId !== "online"
              ? centerId.toString()
              : null;
          })
          .filter(Boolean),
      ),
    ];

    const [projects, centers] = await Promise.all([
      projectIds.length > 0
        ? Project.find({ _id: { $in: projectIds } })
            .select("name code")
            .lean()
        : Promise.resolve([]),
      centerIds.length > 0
        ? Center.find({ _id: { $in: centerIds } })
            .select("centerName city state")
            .lean()
        : Promise.resolve([]),
    ]);

    const projectMap = new Map(
      projects.map((p: any) => [
        p._id.toString(),
        { _id: p._id, name: p.name, code: p.code },
      ]),
    );
    const centerMap = new Map(
      centers.map((c: any) => [
        c._id.toString(),
        { _id: c._id, centerName: c.centerName, city: c.city, state: c.state },
      ]),
    );

    // Map tickets with populated data (no additional queries)
    const ticketsWithDetails = tickets.map((ticket) => {
      const ticketObj = { ...ticket };

      // Populate project data from batch query
      if (ticketObj.metadata?.projectId) {
        const project = projectMap.get(ticketObj.metadata.projectId.toString());
        if (project) {
          ticketObj.metadata.projectId = project as any;
        }
      }

      // Populate center data from batch query
      if (
        ticketObj.metadata?.centerId &&
        ticketObj.metadata.centerId !== "online"
      ) {
        const center = centerMap.get(ticketObj.metadata.centerId.toString());
        if (center) {
          ticketObj.metadata.centerId = center as any;
        }
      }

      return ticketObj;
    });

    return res.status(200).json({
      success: true,
      data: ticketsWithDetails,
      pagination: {
        total: totalTickets,
        page,
        limit,
        totalPages: Math.ceil(totalTickets / limit),
      },
    });
  } catch (error) {
    console.error("Get agent assigned tickets error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assigned tickets",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Multer configuration for file uploads
 * Uses memory storage so files can be piped directly to GCS (or written to disk as fallback).
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".txt",
      ".csv",
      ".zip",
      ".rar",
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".webm",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  },
});

/**
 * Get single ticket by ID
 */
export const getTicketById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get user to verify permissions
    const user = await User.findById(userId).populate("role", "code isAgent");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id)
      .populate("category", "name")
      .populate("assignedTo", "firstName lastName email")
      .populate("escalationMatrixId", "name") // Populate escalation matrix name
      .populate({
        path: "threads.createdBy",
        select: "firstName lastName email role",
        populate: {
          path: "role",
          select: "name code",
        },
      })
      .populate({
        path: "comments.createdBy",
        select: "firstName lastName email",
      })
      .populate({
        path: "internalNotes.createdBy",
        select: "firstName lastName email",
      })
      .populate("escalationHistory.escalatedTo", "firstName lastName email")
      .populate("escalationHistory.escalatedBy", "firstName lastName email")
      .populate("changeHistory.changedBy", "firstName lastName email")
      .populate({
        path: "mergedTickets",
        select:
          "ticketNumber subject title status priority category assignedTo createdAt mergedAt metadata threads",
        populate: { path: "category", select: "name" },
      })
      .populate("mergedInto", "ticketNumber subject title status");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check permissions:
    // 1. Student can view their own ticket (email matches)
    // 2. Agent/DNO with TICKET_VIEW_ALL can view any ticket
    // 3. Agent/DNO with only TICKET_VIEW_OWN can view only their assigned tickets
    // 4. Admin/Super Admin can view any ticket
    const roleObj = user.role as any;
    const isStudent = roleObj?.code === "STUDENT";
    const isAgent =
      ["AGENT", "ADMIN", "SUPERADMIN"].includes(roleObj?.code) ||
      roleObj?.isAgent === true;
    const isAssignedAgent =
      ticket.assignedTo && ticket.assignedTo._id.toString() === userId;
    const ownsTicket = ticket.metadata?.studentEmail === user.email;
    // Permission codes are attached by authMiddleware as req.user.role.permissions
    const userPermissions: string[] =
      (req as any).user?.role?.permissions || [];
    const hasViewAll = userPermissions.includes("TICKET_VIEW_ALL");

    if (isStudent && !ownsTicket) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this ticket",
      });
    }

    // Agents with TICKET_VIEW_ALL can see any ticket; ADMIN/SUPERADMIN always bypass.
    // Agents with only TICKET_VIEW_OWN are limited to their assigned tickets.
    if (
      isAgent &&
      !isAssignedAgent &&
      !hasViewAll &&
      !["ADMIN", "SUPERADMIN"].includes(roleObj?.code)
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this ticket",
      });
    }

    // Remove internal notes if user is a student (not staff)
    const ticketData = ticket.toObject();
    if (isStudent) {
      ticketData.internalNotes = []; // Hide internal notes from students
    }

    // Clear the "new / unread" flag when an agent or admin opens the ticket
    if (isAgent && ticket.hasNewReply) {
      await Ticket.findByIdAndUpdate(id, { hasNewReply: false });
      ticketData.hasNewReply = false;
    }

    // Clear the student-unread flag when the student (ticket creator) opens the ticket
    if (isStudent && ticket.hasAgentReply) {
      await Ticket.findByIdAndUpdate(id, { hasAgentReply: false });
      ticketData.hasAgentReply = false;
    }

    // Enrich with project-specific status metadata so detail view matches list view labels/colors.
    try {
      const rawProjectId =
        (ticketData as any).metadata?.projectId?._id?.toString?.() ||
        (ticketData as any).metadata?.projectId?.toString?.();
      const statusNum = Number((ticketData as any).status);

      if (
        rawProjectId &&
        mongoose.Types.ObjectId.isValid(rawProjectId) &&
        !Number.isNaN(statusNum)
      ) {
        const statusDoc = await Status.findOne({
          projectId: new mongoose.Types.ObjectId(rawProjectId),
          code: statusNum,
          isActive: true,
        })
          .select("name color isClosed")
          .lean();

        if (statusDoc) {
          (ticketData as any).statusName = (statusDoc as any).name;
          (ticketData as any).statusColor = (statusDoc as any).color;
          (ticketData as any).isClosedStatus = !!(statusDoc as any).isClosed;
        }
      }
    } catch (statusErr) {
      console.error("Failed to enrich ticket status metadata:", statusErr);
    }

    // Add escalation matrix name if available
    if (
      ticketData.escalationMatrixId &&
      typeof ticketData.escalationMatrixId === "object"
    ) {
      (ticketData as any).escalationMatrixName = (
        ticketData.escalationMatrixId as any
      ).name;
    }

    console.log(
      "🔍 [getTicketById] Fetching SLA tracking for ticket:",
      ticket._id,
    );

    // Fetch SLA tracking data for this ticket
    const slaTracking = await SLATracking.findOne({ ticketId: ticket._id })
      .populate("escalationPolicyId")
      .lean();

    console.log("🔍 [getTicketById] SLA tracking found:", !!slaTracking);
    if (slaTracking) {
      console.log("🔍 [getTicketById] SLA tracking details:", {
        currentLevel: slaTracking.currentEscalationLevel,
        resolutionDeadline: slaTracking.resolutionDeadline,
        resolutionStatus: slaTracking.resolutionStatus,
      });
    }

    // Add SLA tracking info to response
    if (slaTracking) {
      (ticketData as any).slaTracking = {
        currentEscalationLevel: slaTracking.currentEscalationLevel || 0,
        resolutionDeadline: slaTracking.resolutionDeadline,
        nextEscalationDue: slaTracking.nextEscalationDue,
        resolutionStatus: slaTracking.resolutionStatus,
        isPaused: slaTracking.isPaused,
        pausedDuration: slaTracking.pausedDuration || 0,
        lastEscalationAt: slaTracking.lastEscalationAt,
        escalationHistory: slaTracking.escalationHistory || [],
        escalationPolicy: slaTracking.escalationPolicyId || null,
        slaSource: (slaTracking as any).slaSource || "priority",
      };
      console.log("✅ [getTicketById] Added slaTracking to response");
    } else {
      console.log("⚠️ [getTicketById] No SLA tracking found for ticket");
    }

    return res.status(200).json({
      success: true,
      data: ticketData,
    });
  } catch (error) {
    console.error("Get ticket by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ticket",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Add reply to ticket
 */
export const replyToTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get user to verify ownership
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id).populate(
      "assignedTo",
      "_id email",
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Authorization to reply:
    //  - The student who owns the query may always reply to their own ticket.
    //  - An agent may reply only when the ticket is ASSIGNED TO THEM, or when
    //    they hold TICKET_MODIFY_ANY (supervisor capability). Merely having
    //    "View Queries" (TICKET_VIEW_ALL) does NOT allow replying to others'
    //    tickets — those are read-only.
    const isTicketCreator = ticket.metadata?.studentEmail === user.email;

    // Role + permissions for the ownership check
    const populatedUser = await User.findById(userId).populate({
      path: "role",
      select: "code permissions",
      populate: { path: "permissions", select: "code name" },
    });

    const canModify = await canModifyTicket(userId, ticket, populatedUser);

    if (!isTicketCreator && !canModify) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to reply to this ticket",
      });
    }

    // Check if ticket is closed (status 5 = closed)
    if (ticket.status === 5) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot reply to a closed ticket. Please reopen the ticket first.",
      });
    }

    // Handle file attachments — upload to GCS (or local fallback)
    const attachments: any[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        const uploaded = await GCSService.uploadTicketFile(
          file,
          "ticket-attachments",
        );
        attachments.push({
          filename: uploaded.filename,
          originalName: file.originalname,
          path: uploaded.path,
          mimetype: file.mimetype,
          size: file.size,
        });
      }
    }

    // Add thread to ticket using atomic update to avoid full document validation
    const newThread = {
      message,
      createdBy: new mongoose.Types.ObjectId(userId),
      attachments,
      createdAt: new Date(),
    };

    // If the replier is the ticket creator (student), flag unread for agents
    const isStudentReply = isTicketCreator;

    const updatedTicket = await Ticket.findByIdAndUpdate(
      id,
      {
        $push: { threads: newThread },
        $set: {
          updatedAt: new Date(),
          ...(isStudentReply ? { hasNewReply: true } : { hasAgentReply: true }),
        },
      },
      {
        new: true,
        runValidators: false, // Skip validation to avoid issues with missing subject field
      },
    ).populate({
      path: "threads.createdBy",
      select: "firstName lastName email role",
      populate: {
        path: "role",
        select: "name code",
      },
    });

    if (!updatedTicket) {
      return res.status(404).json({
        success: false,
        message: "Failed to update ticket",
      });
    }

    console.log(
      `✅ Reply added to ticket: ${updatedTicket._id} by user: ${user.email}`,
    );

    // Emit real-time event for ticket detail page listeners
    (() => {
      try {
        const { getIo } = require("../socket/ioInstance");
        const {
          emitTicketUpdate,
          emitTicketListUpdate,
        } = require("../socket/socketHandlers");
        const io = getIo();
        if (io) {
          // Notify anyone viewing the specific ticket detail
          emitTicketUpdate(io, id, { type: "new-reply", thread: newThread });
          // Notify ticket list watchers (for hasNewReply badge)
          const projectId =
            updatedTicket.project?.toString() ||
            (updatedTicket as any).metadata?.projectId?.toString();
          if (projectId) {
            emitTicketListUpdate(io, projectId, {
              type: "new-reply",
              ticket: {
                _id: updatedTicket._id,
                ticketNumber: updatedTicket.ticketNumber,
                hasNewReply: isStudentReply,
                hasAgentReply: !isStudentReply,
              },
            });
          }
        }
      } catch (socketErr) {
        console.error("⚠️ Failed to emit reply socket event:", socketErr);
      }
    })();

    // Send in-app + push notification to the reply recipient (non-blocking)
    // Notification engine: ticket_reply_added (direct to assignee + creator)
    (() => {
      const projectId =
        (updatedTicket as any).project?.toString() ||
        (updatedTicket as any).metadata?.projectId?.toString();
      const lastThread = updatedTicket.threads?.[
        updatedTicket.threads.length - 1
      ] as any;
      const replyAnchor = lastThread?._id ? `#reply-${lastThread._id}` : "";
      const deepLink = `/projects/${projectId}/tickets/${(updatedTicket._id as any).toString()}${replyAnchor}`;
      const replierName =
        `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() ||
        user.email;
      const recipients: mongoose.Types.ObjectId[] = [];
      if (isStudentReply) {
        // Student replied → notify assigned agent
        const agentRaw = ticket.assignedTo as any;
        const agentId = agentRaw?._id ?? agentRaw;
        if (agentId)
          recipients.push(new mongoose.Types.ObjectId(agentId.toString()));
      } else {
        // Agent replied → notify ticket creator
        const creatorId =
          (ticket as any).metadata?.studentUserId ||
          (ticket as any).submittedBy ||
          (ticket as any).createdBy;
        if (creatorId)
          recipients.push(new mongoose.Types.ObjectId(creatorId.toString()));
      }
      if (recipients.length > 0 && projectId) {
        fireNotification({
          triggerType: TRIGGER_TYPES.TICKET_REPLY_ADDED,
          triggeredByUserId: userId,
          projectId,
          entityType: "ticket",
          entityId: ticket._id as mongoose.Types.ObjectId,
          deepLinkUrl: deepLink,
          templateVars: {
            agentName: replierName,
            ticketNumber: ticket.ticketNumber,
          },
          recipientOverride: recipients,
        }).catch(console.error);
      }
    })();

    (async () => {
      try {
        const {
          createNotification,
        } = require("../controllers/notificationController");
        const isProduction = process.env.NODE_ENV === "production";
        const frontendUrl = isProduction
          ? process.env.PRODUCTION_FRONTEND_URL ||
            "https://helpdesk.hubblehox.ai"
          : process.env.FRONTEND_URL || "http://localhost:3001";
        const ticketLink = `${frontendUrl}/tickets/${(updatedTicket._id as any).toString()}`;
        const projectId =
          updatedTicket.project?.toString() ||
          (updatedTicket as any).metadata?.projectId?.toString();

        if (isStudentReply) {
          // Student replied → notify assigned agent
          const agentRaw = (ticket as any).assignedTo;
          const assignedAgentId = agentRaw?._id ?? agentRaw;
          if (assignedAgentId && projectId) {
            await createNotification({
              userId: new mongoose.Types.ObjectId(assignedAgentId.toString()),
              projectId: new mongoose.Types.ObjectId(projectId),
              type: "info" as const,
              title: `New Reply on ${ticket.ticketNumber}`,
              message: `${(user as any).firstName || user.email} replied on: ${ticket.subject}`,
              ticketId: ticket._id as mongoose.Types.ObjectId,
              link: ticketLink,
            });
          }
        } else {
          // Agent replied → notify the ticket creator (student) if they have userId
          const studentUserId =
            (ticket as any).metadata?.studentUserId ||
            (ticket as any).submittedBy ||
            (ticket as any).createdBy; // fallback for tickets created before studentUserId was stored in metadata
          if (studentUserId && projectId) {
            await createNotification({
              userId: new mongoose.Types.ObjectId(studentUserId.toString()),
              projectId: new mongoose.Types.ObjectId(projectId),
              type: "info" as const,
              title: `Reply on your ticket ${ticket.ticketNumber}`,
              message: `${(user as any).firstName || user.email} replied: ${ticket.subject}`,
              ticketId: ticket._id as mongoose.Types.ObjectId,
              link: ticketLink,
            });
          }
        }
      } catch (notifErr) {
        console.error("⚠️ Failed to send reply notification:", notifErr);
      }
    })();

    // Send "Comment Added" trigger email (non-blocking)
    (async () => {
      try {
        const projectId = ticket.project
          ? ticket.project.toString()
          : undefined;
        const replyerName =
          `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;

        if (!isStudentReply) {
          // Agent replied → notify the student
          const studentEmail = (ticket as any).metadata?.studentEmail;
          if (studentEmail) {
            await sendTicketCommentAddedEmail(
              studentEmail,
              ticket.ticketNumber,
              ticket.subject,
              message,
              projectId,
              {
                studentName: (ticket as any).metadata?.studentName || "Student",
                recipientName:
                  (ticket as any).metadata?.studentName || "Student",
                commentBy: replyerName,
              },
            );
          }
        } else {
          // Student replied → notify the assigned agent
          const assignedAgent = (ticket as any).assignedTo;
          if (assignedAgent?.email) {
            const agentName =
              `${assignedAgent.firstName || ""} ${assignedAgent.lastName || ""}`.trim() ||
              assignedAgent.email;
            await sendTicketCommentAddedEmail(
              assignedAgent.email,
              ticket.ticketNumber,
              ticket.subject,
              message,
              projectId,
              {
                recipientName: agentName,
                studentName: agentName,
                commentBy:
                  `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
                  user.email,
              },
            );
          }
        }
      } catch (emailErr) {
        console.error("Failed to send comment added email:", emailErr);
      }
    })();

    // Invalidate footfall cache — comment count changed
    (() => {
      try {
        const tenantId =
          (updatedTicket as any).project?.toString() ||
          (updatedTicket as any).metadata?.projectId?.toString();
        if (tenantId) {
          dashboardEvents.emit("ticket.commented", { tenantId });
        }
      } catch (_) {
        // non-critical
      }
    })();

    return res.status(200).json({
      success: true,
      message: "Reply added successfully",
      data: updatedTicket.threads,
    });
  } catch (error) {
    console.error("Reply to ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Close ticket by student
 */
export const closeTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get user to verify ownership
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Verify student owns this ticket
    if (ticket.metadata?.studentEmail !== user.email) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to close this ticket",
      });
    }

    // Check if ticket is already closed (status 5 = closed)
    if (ticket.status === 5) {
      return res.status(400).json({
        success: false,
        message: "Ticket is already closed",
      });
    }

    // Get project to check if student can close tickets
    const project = await Project.findById(ticket.metadata?.projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if student is allowed to close tickets
    if (
      !project.configuration?.ticketSubmissionSettings
        ?.allowStudentToCloseTicket
    ) {
      return res.status(403).json({
        success: false,
        message: "Students are not allowed to close tickets for this project",
      });
    }

    // Close the ticket (5 = closed)
    ticket.status = 5;
    ticket.closedAt = new Date();
    // If closed without being resolved, also set resolvedAt
    if (!ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
    }
    ticket.updatedAt = new Date();

    // Add system thread
    if (!ticket.threads) {
      ticket.threads = [];
    }

    ticket.threads.push({
      message: "Ticket closed by student",
      createdBy: userId,
      isSystemMessage: true,
      createdAt: new Date(),
    } as any);

    await ticket.save();

    // Stop SLA escalation tracking so the cron cannot escalate after student close
    (async () => {
      try {
        const SLATracking = require("../models/sla-module/SLATracking").default;
        await SLATracking.updateOne(
          { ticketId: ticket._id },
          {
            $unset: { nextEscalationDue: 1 },
            $set: { resolutionStatus: "met" },
          },
        );
      } catch (slaErr) {
        console.error("Failed to clear SLA tracking on student close:", slaErr);
      }
    })();

    // Notification engine: ticket_closed (notify assignee)
    (() => {
      const projectId =
        (ticket as any).metadata?.projectId?.toString() ||
        (ticket as any).project?.toString();
      const agentId = ticket.assignedTo;
      if (agentId && projectId) {
        fireNotification({
          triggerType: TRIGGER_TYPES.TICKET_CLOSED,
          triggeredByUserId: userId,
          projectId,
          entityType: "ticket",
          entityId: ticket._id as mongoose.Types.ObjectId,
          deepLinkUrl: `/projects/${projectId}/tickets/${(ticket._id as any).toString()}`,
          templateVars: { ticketNumber: ticket.ticketNumber },
          recipientOverride: [new mongoose.Types.ObjectId(agentId.toString())],
        }).catch(console.error);
      }
    })();

    console.log(`✅ Ticket closed by student: ${ticket._id} by ${user.email}`);

    // Dashboard cache invalidation (fire-and-forget)
    dashboardEvents.emit("ticket.closed", {
      tenantId: ticket.metadata?.projectId?.toString() ?? "",
    });

    await emitTicketRealtimeUpdate(ticket, "status-changed");

    return res.status(200).json({
      success: true,
      message: "Ticket closed successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("Close ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close ticket",
    });
  }
};

// Reopen a closed ticket (students only)
export const reopenTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get user to verify ownership
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Verify student owns this ticket
    if (ticket.metadata?.studentEmail !== user.email) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to reopen this ticket",
      });
    }

    // Check if ticket is actually closed — handles both hardcoded (5) and
    // project-specific custom status codes that have isClosed = true
    const StatusModel = require("../models/Status").Status;
    const projectStatuses: any[] = await StatusModel.find({
      projectId: ticket.metadata?.projectId,
    }).select("code isClosed name");

    const currentStatusDoc = projectStatuses.find(
      (s: any) => s.code === ticket.status,
    );
    const isClosedStatus =
      ticket.status === 5 || currentStatusDoc?.isClosed === true;

    if (!isClosedStatus) {
      return res.status(400).json({
        success: false,
        message: "Ticket is not closed",
      });
    }

    // Reopen to the project's first non-closed status (code 1 if no custom statuses)
    const openStatus =
      projectStatuses.find((s: any) => !s.isClosed && s.code !== 4) ??
      projectStatuses.find((s: any) => !s.isClosed);
    const reopenCode = openStatus ? openStatus.code : 1;
    ticket.status = reopenCode;
    ticket.closedAt = undefined; // Clear closedAt so frontend isTicketClosed check becomes false
    ticket.updatedAt = new Date();

    // Add system thread
    if (!ticket.threads) {
      ticket.threads = [];
    }

    ticket.threads.push({
      message: `Ticket reopened by ${user.firstName} ${user.lastName} (Student)`,
      createdBy: userId,
      isSystemMessage: true,
      createdAt: new Date(),
    } as any);

    await ticket.save();

    console.log(
      `✅ Ticket reopened by student: ${ticket._id} by ${user.email}`,
    );

    await emitTicketRealtimeUpdate(ticket, "status-changed", {
      hasNewReply: ticket.hasNewReply,
    });

    return res.status(200).json({
      success: true,
      message: "Ticket reopened successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("Reopen ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reopen ticket",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, closingRemark } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Authorization check
    if (!(await canModifyTicket(userId, ticket, user))) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this ticket",
      });
    }

    // Validate status is a valid number
    const statusNum = Number(status);
    console.log(
      `🔍 Attempting to change status to: ${statusNum} (type: ${typeof statusNum})`,
    );

    if (isNaN(statusNum) || statusNum < 1) {
      console.log(`❌ Invalid status: "${status}".`);
      return res.status(400).json({
        success: false,
        message: `Invalid status code "${status}".`,
      });
    }

    // Validate against the project's actual configured status codes
    const StatusModel = require("../models/Status").Status;
    const projectStatuses: any[] = await StatusModel.find({
      projectId: ticket.metadata?.projectId,
    }).select("code isClosed name");
    const validStatusCodes =
      projectStatuses.length > 0
        ? projectStatuses.map((s: any) => s.code)
        : [1, 2, 3, 4, 5]; // fallback for projects without custom statuses

    if (!validStatusCodes.includes(statusNum)) {
      console.log(
        `❌ Invalid status: "${status}". Valid codes for this project: ${validStatusCodes.join(", ")}`,
      );
      return res.status(400).json({
        success: false,
        message: `Invalid status code "${status}". Valid codes for this project: ${validStatusCodes.join(", ")}`,
      });
    }

    // Find the status document for the new status (used for timestamp logic and feedback)
    const statusDoc =
      projectStatuses.find((s: any) => s.code === statusNum) ?? null;

    // Enforce closing remark requirement
    if (statusDoc?.requireClosingRemark && !closingRemark?.trim()) {
      return res.status(400).json({
        success: false,
        message: "A closing remark is required before applying this status.",
      });
    }

    const oldStatus = ticket.status;
    const now = new Date();

    // Build update object for atomic update
    const updateFields: any = {
      status: statusNum,
      updatedAt: now,
    };

    const isClosingStatus = statusDoc?.isClosed === true;

    // Set resolvedAt when transitioning to Resolved (code 4) or any isClosed-flagged status
    if (
      (statusNum === 4 && oldStatus !== 4) ||
      (isClosingStatus && statusNum !== 4 && oldStatus !== statusNum)
    ) {
      updateFields.resolvedAt = now;
    }

    // Set closedAt when transitioning to Closed (code 5) or any isClosed-flagged status
    if (
      (statusNum === 5 && oldStatus !== 5) ||
      (isClosingStatus && statusNum !== 5 && oldStatus !== statusNum)
    ) {
      updateFields.closedAt = now;
      // If closed without previously being resolved, stamp resolvedAt too
      if (!ticket.resolvedAt && !updateFields.resolvedAt) {
        updateFields.resolvedAt = now;
      }
    }

    // Build change history entry
    const changeHistoryEntry = {
      _id: new mongoose.Types.ObjectId(),
      field: "status",
      oldValue: String(oldStatus) || "None",
      newValue: String(statusNum) || "None",
      changedBy: userId,
      changedAt: now,
      changeType: "update",
    };

    // If a closing remark was provided, build a separate history entry for it
    const remarkHistoryEntry = closingRemark?.trim()
      ? {
          _id: new mongoose.Types.ObjectId(),
          field: "closingRemark",
          oldValue: "",
          newValue: closingRemark.trim(),
          changedBy: userId,
          changedAt: now,
          changeType: "remark",
        }
      : null;

    // Use findByIdAndUpdate to avoid full document validation (bypasses subdocument validation issues)
    const pushPayload: any = {
      changeHistory: changeHistoryEntry,
    };
    if (remarkHistoryEntry) {
      // Push remark as a separate changeHistory entry AND as an internal note
      pushPayload.changeHistory = [
        changeHistoryEntry,
        remarkHistoryEntry,
      ] as any;
      pushPayload.internalNotes = {
        _id: new mongoose.Types.ObjectId(),
        content: `[Closing Remark] ${closingRemark.trim()}`,
        createdBy: userId,
        createdAt: now,
        isInternal: true,
      };
    }
    const updatedTicket = await Ticket.findByIdAndUpdate(
      id,
      {
        $set: updateFields,
        $push: pushPayload,
      },
      { new: true, runValidators: false }, // runValidators: false to skip validation on existing subdocuments
    );

    if (!updatedTicket) {
      return res.status(500).json({
        success: false,
        message: "Failed to update ticket",
      });
    }

    // If the new status closes the ticket, stop SLA escalation tracking immediately.
    // This prevents the 5-min cron from escalating an already-closed ticket.
    if (isClosingStatus || statusNum === 4 || statusNum === 5) {
      (async () => {
        try {
          const SLATracking =
            require("../models/sla-module/SLATracking").default;
          await SLATracking.updateOne(
            { ticketId: id },
            {
              $unset: { nextEscalationDue: 1 },
              $set: { resolutionStatus: "met" },
            },
          );
        } catch (slaErr) {
          console.error(
            "Failed to clear SLA tracking on ticket close:",
            slaErr,
          );
        }
      })();
    }

    // Check feedback triggers for status change
    try {
      // statusDoc was already fetched above during validation
      console.log(`📊 Status Doc found: ${statusDoc ? "YES" : "NO"}`);
      if (statusDoc) {
        console.log(
          `   Name: ${statusDoc.name}, Code: ${statusDoc.code}, isClosed: ${statusDoc.isClosed}`,
        );
      }

      const {
        checkAndTriggerFeedback,
      } = require("../services/feedbackTriggerService");

      // Trigger for status change
      await checkAndTriggerFeedback("ticket_status_changed", {
        projectId: ticket.metadata?.projectId,
        ticketId: ticket._id.toString(),
        statusId: statusDoc?._id.toString(),
      });

      // Also trigger for ticket closed if status is closed
      if (statusDoc && statusDoc.isClosed) {
        console.log(
          `🚪 Ticket is being closed - triggering ticket_closed feedback`,
        );
        await checkAndTriggerFeedback("ticket_closed", {
          projectId: ticket.metadata?.projectId,
          ticketId: ticket._id.toString(),
        });
      } else {
        console.log(
          `ℹ️  Status is not marked as closed (isClosed: ${statusDoc?.isClosed})`,
        );
      }
    } catch (feedbackError) {
      console.error("Error checking feedback triggers:", feedbackError);
      // Don't fail the status update if feedback fails
    }

    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName:
            user.name ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          userEmail: user.email,
          action: "update",
          entity: "ticket",
          entityId: ticket._id.toString(),
          entityName: ticket.subject,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [{ field: "status", oldValue: oldStatus, newValue: status }],
          description: `Ticket ${ticket.ticketNumber} status changed from ${oldStatus} to ${status}`,
          req,
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }
    }

    // Notification engine: ticket_status_changed → notify only the assignee and ticket creator
    (() => {
      const projectId =
        (ticket as any).metadata?.projectId?.toString() ||
        (ticket as any).project?.toString();
      if (projectId) {
        const statusLabel = statusDoc?.name || String(statusNum);
        const recipients: mongoose.Types.ObjectId[] = [];
        // Assigned agent
        const agentRaw = ticket.assignedTo as any;
        const agentId = agentRaw?._id ?? agentRaw;
        if (agentId)
          recipients.push(new mongoose.Types.ObjectId(agentId.toString()));
        // Ticket creator / student
        const creatorId =
          (ticket as any).metadata?.studentUserId ||
          (ticket as any).submittedBy ||
          (ticket as any).createdBy;
        if (creatorId)
          recipients.push(new mongoose.Types.ObjectId(creatorId.toString()));
        if (recipients.length > 0) {
          fireNotification({
            triggerType: TRIGGER_TYPES.TICKET_STATUS_CHANGED,
            triggeredByUserId: userId,
            projectId,
            entityType: "ticket",
            entityId: ticket._id as mongoose.Types.ObjectId,
            deepLinkUrl: `/projects/${projectId}/tickets/${(ticket._id as any).toString()}`,
            templateVars: {
              ticketNumber: ticket.ticketNumber,
              newStatus: statusLabel,
            },
            recipientOverride: recipients,
          }).catch(console.error);
        }
      }
    })();

    // Push notification to the assigned agent about status change (non-blocking)
    // Only notify if someone other than the assigned agent made the change
    (async () => {
      try {
        const assignedAgentId = ticket.assignedTo?.toString();
        const ticketProjectId = ticket.metadata?.projectId?.toString();
        if (
          assignedAgentId &&
          ticketProjectId &&
          mongoose.Types.ObjectId.isValid(assignedAgentId) &&
          assignedAgentId !== userId
        ) {
          const {
            createNotification,
          } = require("../controllers/notificationController");
          const statusLabel = statusDoc?.name || String(statusNum);
          const isProduction = process.env.NODE_ENV === "production";
          const frontendUrl = isProduction
            ? process.env.PRODUCTION_FRONTEND_URL ||
              "https://helpdesk.hubblehox.ai"
            : process.env.FRONTEND_URL || "http://localhost:3001";
          await createNotification({
            userId: new mongoose.Types.ObjectId(assignedAgentId),
            projectId: new mongoose.Types.ObjectId(ticketProjectId),
            type: "info" as const,
            title: `Status Updated: ${ticket.ticketNumber}`,
            message: `Status changed to "${statusLabel}" on: ${ticket.subject}`,
            ticketId: ticket._id as mongoose.Types.ObjectId,
            link: `${frontendUrl}/tickets/${ticket._id}`,
          });
        }
      } catch (notifErr) {
        console.error(
          "⚠️ Failed to send status change push notification:",
          notifErr,
        );
      }
    })();

    await emitTicketRealtimeUpdate(updatedTicket, "status-changed");

    // Dashboard cache invalidation (fire-and-forget)
    const statusChangeTenantId =
      (ticket as any).metadata?.projectId?.toString() ||
      (ticket as any).project?.toString();
    if (statusChangeTenantId) {
      dashboardEvents.emit("ticket.status_changed", {
        tenantId: statusChangeTenantId,
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedTicket,
    });
  } catch (error: any) {
    console.error("Update status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update status",
      error: error?.message || "Unknown error",
      stack: process.env.NODE_ENV !== "production" ? error?.stack : undefined,
    });
  }
};

/**
 * Update ticket category
 */
export const updateTicketCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Authorization check
    if (!(await canModifyTicket(userId, ticket, user))) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this ticket",
      });
    }

    const oldCategory = ticket.category;
    ticket.category = category;
    ticket.updatedAt = new Date();

    // Track change in history
    await trackChange(
      ticket,
      "category",
      String(oldCategory || "None"),
      String(category),
      userId,
    );

    await ticket.save();

    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName:
            user.name ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          userEmail: user.email,
          action: "update",
          entity: "ticket",
          entityId: ticket._id.toString(),
          entityName: ticket.subject,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [
            { field: "category", oldValue: oldCategory, newValue: category },
          ],
          description: `Ticket ${ticket.ticketNumber} category changed from ${oldCategory} to ${category}`,
          req,
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("Update category error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update category",
    });
  }
};

/**
 * Update ticket category hierarchy (for multi-level category systems)
 */
export const updateTicketCategoryHierarchy = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const { categoryHierarchy } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    if (!categoryHierarchy) {
      return res.status(400).json({
        success: false,
        message: "Category hierarchy is required",
      });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Authorization check
    if (!(await canModifyTicket(userId, ticket, user))) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this ticket",
      });
    }

    const oldHierarchy = ticket.categoryHierarchy?.displayPath || "None";

    // Update category hierarchy
    ticket.categoryHierarchy = {
      level1: categoryHierarchy.level1,
      level2: categoryHierarchy.level2,
      level3: categoryHierarchy.level3,
      level4: categoryHierarchy.level4,
      level5: categoryHierarchy.level5,
      displayPath: categoryHierarchy.displayPath,
    };

    // Also update the legacy category field with level1 for backward compatibility
    if (categoryHierarchy.level1) {
      ticket.category = categoryHierarchy.level1;
    }

    ticket.updatedAt = new Date();

    // Track change in history
    await trackChange(
      ticket,
      "categoryHierarchy",
      oldHierarchy,
      categoryHierarchy.displayPath || "Updated",
      userId,
    );

    await ticket.save();

    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName:
            user.name ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          userEmail: user.email,
          action: "update",
          entity: "ticket",
          entityId: ticket._id.toString(),
          entityName: ticket.subject,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [
            {
              field: "categoryHierarchy",
              oldValue: oldHierarchy,
              newValue: categoryHierarchy.displayPath,
            },
          ],
          description: `Ticket ${ticket.ticketNumber} category hierarchy changed from "${oldHierarchy}" to "${categoryHierarchy.displayPath || "Updated"}"`,
          req,
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("Update category hierarchy error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update category hierarchy",
    });
  }
};

/**
 * Update ticket priority
 */
export const updateTicketPriority = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Authorization check
    if (!(await canModifyTicket(userId, ticket, user))) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this ticket",
      });
    }

    const oldPriority = ticket.priority;
    // Convert priority to uppercase code (e.g., MEDIUM -> MEDIUM, medium -> MEDIUM)
    ticket.priority = priority.toUpperCase().trim();
    ticket.updatedAt = new Date();

    // Update slaRuleId to keep ObjectId in sync with the new priority name
    try {
      const SLARuleModel = require("../models/sla-module/SLARule").default;
      const projectId = (ticket as any).metadata?.projectId;
      if (projectId) {
        const matchedSlaRule = await SLARuleModel.findOne({
          projectIds: {
            $in: [new mongoose.Types.ObjectId(projectId.toString())],
          },
          name: {
            $regex: new RegExp(
              `^${ticket.priority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              "i",
            ),
          },
          isActive: true,
        })
          .select("_id")
          .lean();
        (ticket as any).slaRuleId = matchedSlaRule?._id || undefined;
      }
    } catch (_e) {
      /* non-critical - slaRuleId sync failure does not block priority update */
    }

    // Track change in history
    await trackChange(ticket, "priority", oldPriority, ticket.priority, userId);

    await ticket.save();

    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName:
            user.name ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          userEmail: user.email,
          action: "update",
          entity: "ticket",
          entityId: ticket._id.toString(),
          entityName: ticket.subject,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [
            { field: "priority", oldValue: oldPriority, newValue: priority },
          ],
          description: `Ticket ${ticket.ticketNumber} priority changed from ${oldPriority} to ${priority}`,
          req,
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("Update priority error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update priority",
    });
  }
};

/**
 * Add tag to ticket
 */
export const addTicketTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    const userId = (req as any).user?.userId;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    if (!ticket.tags) {
      ticket.tags = [];
    }

    if (!ticket.tags.includes(tag)) {
      ticket.tags.push(tag);
      ticket.updatedAt = new Date();

      // Track change in history
      await trackChange(ticket, "Tags", "", tag, userId, "add");

      await ticket.save();
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("Add tag error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add tag",
    });
  }
};

/**
 * Remove tag from ticket
 */
export const removeTicketTag = async (req: Request, res: Response) => {
  try {
    const { id, tag } = req.params;
    const userId = (req as any).user?.userId;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    if (ticket.tags) {
      ticket.tags = ticket.tags.filter((t) => t !== tag);
      ticket.updatedAt = new Date();

      // Track change in history
      await trackChange(ticket, "Tags", tag, "", userId, "remove");

      await ticket.save();
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("Remove tag error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove tag",
    });
  }
};

/**
 * Add internal note to ticket
 */
export const addInternalNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = (req as any).user?.userId;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!ticket.internalNotes) {
      ticket.internalNotes = [];
    }

    ticket.internalNotes.push({
      _id: new mongoose.Types.ObjectId(),
      note,
      createdBy: userId, // Store userId directly as ObjectId reference
      createdAt: new Date(),
    } as any);

    ticket.updatedAt = new Date();
    await ticket.save();

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("Add note error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add internal note",
    });
  }
};

/**
 * Escalate ticket
 */
export const escalateTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { escalateTo, reason } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    console.log(`🔄 Escalation attempt - User: ${userId}, Ticket: ${id}`);

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Get user details
    const currentUser = await User.findById(userId).populate("role");
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Current user not found",
      });
    }

    // Check if user has permission to escalate
    // Allow if: user is an agent (has isAgent role)
    const userRole = currentUser.role as any;
    const isAgent = userRole?.isAgent || false;

    console.log(`🔍 Escalation auth check:`, {
      userId,
      userEmail: currentUser.email,
      roleName: userRole?.name,
      roleCode: userRole?.code,
      isAgent,
      ticketAssignedTo: ticket.assignedTo?.toString(),
      isAssignedAgent: ticket.assignedTo?.toString() === userId,
    });

    // Allow escalation if user is an agent
    if (!isAgent) {
      console.log(
        `❌ Escalation denied: User ${userId} (${currentUser.email}) is not an agent`,
      );
      return res.status(403).json({
        success: false,
        message: "Only agents can escalate tickets",
      });
    }

    // Ownership: only the current assignee (or a user with TICKET_MODIFY_ANY)
    // may escalate. Agents cannot escalate queries that aren't theirs.
    if (!(await canModifyTicket(userId, ticket, user))) {
      return res.status(403).json({
        success: false,
        message: "You can only escalate queries assigned to you",
      });
    }

    // Extract user ID from escalation level format: "policyId-levelName-userId"
    let escalatedUserId = escalateTo;
    if (typeof escalateTo === "string" && escalateTo.includes("-")) {
      const parts = escalateTo.split("-");
      // Last part is the user ID
      escalatedUserId = parts[parts.length - 1];
    }

    const escalatedUser = await User.findById(escalatedUserId);
    if (!escalatedUser) {
      return res.status(404).json({
        success: false,
        message: "Escalation user not found",
      });
    }

    if (!ticket.escalationHistory) {
      ticket.escalationHistory = [];
    }

    ticket.escalationHistory.push({
      _id: new mongoose.Types.ObjectId(),
      escalatedTo: new mongoose.Types.ObjectId(escalatedUserId),
      escalatedBy: new mongoose.Types.ObjectId(userId),
      reason,
      escalatedAt: new Date(),
    } as any);

    // Store old assignedTo for change tracking
    const oldAssignedTo = ticket.assignedTo;
    const oldAssignedToUser = oldAssignedTo
      ? await User.findById(oldAssignedTo)
      : null;

    // Update assigned agent
    ticket.assignedTo = new mongoose.Types.ObjectId(escalatedUserId);
    ticket.updatedAt = new Date();

    // Track assignment change in history
    const oldAssignedName = oldAssignedToUser
      ? `${oldAssignedToUser.firstName} ${oldAssignedToUser.lastName}`
      : "Unassigned";
    const newAssignedName = `${escalatedUser.firstName} ${escalatedUser.lastName}`;
    await trackChange(
      ticket,
      "assignedTo",
      oldAssignedName,
      newAssignedName,
      userId,
    );

    await ticket.save();

    // Update SLA tracking with new escalation level and deadline
    const slaTracking = await SLATracking.findOne({
      ticketId: ticket._id,
    }).populate("escalationPolicyId");

    if (slaTracking && slaTracking.escalationPolicyId) {
      const policy = slaTracking.escalationPolicyId as any;
      const newLevel = ticket.escalationHistory.length; // Escalation level based on history count
      // When at level N (e.g., L2 = level 1), use level N+1 config for SLA time
      const levelConfig = policy.levels?.find(
        (l: any) => l.level === newLevel + 1,
      );

      if (levelConfig && levelConfig.escalateAfter) {
        console.log(
          `📅 Updating SLA for manual escalation to L${newLevel + 1} (using level ${newLevel + 1} config)`,
        );

        // Calculate new resolution deadline from NOW + level's SLA time
        const now = new Date();
        let minutes = 0;
        switch (levelConfig.escalateAfter.unit) {
          case "minutes":
            minutes = levelConfig.escalateAfter.value;
            break;
          case "hours":
            minutes = levelConfig.escalateAfter.value * 60;
            break;
          case "days":
            minutes = levelConfig.escalateAfter.value * 24 * 60;
            break;
        }

        const newResolutionDeadline = new Date(
          now.getTime() + minutes * 60 * 1000,
        );
        slaTracking.currentEscalationLevel = newLevel;
        slaTracking.resolutionDeadline = newResolutionDeadline;
        slaTracking.lastEscalationAt = now;

        // Add to SLA escalation history
        slaTracking.escalationHistory.push({
          level: newLevel,
          escalatedAt: now,
          escalatedTo: new mongoose.Types.ObjectId(escalatedUserId),
          escalatedBy: new mongoose.Types.ObjectId(userId),
          mode: "manual",
          reason: reason,
        } as any);

        // Set next escalation due if there's another level
        const nextLevel = policy.levels?.find(
          (l: any) => l.level === newLevel + 1,
        );
        if (nextLevel && levelConfig.escalationMode === "auto") {
          slaTracking.nextEscalationDue = newResolutionDeadline;
          console.log(
            `📅 Next auto-escalation due: ${newResolutionDeadline.toISOString()}`,
          );
        } else {
          slaTracking.nextEscalationDue = undefined;
        }

        await slaTracking.save();

        console.log(`📅 Manual Escalation SLA Updated:`);
        console.log(`   ↳ Escalation Time: ${now.toISOString()}`);
        console.log(`   ↳ Level: L${newLevel}`);
        console.log(
          `   ↳ SLA Duration: ${levelConfig.escalateAfter.value} ${levelConfig.escalateAfter.unit}`,
        );
        console.log(
          `   ↳ New Resolution Deadline: ${newResolutionDeadline.toISOString()}`,
        );
      }
    }

    console.log(
      `✅ Ticket ${id} escalated by ${currentUser.email} to ${escalatedUser.email}`,
    );

    // Notification engine: ticket_escalated → notify only the escalated-to agent
    (() => {
      const projectId =
        (ticket as any).metadata?.projectId?.toString() ||
        (ticket as any).project?.toString();
      if (projectId && escalatedUserId) {
        fireNotification({
          triggerType: TRIGGER_TYPES.TICKET_ESCALATED,
          triggeredByUserId: userId,
          projectId,
          entityType: "ticket",
          entityId: ticket._id as mongoose.Types.ObjectId,
          deepLinkUrl: `/projects/${projectId}/tickets/${(ticket._id as any).toString()}`,
          templateVars: { ticketNumber: ticket.ticketNumber },
          recipientOverride: [new mongoose.Types.ObjectId(escalatedUserId)],
        }).catch(console.error);
      }
    })();

    return res.status(200).json({
      success: true,
      message: "Ticket escalated successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("Escalate ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to escalate ticket",
    });
  }
};

/**
 * Assign ticket to agent
 */
export const assignTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    // Get current user info from auth middleware
    const currentUser = await User.findById((req as any).user.userId).populate(
      "role",
    );
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Validate ticket exists
    const ticket = await Ticket.findById(id).populate(
      "metadata.projectId",
      "name",
    );
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check if user has access to this ticket based on centers
    const userCenterIds = (currentUser.centers || []).map((c: any) =>
      typeof c === "string" ? c : c._id?.toString() || c.toString(),
    );

    if (userCenterIds.length > 0) {
      // User has centers - check if ticket's center matches
      const ticketCenterId = ticket.metadata?.centerId;

      // Allow if ticket is online OR ticket center matches user's centers
      const hasAccess =
        ticketCenterId === "online" ||
        !ticketCenterId ||
        userCenterIds.includes(ticketCenterId?.toString());

      if (!hasAccess) {
        console.log(
          `❌ Access denied: User centers [${userCenterIds.join(", ")}] don't match ticket center [${ticketCenterId}]`,
        );
        return res.status(403).json({
          success: false,
          message:
            "You do not have access to assign this ticket. Ticket center does not match your assigned centers.",
        });
      }

      console.log(
        `✅ Access granted: Ticket center [${ticketCenterId}] matches user centers`,
      );
    }

    // Validate agent exists and is active
    const agent = await User.findById(agentId).populate("role");
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found",
      });
    }

    if (!agent.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot assign to inactive agent",
      });
    }

    // Store old assignment for logging
    const oldAssignedTo = ticket.assignedTo;
    const oldAssignedToUser = oldAssignedTo
      ? await User.findById(oldAssignedTo)
      : null;

    // Update ticket assignment
    ticket.assignedTo = new mongoose.Types.ObjectId(agentId);
    ticket.updatedAt = new Date();

    // Track change in history
    const oldAssignedName = oldAssignedToUser
      ? `${oldAssignedToUser.firstName} ${oldAssignedToUser.lastName}`
      : "Unassigned";
    const newAssignedName = `${agent.firstName} ${agent.lastName}`;
    await trackChange(
      ticket,
      "assignedTo",
      oldAssignedName,
      newAssignedName,
      currentUser._id.toString(),
    );

    await ticket.save();

    // Log activity
    const agentName = `${agent.firstName} ${agent.lastName}`;
    const projectInfo = ticket.metadata?.projectId as any;

    await logActivity({
      userId: currentUser._id.toString(),
      userName: `${currentUser.firstName} ${currentUser.lastName}`,
      userEmail: currentUser.email,
      action: "update",
      entity: "ticket",
      entityId: ticket._id.toString(),
      entityName: `Ticket #${ticket.ticketNumber}`,
      changes: [
        {
          field: "assignedTo",
          oldValue: oldAssignedTo ? oldAssignedTo.toString() : "Unassigned",
          newValue: agentName,
        },
      ],
      description: `Assigned ticket #${ticket.ticketNumber} to ${agentName}`,
      req,
      projectId: projectInfo?._id?.toString(),
      projectName: projectInfo?.name,
      role: (currentUser.role as any)?.name,
      metadata: {
        ticketId: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        agentId: agent._id.toString(),
        agentName: agentName,
        agentEmail: agent.email,
      },
    });

    // Check feedback triggers for agent assignment (non-blocking)
    (async () => {
      try {
        const {
          checkAndTriggerFeedback,
        } = require("../services/feedbackTriggerService");
        await checkAndTriggerFeedback("agent_assigned", {
          projectId: projectInfo?._id?.toString(),
          ticketId: ticket._id.toString(),
          agentId: agentId,
        });
      } catch (error) {
        console.error(
          "Error checking agent_assigned feedback triggers:",
          error,
        );
      }
    })();

    // Notify assigned agent via email (non-blocking)
    // Resolve projectId robustly (handles both populated object and raw ObjectId)
    const projectId =
      (projectInfo as any)?._id?.toString() ||
      ticket.metadata?.projectId?.toString() ||
      (ticket as any).project?.toString();
    const ticketSubject = ticket.subject || "";
    const studentName =
      ticket.metadata?.studentName ||
      ticket.metadata?.studentEmail ||
      "Student";

    (async () => {
      try {
        await sendTicketAssignedEmail(
          agent.email,
          ticket.ticketNumber,
          ticketSubject,
          studentName,
          ticket.priority || "low",
          projectId,
          { agentName: `${agent.firstName} ${agent.lastName}`.trim() },
        );
      } catch (e) {
        console.error(
          "[assignTicket] Failed to send email to assigned agent:",
          e,
        );
      }
    })();

    // Notification engine: ticket_assigned_to_me (direct to newly assigned agent)
    if (projectId) {
      fireNotification({
        triggerType: TRIGGER_TYPES.TICKET_ASSIGNED_TO_ME,
        triggeredByUserId: currentUser._id.toString(),
        projectId,
        entityType: "ticket",
        entityId: ticket._id as mongoose.Types.ObjectId,
        deepLinkUrl: `/projects/${projectId}/tickets/${(ticket._id as any).toString()}`,
        templateVars: { ticketNumber: ticket.ticketNumber },
        recipientOverride: [new mongoose.Types.ObjectId(agentId)],
      }).catch(console.error);
    }

    // Push notification to the assigned agent (in-app + push, non-blocking)
    if (projectId) {
      (async () => {
        try {
          const {
            createNotification,
          } = require("../controllers/notificationController");
          const isProduction = process.env.NODE_ENV === "production";
          const frontendUrl = isProduction
            ? process.env.PRODUCTION_FRONTEND_URL ||
              "https://helpdesk.hubblehox.ai"
            : process.env.FRONTEND_URL || "http://localhost:3001";
          await createNotification({
            userId: new mongoose.Types.ObjectId(agentId),
            projectId: new mongoose.Types.ObjectId(projectId),
            type: "info" as const,
            title: `Ticket Assigned to You: ${ticket.ticketNumber}`,
            message: ticket.subject,
            ticketId: ticket._id as mongoose.Types.ObjectId,
            link: `${frontendUrl}/tickets/${ticket._id}`,
          });
        } catch (notifErr) {
          console.error(
            "⚠️ Failed to send assign push notification:",
            notifErr,
          );
        }
      })();
    }

    // Populate assignedTo for response
    const updatedTicket = await Ticket.findById(id)
      .populate("assignedTo", "firstName lastName email")
      .populate("metadata.projectId", "name");

    await emitTicketRealtimeUpdate(updatedTicket, "reassigned");

    // Dashboard cache invalidation (fire-and-forget)
    if (projectId) {
      dashboardEvents.emit("ticket.assigned", {
        tenantId: projectId,
        assigneeId: agentId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      data: updatedTicket,
    });
  } catch (error) {
    console.error("Assign ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to assign ticket",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Reassign a ticket to a different agent (any user with TICKET_ASSIGN permission)
 * PATCH /api/tickets/:id/reassign
 * Body: { newAgentId: string, reason: string }
 */
export const reassignTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newAgentId, reason } = req.body;
    const callerId = (req as any).user?.userId;

    if (!callerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!newAgentId) {
      return res.status(400).json({
        success: false,
        message: "newAgentId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(newAgentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid agent ID" });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket not found" });
    }

    const newAgent = await User.findById(newAgentId);
    if (!newAgent || !newAgent.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Agent not found or inactive" });
    }

    // Store previous assignee for email + history
    const oldAssignedTo = ticket.assignedTo
      ? await User.findById(ticket.assignedTo)
      : null;
    const oldAssignedName = oldAssignedTo
      ? `${oldAssignedTo.firstName} ${oldAssignedTo.lastName}`
      : "Unassigned";
    const newAssignedName = `${newAgent.firstName} ${newAgent.lastName}`;

    // ── CENTER-SCOPE GUARD ───────────────────────────────────────────────────
    // For offline tickets that belong to a specific center, the new agent must
    // be assigned to that same center. Super Admins bypass this check.
    const ticketRawCenter = (ticket as any).metadata?.centerId;
    if (ticketRawCenter && ticketRawCenter !== "online") {
      const callerForCheck = await User.findById(callerId).populate("role");
      const callerRoleCode = (callerForCheck?.role as any)?.code;
      const isSuperAdminCaller = callerRoleCode === "SUPER_ADMIN";

      if (!isSuperAdminCaller) {
        const ticketCenterStr =
          typeof ticketRawCenter === "object"
            ? (ticketRawCenter._id?.toString() ?? String(ticketRawCenter))
            : String(ticketRawCenter);

        const agentCenterIds = ((newAgent as any).centers || []).map(
          (c: any) =>
            typeof c === "object"
              ? (c._id?.toString() ?? String(c))
              : String(c),
        );

        if (!agentCenterIds.includes(ticketCenterStr)) {
          return res.status(400).json({
            success: false,
            message: `Cannot reassign: ${newAgent.firstName} ${newAgent.lastName} is not assigned to this ticket's venue/center.`,
          });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Update assignment
    ticket.assignedTo = new mongoose.Types.ObjectId(newAgentId);
    ticket.hasNewReply = false; // new agent starts fresh
    ticket.updatedAt = new Date();

    // Log to changeHistory with reassigned type + reason
    const callerUser = await User.findById(callerId);
    (ticket.changeHistory as any[]).push({
      field: "assignedTo",
      oldValue: oldAssignedName,
      newValue: newAssignedName,
      changedBy: new mongoose.Types.ObjectId(callerId),
      changedAt: new Date(),
      changeType: "reassigned",
      reassignmentReason: reason?.trim() ?? "",
    });

    await ticket.save();

    // Notify new agent
    const projectId =
      (ticket.metadata?.projectId as any)?._id?.toString() ||
      ticket.metadata?.projectId?.toString();
    const ticketSubject = ticket.subject || "";
    const studentName =
      ticket.metadata?.studentName ||
      ticket.metadata?.studentEmail ||
      "Student";

    (async () => {
      try {
        const assignedByName = callerUser
          ? `${callerUser.firstName} ${callerUser.lastName}`.trim()
          : "Not applicable";
        await sendTicketAssignedEmail(
          newAgent.email,
          ticket.ticketNumber,
          ticketSubject,
          studentName,
          ticket.priority || "low",
          projectId,
          {
            agentName: `${newAgent.firstName} ${newAgent.lastName}`.trim(),
            assignedBy: assignedByName,
          },
        );
      } catch (e) {
        console.error("[reassignTicket] Failed to send email to new agent:", e);
      }
    })();

    // Push notification to the newly assigned agent
    if (projectId) {
      (async () => {
        try {
          const {
            createNotification,
          } = require("../controllers/notificationController");
          const isProduction = process.env.NODE_ENV === "production";
          const frontendUrl = isProduction
            ? process.env.PRODUCTION_FRONTEND_URL ||
              "https://helpdesk.hubblehox.ai"
            : process.env.FRONTEND_URL || "http://localhost:3001";

          const notificationLink = `${frontendUrl}/tickets/${ticket._id}`;

          await createNotification({
            userId: new mongoose.Types.ObjectId(newAgentId),
            projectId: new mongoose.Types.ObjectId(projectId),
            type: "info" as const,
            title: `Ticket Assigned to You: ${ticket.ticketNumber}`,
            message: ticket.subject,
            ticketId: ticket._id as mongoose.Types.ObjectId,
            link: notificationLink,
          });
        } catch (notifErr) {
          console.error(
            "⚠️ Failed to send reassign push notification:",
            notifErr,
          );
        }
      })();
    }

    const updatedTicket = await Ticket.findById(id)
      .populate("assignedTo", "firstName lastName email")
      .populate("category", "name")
      .populate("changeHistory.changedBy", "firstName lastName email");

    await emitTicketRealtimeUpdate(updatedTicket, "reassigned");

    return res.status(200).json({
      success: true,
      message: "Ticket reassigned successfully",
      data: updatedTicket,
    });
  } catch (error) {
    console.error("Reassign ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reassign ticket",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get all available tags
 */
export const getAllTags = async (req: Request, res: Response) => {
  try {
    // Optimized: Use distinct() instead of fetching all tickets with tags
    // This reduces data transfer by 95%+ and is handled entirely by MongoDB
    const tags = await Ticket.distinct("tags", {
      tags: { $exists: true, $ne: [] },
    });

    // Sort alphabetically
    const sortedTags = tags.filter(Boolean).sort();

    return res.status(200).json({
      success: true,
      data: sortedTags,
    });
  } catch (error) {
    console.error("Get tags error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tags",
    });
  }
};

/**
 * Bulk update tickets by tags
 */
export const bulkUpdateByTags = async (req: Request, res: Response) => {
  try {
    const { tags, updates } = req.body;

    const result = await Ticket.updateMany(
      { tags: { $in: tags } },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} tickets`,
      data: result,
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to bulk update tickets",
    });
  }
};

/**
 * Get dashboard statistics for the logged-in user
 * Supports filtering by projectId query parameter
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { projectId, viewMode } = req.query; // Get projectId and viewMode from query params

    // Populate user with role, and populate role.permissions to get permission codes
    const user = await User.findById(userId)
      .populate({
        path: "role",
        populate: {
          path: "permissions",
          select: "code",
        },
      })
      .populate("centers")
      .populate("projects");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const roleCode = (user.role as any)?.code;

    // Check if user is Super Admin - they should see ALL data across all projects
    const isSuperAdmin = roleCode === "SUPER_ADMIN";

    // Extract permission codes from populated permissions
    const permissions = (user.role as any)?.permissions || [];
    const permissionCodes = permissions
      .map((p: any) => (typeof p === "string" ? p : p.code))
      .filter(Boolean);

    console.log(
      `📊 [DASHBOARD] User: ${user.email}, Role: ${roleCode}, IsSuperAdmin: ${isSuperAdmin}`,
    );
    console.log(`📊 [DASHBOARD] Permission codes:`, permissionCodes);

    // ===== HIERARCHICAL DASHBOARD ENHANCEMENT =====
    // Determine which view mode to use and which users' tickets to show
    let appliedViewMode: string = "self"; // Default to self
    let targetUserIds: mongoose.Types.ObjectId[] = [
      new mongoose.Types.ObjectId(userId),
    ];
    let teamMembers: any[] = []; // For team breakdown

    // Check hierarchical dashboard permissions
    const hasDashboardViewAll = permissionCodes.includes("DASHBOARD_VIEW_ALL");
    const hasDashboardViewHierarchy = permissionCodes.includes(
      "DASHBOARD_VIEW_HIERARCHY",
    );
    const hasDashboardViewTeam = permissionCodes.includes(
      "DASHBOARD_VIEW_TEAM",
    );
    const hasDashboardViewOWN = permissionCodes.includes("DASHBOARD_VIEW_OWN");
    const hasDashboardViewTeamBreakdown = permissionCodes.includes(
      "DASHBOARD_VIEW_TEAM_BREAKDOWN",
    );

    // Fetch user's dashboard config for default view mode
    const dashboardConfig = await UserDashboardConfig.findOne({ userId });
    const defaultViewMode = dashboardConfig?.defaultViewMode || "self";

    // Use provided viewMode from query, or fall back to user's config, or default to 'self'
    let requestedViewMode = (viewMode as string) || defaultViewMode;
    console.log(
      `📊 [DASHBOARD] Requested view mode: ${requestedViewMode}, Default: ${defaultViewMode}`,
    );

    // Validate and apply view mode based on permissions
    if (requestedViewMode === "all" && (hasDashboardViewAll || isSuperAdmin)) {
      appliedViewMode = "all";
      targetUserIds = []; // No user filter means show all tickets
      console.log(`📊 [DASHBOARD] View mode: ALL (no user filter)`);
    } else if (
      requestedViewMode === "hierarchy" &&
      (hasDashboardViewHierarchy || isSuperAdmin)
    ) {
      appliedViewMode = "hierarchy";
      // Get all reportees recursively (multi-level)
      const maxDepth = dashboardConfig?.maxHierarchyDepth || 10;
      const reportees = await UserReportingHierarchy.getAllReporteesRecursive(
        userId,
        projectId as string | undefined,
        maxDepth,
      );
      targetUserIds = [
        new mongoose.Types.ObjectId(userId),
        ...reportees.map((r: any) => new mongoose.Types.ObjectId(r.userId)),
      ];
      teamMembers = reportees;
      console.log(
        `📊 [DASHBOARD] View mode: HIERARCHY (${reportees.length} reportees across ${maxDepth} levels)`,
      );
    } else if (
      requestedViewMode === "team" &&
      (hasDashboardViewTeam || isSuperAdmin)
    ) {
      appliedViewMode = "team";
      // Get only direct reportees (level 1)
      const reportees = await UserReportingHierarchy.getDirectReportees(
        userId,
        projectId as string | undefined,
      );
      targetUserIds = [
        new mongoose.Types.ObjectId(userId),
        ...reportees.map((r: any) => new mongoose.Types.ObjectId(r.userId)),
      ];
      teamMembers = reportees;
      console.log(
        `📊 [DASHBOARD] View mode: TEAM (${reportees.length} direct reportees)`,
      );
    } else {
      // Default to 'self' - show only user's own tickets
      appliedViewMode = "self";
      targetUserIds = [new mongoose.Types.ObjectId(userId)];
      console.log(`📊 [DASHBOARD] View mode: SELF (user's own tickets only)`);
    }
    // ===== END HIERARCHICAL ENHANCEMENT =====

    // Build query based on user permissions (not role)
    let query: any = {};

    // Check permissions using extracted codes
    const hasViewAllTickets = permissionCodes.includes("TICKET_VIEW_ALL");
    const hasViewOwnTickets = permissionCodes.includes("TICKET_VIEW_OWN");

    console.log(
      `📊 [DASHBOARD] TICKET_VIEW_ALL: ${hasViewAllTickets}, TICKET_VIEW_OWN: ${hasViewOwnTickets}`,
    );

    // First, apply project filter based on projectId param or user's assigned projects
    // SUPER_ADMIN sees ALL projects - no project filter needed unless specific project selected
    if (projectId) {
      // Specific project selected - convert string to ObjectId for proper comparison
      try {
        query["metadata.projectId"] = new mongoose.Types.ObjectId(
          projectId as string,
        );
        console.log(
          `📊 [DASHBOARD] Filtering by specific projectId (ObjectId): ${projectId}`,
        );
      } catch (e) {
        query["metadata.projectId"] = projectId;
        console.log(
          `📊 [DASHBOARD] Filtering by specific projectId (string): ${projectId}`,
        );
      }
    } else if (isSuperAdmin) {
      // Super Admin with no specific project - see ALL tickets across all projects
      console.log(
        `📊 [DASHBOARD] Super Admin - no project filter applied (sees all projects)`,
      );
      // query remains empty - no project filter
    } else {
      // No specific project - use user's assigned projects (for "All Projects" mode)
      const userProjectIds = (user.projects || []).map((p: any) =>
        typeof p === "string" ? p : p._id?.toString() || p.toString(),
      );
      const roleProjectIds = ((user.role as any)?.projects || []).map(
        (p: any) =>
          typeof p === "string" ? p : p._id?.toString() || p.toString(),
      );
      const allUserProjectIds = [
        ...new Set([...userProjectIds, ...roleProjectIds]),
      ];

      console.log(`📊 [DASHBOARD] User: ${user.email}`);
      console.log(`📊 [DASHBOARD] User projects:`, userProjectIds);
      console.log(`📊 [DASHBOARD] Role projects:`, roleProjectIds);
      console.log(`📊 [DASHBOARD] Combined projects:`, allUserProjectIds);

      if (allUserProjectIds.length > 0) {
        query["metadata.projectId"] = { $in: allUserProjectIds };
        console.log(
          `📊 [DASHBOARD] Filtering by user's ${allUserProjectIds.length} assigned projects:`,
          allUserProjectIds,
        );
      } else {
        console.warn(
          `⚠️ [DASHBOARD] No projects found for user ${user.email}. Will return empty stats.`,
        );
      }
    }

    // Then apply additional filters based on permissions
    if (hasViewAllTickets) {
      // Users with TICKET_VIEW_ALL see all tickets in the filtered projects
      // (project filter already applied above)

      // Apply hierarchical filtering for team/hierarchy views (even with TICKET_VIEW_ALL)
      if (appliedViewMode !== "all" && targetUserIds.length > 0) {
        const userFilter = { assignedTo: { $in: targetUserIds } };
        if (query["metadata.projectId"]) {
          query = {
            $and: [
              { "metadata.projectId": query["metadata.projectId"] },
              userFilter,
            ],
          };
        } else {
          query = userFilter;
        }
      }

      // Add center filtering for TICKET_VIEW_ALL users with centers
      const userCenterIds = (user.centers || []).map((c: any) => {
        const centerId =
          typeof c === "string" ? c : c._id?.toString() || c.toString();
        return new mongoose.Types.ObjectId(centerId);
      });

      if (userCenterIds.length > 0) {
        const centerFilter = {
          $or: [
            { "metadata.centerId": "online" },
            { "metadata.centerId": { $in: userCenterIds } },
            { "metadata.centerId": { $exists: false } },
            { "metadata.centerId": null },
          ],
        };

        if (query.$and) {
          query.$and.push(centerFilter);
        } else if (query["metadata.projectId"]) {
          query = {
            $and: [
              { "metadata.projectId": query["metadata.projectId"] },
              centerFilter,
            ],
          };
        } else {
          query = centerFilter;
        }
      }
    } else if (hasViewOwnTickets) {
      // Users with TICKET_VIEW_OWN see tickets assigned to them within the filtered projects
      const projectFilter = query["metadata.projectId"]
        ? { "metadata.projectId": query["metadata.projectId"] }
        : {};

      // Apply hierarchical filtering: if viewMode is team/hierarchy, include team member tickets
      const userFilter =
        appliedViewMode === "self"
          ? {
              $or: [
                { assignedTo: userId },
                { "metadata.studentEmail": user.email },
              ],
            }
          : targetUserIds.length > 0
            ? { assignedTo: { $in: targetUserIds } }
            : {};

      query = {
        $and: [projectFilter, userFilter].filter(
          (f) => Object.keys(f).length > 0,
        ),
      };

      // If $and is empty, just use the user filter
      if (query.$and && query.$and.length === 0) {
        query = userFilter;
      }

      // Add center filtering for VIEW_OWN users with centers
      const userCenterIds = (user.centers || []).map((c: any) =>
        typeof c === "string" ? c : c._id?.toString() || c.toString(),
      );

      if (userCenterIds.length > 0) {
        const centerFilter = {
          $or: [
            { "metadata.centerId": "online" },
            { "metadata.centerId": { $in: userCenterIds } },
            { "metadata.centerId": { $exists: false } },
          ],
        };

        if (query.$and) {
          query.$and.push(centerFilter);
        } else {
          query = { $and: [query, centerFilter] };
        }
      }
    } else {
      // No ticket view permissions - show only tickets created by this user
      const projectFilter = query["metadata.projectId"]
        ? { "metadata.projectId": query["metadata.projectId"] }
        : {};
      query = { ...projectFilter, "metadata.studentEmail": user.email };
    }

    // Always exclude merged secondary tickets from dashboard counts
    if (query.$and) {
      query.$and.push({ isMerged: { $ne: true } });
    } else {
      query.isMerged = { $ne: true };
    }

    console.log(`📊 [DASHBOARD] Final query:`, JSON.stringify(query));

    // ===== FETCH PROJECT STATUS CONFIG FOR DYNAMIC CLOSED/PENDING DETECTION =====
    // Determines which status codes are "closed" (isClosed=true) and which are "pending"
    // for SLA bucketing. Falls back to the legacy hardcoded values when a project has no
    // custom status configuration.
    let closedStatusCodes: number[] = [4, 5]; // legacy fallback
    let pendingStatusCodes: number[] = [1, 2, 3]; // legacy fallback
    try {
      const StatusModel = require("../models/Status").Status;
      const effectiveProjectId =
        projectId ??
        (query["metadata.projectId"] instanceof mongoose.Types.ObjectId
          ? query["metadata.projectId"].toString()
          : query["metadata.projectId"]);
      if (effectiveProjectId) {
        const projectStatuses: any[] = await StatusModel.find({
          projectId: effectiveProjectId,
        }).select("code isClosed");
        if (projectStatuses.length > 0) {
          closedStatusCodes = projectStatuses
            .filter((s) => s.isClosed === true)
            .map((s) => s.code);
          pendingStatusCodes = projectStatuses
            .filter((s) => s.isClosed !== true)
            .map((s) => s.code);
          // If project has no closed status configured, fall back to [4,5]
          if (closedStatusCodes.length === 0) closedStatusCodes = [4, 5];
          if (pendingStatusCodes.length === 0) pendingStatusCodes = [1, 2, 3];
        }
      }
    } catch (statusErr) {
      console.warn(
        "⚠️ [DASHBOARD] Could not load project status config, using defaults:",
        statusErr,
      );
    }
    console.log(
      `📊 [DASHBOARD] Closed status codes: [${closedStatusCodes}]  Pending: [${pendingStatusCodes}]`,
    );
    // ===== END STATUS CONFIG =====

    // ===== SLA FIELD SELECTION BASED ON VIEW MODE =====
    // For 'self' view (My Ticket Dashboard): Use role-level SLA (resets on escalation)
    // For 'team'/'hierarchy' views: Use ticket-level SLA (overall from creation)
    const useRoleLevelSLA = appliedViewMode === "self";
    const slaBreachedField = useRoleLevelSLA
      ? "roleLevelSLA.breachedAt"
      : "ticketLevelSLA.breachedAt";
    console.log(
      `📊 [DASHBOARD] Using ${useRoleLevelSLA ? "ROLE-LEVEL" : "TICKET-LEVEL"} SLA for viewMode: ${appliedViewMode}`,
    );
    // ===== END SLA FIELD SELECTION =====

    // Optimized: Single aggregation instead of 11 sequential countDocuments calls
    // This reduces database round-trips from 12 to 2 (aggregation + recent activity)
    const [statsResult, recentActivity, footfallData] = await Promise.all([
      Ticket.aggregate([
        { $match: query },
        {
          $facet: {
            // Total count
            total: [{ $count: "count" }],

            // Status breakdown
            statusCounts: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                },
              },
            ],

            // Priority breakdown
            priorityCounts: [
              {
                $group: {
                  _id: "$priority",
                  count: { $sum: 1 },
                },
              },
            ],

            // SLA stats for closed/resolved tickets - use appropriate SLA field
            // closedStatusCodes is derived from the project's Status config (isClosed=true)
            closedSLA: [
              { $match: { status: { $in: closedStatusCodes } } },
              {
                $group: {
                  _id: {
                    $cond: {
                      if: {
                        $ifNull: [
                          useRoleLevelSLA
                            ? "$roleLevelSLA.breachedAt"
                            : "$ticketLevelSLA.breachedAt",
                          null,
                        ],
                      },
                      then: true,
                      else: false,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
            ],

            // SLA stats for pending tickets - use appropriate SLA field
            // pendingStatusCodes is derived from the project's Status config (isClosed!=true)
            pendingSLA: [
              { $match: { status: { $in: pendingStatusCodes } } },
              {
                $group: {
                  _id: {
                    $cond: {
                      if: {
                        $ifNull: [
                          useRoleLevelSLA
                            ? "$roleLevelSLA.breachedAt"
                            : "$ticketLevelSLA.breachedAt",
                          null,
                        ],
                      },
                      then: true,
                      else: false,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),

      // Get recent activity (last 5 tickets)
      Ticket.find(query)
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("ticketNumber title status updatedAt")
        .lean(),

      // Footfall aggregation: unique students + total responses + new tickets
      Ticket.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            uniqueStudentEmails: { $addToSet: "$metadata.studentEmail" },
            totalResponses: { $sum: { $size: { $ifNull: ["$comments", []] } } },
            newTickets: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Extract stats from aggregation result
    const stats = statsResult[0];
    const total = stats.total[0]?.count || 0;

    // Status counts
    const statusMap = new Map<number, number>(
      stats.statusCounts.map((s: any) => [s._id, s.count]),
    );
    const pending =
      (statusMap.get(1) || 0) +
      (statusMap.get(2) || 0) +
      (statusMap.get(3) || 0);
    const resolved = statusMap.get(4) || 0;
    const closed = statusMap.get(5) || 0;

    // Priority counts
    const priorityMap = new Map<number, number>(
      stats.priorityCounts.map((p: any) => [p._id, p.count]),
    );
    const highPriority = priorityMap.get(3) || 0;
    const mediumPriority = priorityMap.get(2) || 0;
    const lowPriority = priorityMap.get(1) || 0;

    // SLA stats for closed/resolved
    const closedSLAMap = new Map<boolean, number>(
      stats.closedSLA.map((s: any) => [s._id, s.count]),
    );
    const closedWithinSLA = closedSLAMap.get(false) || 0;
    const closedOutsideSLA = closedSLAMap.get(true) || 0;

    // SLA stats for pending
    const pendingSLAMap = new Map<boolean, number>(
      stats.pendingSLA.map((s: any) => [s._id, s.count]),
    );
    const pendingWithinSLA = pendingSLAMap.get(false) || 0;
    const pendingOutsideSLA = pendingSLAMap.get(true) || 0;

    const formattedActivity = recentActivity.map((ticket) => ({
      ticketId: ticket._id.toString(),
      subject: ticket.subject,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
    }));

    // ===== TEAM BREAKDOWN (if permission exists and viewing team/hierarchy) =====
    let teamBreakdown: any[] | undefined = undefined;
    if (
      hasDashboardViewTeamBreakdown &&
      (appliedViewMode === "team" || appliedViewMode === "hierarchy")
    ) {
      // Fetch individual stats for each team member
      const breakdownPromises = [
        // Include the supervisor's own stats
        { userId, name: user.fullName || user.email, email: user.email },
        // Include reportees
        ...teamMembers.map((m) => ({
          userId: m.userId,
          name: m.fullName || m.name || m.email,
          email: m.email,
        })),
      ].map(async (member) => {
        const memberQuery = {
          ...query,
          assignedTo: new mongoose.Types.ObjectId(member.userId),
        };
        const memberStats = await Ticket.aggregate([
          { $match: memberQuery },
          {
            $facet: {
              total: [{ $count: "count" }],
              statusCounts: [
                { $group: { _id: "$status", count: { $sum: 1 } } },
              ],
              priorityCounts: [
                { $group: { _id: "$priority", count: { $sum: 1 } } },
              ],
            },
          },
        ]);

        const memberStatsData = memberStats[0];
        const total = memberStatsData.total[0]?.count || 0;
        const statusMap = new Map<number, number>(
          memberStatsData.statusCounts.map((s: any) => [s._id, s.count]),
        );
        const pending =
          (statusMap.get(1) || 0) +
          (statusMap.get(2) || 0) +
          (statusMap.get(3) || 0);
        const resolved = statusMap.get(4) || 0;
        const closed = statusMap.get(5) || 0;
        const priorityMap = new Map<number, number>(
          memberStatsData.priorityCounts.map((p: any) => [p._id, p.count]),
        );
        const highPriority = priorityMap.get(3) || 0;
        const mediumPriority = priorityMap.get(2) || 0;
        const lowPriority = priorityMap.get(1) || 0;

        return {
          userId: member.userId,
          name: member.name,
          email: member.email,
          stats: {
            total,
            pending,
            resolved,
            closed,
            highPriority,
            mediumPriority,
            lowPriority,
          },
        };
      });

      teamBreakdown = await Promise.all(breakdownPromises);
    }
    // ===== END TEAM BREAKDOWN =====

    // US-ASSIGN-001: Count fallback assignments this month for the current project scope
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const fallbackQuery: any = {
      assignedVia: "fallback",
      createdAt: { $gte: startOfMonth },
    };
    if (projectId) fallbackQuery["metadata.projectId"] = projectId;
    const fallbackAssignmentsThisMonth =
      await Ticket.countDocuments(fallbackQuery);

    // Compute footfall count
    // Formula: unique students (each student counted once regardless of ticket count)
    //          + total follow-up responses/comments on existing tickets
    // A student creating their first ticket is already counted in uniqueStudentCount,
    // so we do NOT add newTickets separately to avoid double-counting.
    const footfallAgg = footfallData[0];
    const uniqueStudentCount = footfallAgg
      ? (footfallAgg.uniqueStudentEmails as string[]).filter(Boolean).length
      : 0;
    const totalResponses: number = footfallAgg?.totalResponses || 0;
    const footfallCount = uniqueStudentCount + totalResponses;

    return res.status(200).json({
      success: true,
      viewMode: appliedViewMode, // Return which view mode was applied
      total,
      pending,
      resolved,
      closed,
      highPriority,
      mediumPriority,
      lowPriority,
      withinSLA: closedWithinSLA,
      outsideSLA: closedOutsideSLA,
      pendingWithinSLA,
      pendingOutsideSLA,
      recentActivity: formattedActivity,
      teamBreakdown, // Include team breakdown if applicable
      fallbackAssignmentsThisMonth,
      footfallCount,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics",
    });
  }
};

/**
 * Get project-specific dashboard statistics
 * Returns ticket counts by priority and SLA status for a specific project
 */
export const getProjectDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { projectId, projectIds, centerId, viewMode } = req.query;

    // viewMode: 'self' (own tickets), 'team' (direct reports), 'hierarchy' (all levels), 'all' (everything)
    const effectiveViewMode = (viewMode as string) || "self";

    if (!projectId && !projectIds) {
      return res.status(400).json({
        success: false,
        message: "Project ID is required",
      });
    }

    const user = await User.findById(userId).populate("role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userPermissions = (user.role as any)?.permissions || [];
    const userRole = user.role as any;
    const isAgent = userRole?.isAgent || false;

    // Check permissions - handle both string codes and ObjectId references
    const checkPermission = async (permCode: string): Promise<boolean> => {
      // First check if permission exists as string code
      const hasStringPermission = userPermissions.some((p: any) => {
        if (typeof p === "string") {
          return p === permCode;
        }
        return false;
      });

      if (hasStringPermission) {
        return true;
      }

      // Check by ObjectId - look up the permission and compare IDs
      const perm = await Permission.findOne({
        $or: [{ code: permCode }, { name: permCode }],
      });
      if (!perm) {
        return false;
      }

      const permId = perm._id.toString();
      return userPermissions.some((p: any) => {
        try {
          return p.toString() === permId;
        } catch (e) {
          return false;
        }
      });
    };

    console.log("🔍 Project Dashboard Stats Debug:", {
      userId,
      userEmail: user.email,
      roleName: userRole?.name,
      isAgent,
      projectId,
      centerId,
      viewMode: effectiveViewMode,
      permissionCount: userPermissions.length,
    });

    // Build query based on user permissions
    // Handle both ObjectId and string for metadata.projectId (some tickets may have string, others ObjectId)
    let projectIdFilter: any;

    // Support unified mode: projectIds is comma-separated list of project IDs
    const projectIdList = projectIds
      ? (projectIds as string)
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : projectId
        ? [projectId as string]
        : [];

    if (projectIdList.length > 1) {
      // Multiple projects (unified mode): $or across all of them
      const orClauses: any[] = [];
      for (const pid of projectIdList) {
        try {
          const oid = new mongoose.Types.ObjectId(pid);
          orClauses.push({ "metadata.projectId": oid });
          orClauses.push({ "metadata.projectId": pid });
        } catch {
          orClauses.push({ "metadata.projectId": pid });
        }
      }
      projectIdFilter = { $or: orClauses };
    } else if (projectIdList.length === 1) {
      try {
        const projectObjectId = new mongoose.Types.ObjectId(projectIdList[0]);
        // Query both ObjectId and string representations
        projectIdFilter = {
          $or: [
            { "metadata.projectId": projectObjectId },
            { "metadata.projectId": projectIdList[0] },
          ],
        };
      } catch (e) {
        projectIdFilter = { "metadata.projectId": projectIdList[0] }; // Fallback to string only
      }
    } else {
      projectIdFilter = {}; // Should not happen due to early return above
    }
    let query: any = projectIdFilter;

    // Apply center filter if provided (for offline mode)
    if (centerId) {
      query["metadata.centerId"] = centerId;
      console.log("🏢 Filtering dashboard stats by center:", centerId);
    }

    // ✅ DASHBOARD USES DASHBOARD_VIEW_HIERARCHY PERMISSION (NOT TICKET_VIEW_ALL)
    // This ensures:
    // - My Queries shows only assigned tickets (uses assignedTo filter)
    // - Ticket Lists uses TICKET_VIEW_ALL (for assignment/viewing all)
    // - Dashboard uses DASHBOARD_VIEW_HIERARCHY (for hierarchy view)
    const hasDashboardHierarchyPermission = await checkPermission(
      "DASHBOARD_VIEW_HIERARCHY",
    );

    console.log("🔑 Dashboard Permission Check:", {
      hasDashboardHierarchyPermission,
      isAgent,
      userId,
      userEmail: user.email,
    });

    // Check if user is a student (students create tickets, not get assigned)
    const isStudent = userRole?.code === "STUDENT";

    if (isStudent) {
      // Students see only tickets they created (not assigned)
      query["metadata.studentEmail"] = user.email;
      console.log("✅ Student user - showing tickets created by:", user.email);
      console.log("Query filter:", JSON.stringify(query, null, 2));
    } else if (effectiveViewMode === "self") {
      // Self mode: show only own assigned tickets, regardless of permissions
      query.assignedTo = new mongoose.Types.ObjectId(userId);
      console.log("✅ viewMode=self - showing only own assigned tickets");
    } else if (
      effectiveViewMode === "hierarchy" &&
      hasDashboardHierarchyPermission
    ) {
      // Hierarchy mode: show own tickets + reportee tickets (only if user has permission)
      console.log(
        "✅ viewMode=hierarchy with DASHBOARD_VIEW_HIERARCHY - fetching self + reportee tickets",
      );

      try {
        const {
          UserReportingHierarchy,
        } = require("../models/UserReportingHierarchy");
        const allReportees =
          await UserReportingHierarchy.getAllReporteesRecursive(userId);
        const reporteeIds = allReportees.map(
          (r: any) => new mongoose.Types.ObjectId(r._id),
        );

        console.log("📊 Found reportees:", reporteeIds.length);
        console.log(
          "📊 Reportee IDs:",
          reporteeIds.map((id: any) => id.toString()),
        );

        // Include self + all reportees (hierarchy = self + below)
        const allUserIds = [
          new mongoose.Types.ObjectId(userId),
          ...reporteeIds,
        ];
        query.assignedTo = { $in: allUserIds };
        console.log(
          "✅ Dashboard showing tickets assigned to self + reportees (total:",
          allUserIds.length,
          "users)",
        );
      } catch (error) {
        console.error("❌ Error fetching reportees:", error);
        // Fallback to own tickets on error
        query.assignedTo = new mongoose.Types.ObjectId(userId);
        console.log("⚠️ Error fetching reportees - fallback to own tickets");
      }
    } else {
      // Other modes or no hierarchy permission - show only own assigned tickets
      query.assignedTo = new mongoose.Types.ObjectId(userId);
      console.log(
        "✅ Dashboard showing only own assigned tickets (viewMode:",
        effectiveViewMode,
        ")",
      );
      console.log("Query filter:", JSON.stringify(query, null, 2));
    }

    // Get SLARule model for SLA calculations (SLA Rules contain priority settings)
    let priorities: any[] = [];
    let priorityMap = new Map();
    let priorityIdMap = new Map();

    try {
      const SLARule = require("../models/sla-module/SLARule").default;

      // Get all SLA Rules for this project to calculate SLA deadlines
      console.log("🔍 Searching for SLA Rules with projectId:", projectId);

      const slaRules = await SLARule.find({
        projectIds: { $in: [projectId] },
        isActive: true,
      });

      console.log("📋 Found SLA Rules for project:", slaRules.length);
      console.log(
        "📋 Available SLA Rules:",
        slaRules.map(
          (s: any) =>
            `${s.name} (${s.priority}) [ID: ${s._id}] - Resolution: ${s.resolutionTime?.value} ${s.resolutionTime?.unit}`,
        ),
      );

      // Map SLA Rules by priority name
      priorities = slaRules;
      priorityMap = new Map(
        slaRules.map((s: any) => [
          s.priority
            ? s.priority.toUpperCase().trim()
            : s.name.toUpperCase().trim(),
          {
            name: s.priority || s.name,
            resolutionTime: s.resolutionTime,
            _id: s._id,
          },
        ]),
      );
      priorityIdMap = new Map(
        slaRules.map((s: any) => [
          s._id.toString(),
          {
            name: s.priority || s.name,
            resolutionTime: s.resolutionTime,
            _id: s._id,
          },
        ]),
      );
    } catch (error) {
      console.error("❌ Error loading SLA Rules:", error);
      console.log("⚠️ Continuing without SLA Rules - will use defaults");
    }

    // Get ObjectIds and name strings for each priority level for matching
    // If SLA rule has dashboardCategory set, use that (explicit admin mapping).
    // Otherwise fall back to keyword-matching on priority/name field (backward compat).
    const hasDashboardMapping = priorities.some(
      (s: any) => s.dashboardCategory,
    );

    const highPriorityIds = priorities
      .filter((s: any) => {
        if (s.dashboardCategory) return s.dashboardCategory === "high";
        if (hasDashboardMapping) return false; // don't mix if some rules have mapping
        const prio = (s.priority || s.name || "").toUpperCase();
        return ["HIGH", "CRITICAL", "URGENT"].includes(prio);
      })
      .map((s: any) => s._id);

    const mediumPriorityIds = priorities
      .filter((s: any) => {
        if (s.dashboardCategory) return s.dashboardCategory === "medium";
        if (hasDashboardMapping) return false;
        const prio = (s.priority || s.name || "").toUpperCase();
        return ["MEDIUM", "NORMAL"].includes(prio);
      })
      .map((s: any) => s._id);

    const lowPriorityIds = priorities
      .filter((s: any) => {
        if (s.dashboardCategory) return s.dashboardCategory === "low";
        if (hasDashboardMapping) return false;
        const prio = (s.priority || s.name || "").toUpperCase();
        return prio === "LOW";
      })
      .map((s: any) => s._id);

    // Build name arrays for string-based ticket priority matching
    // Tickets store priority as a string (e.g. "NORMAL", "URGENT") not as an ObjectId
    const getNames = (cat: string) =>
      priorities
        .filter((s: any) =>
          hasDashboardMapping
            ? s.dashboardCategory === cat
            : cat === "high"
              ? ["HIGH", "CRITICAL", "URGENT"].includes(
                  (s.priority || s.name || "").toUpperCase(),
                )
              : cat === "medium"
                ? ["MEDIUM", "NORMAL"].includes(
                    (s.priority || s.name || "").toUpperCase(),
                  )
                : (s.priority || s.name || "").toUpperCase() === "LOW",
        )
        .map((s: any) => s.name);

    const highPriorityNames: string[] = getNames("high");
    const mediumPriorityNames: string[] = getNames("medium");
    const lowPriorityNames: string[] = getNames("low");

    // Build priority display labels: collect SLA rule names per dashboardCategory
    const priorityLabels: {
      high: string | null;
      medium: string | null;
      low: string | null;
    } = {
      high: null,
      medium: null,
      low: null,
    };
    priorities.forEach((s: any) => {
      if (s.dashboardCategory === "high") {
        priorityLabels.high = priorityLabels.high
          ? `${priorityLabels.high} / ${s.name}`
          : s.name;
      } else if (s.dashboardCategory === "medium") {
        priorityLabels.medium = priorityLabels.medium
          ? `${priorityLabels.medium} / ${s.name}`
          : s.name;
      } else if (s.dashboardCategory === "low") {
        priorityLabels.low = priorityLabels.low
          ? `${priorityLabels.low} / ${s.name}`
          : s.name;
      }
    });

    console.log("🎯 Priority name mappings:", {
      high: highPriorityNames,
      medium: mediumPriorityNames,
      low: lowPriorityNames,
    });

    console.log("🎯 Priority ObjectIds:", {
      high: highPriorityIds.map((id: any) => id.toString()),
      medium: mediumPriorityIds.map((id: any) => id.toString()),
      low: lowPriorityIds.map((id: any) => id.toString()),
    });

    // Debug: Get actual tickets to see priority values
    const sampleTickets = await Ticket.find(query)
      .limit(5)
      .select("ticketNumber priority slaRuleId")
      .lean();
    console.log(
      "🔍 Sample tickets with priority values:",
      sampleTickets.map((t) => ({
        ticketNumber: t.ticketNumber,
        priority: t.priority,
        slaRuleId: (t as any).slaRuleId?.toString() || "none",
      })),
    );

    // Helper to build a priority $match condition:
    //   • Primary:  slaRuleId is in the known ObjectIds  → rename-resilient
    //   • Fallback: tickets created before slaRuleId was added → match by name string
    const buildPriorityMatch = (
      ids: any[],
      names: string[],
      fallbackRegex: RegExp,
    ) => ({
      $or: [
        // ✅ Primary: ObjectId match (works even if SLA rule is later renamed)
        ...(ids.length > 0 ? [{ slaRuleId: { $in: ids } }] : []),
        // ⬇ Fallback for legacy tickets that pre-date the slaRuleId field
        {
          slaRuleId: { $exists: false },
          priority:
            names.length > 0
              ? {
                  $in: names.flatMap((n) => [
                    n,
                    n.toUpperCase(),
                    n.toLowerCase(),
                  ]),
                }
              : { $regex: fallbackRegex },
        },
        // Also catch tickets where slaRuleId is explicitly null
        {
          slaRuleId: null,
          priority:
            names.length > 0
              ? {
                  $in: names.flatMap((n) => [
                    n,
                    n.toUpperCase(),
                    n.toLowerCase(),
                  ]),
                }
              : { $regex: fallbackRegex },
        },
      ],
    });

    // Optimized: Use single aggregate query with SLA calculation
    const stats = await Ticket.aggregate([
      { $match: query },
      {
        $facet: {
          total: [{ $count: "count" }],
          // Priority counts - primary match by slaRuleId (ObjectId), fallback to name string for old tickets
          highPriority: [
            {
              $match: buildPriorityMatch(
                highPriorityIds,
                highPriorityNames,
                /^(high|critical|urgent)$/i,
              ),
            },
            { $count: "count" },
          ],
          mediumPriority: [
            {
              $match: buildPriorityMatch(
                mediumPriorityIds,
                mediumPriorityNames,
                /^(medium|normal)$/i,
              ),
            },
            { $count: "count" },
          ],
          lowPriority: [
            {
              $match: buildPriorityMatch(
                lowPriorityIds,
                lowPriorityNames,
                /^low$/i,
              ),
            },
            { $count: "count" },
          ],
          resolved: [{ $match: { status: 4 } }, { $count: "count" }], // 4=Resolved
          openOrPending: [
            { $match: { status: { $in: [1, 2, 3] } } }, // 1=Open, 2=In Progress, 3=On Hold
            { $count: "count" },
          ],
          // Get all tickets for SLA calculation
          allTickets: [
            {
              $project: {
                _id: 1,
                ticketNumber: 1,
                priority: 1,
                status: 1,
                createdAt: 1,
                updatedAt: 1,
                resolvedAt: 1,
                closedAt: 1,
                changeHistory: 1,
              },
            },
          ],
        },
      },
    ]);

    const result = stats[0];
    const totalTickets = result.total[0]?.count || 0;
    const highPriority = result.highPriority[0]?.count || 0;
    const mediumPriority = result.mediumPriority[0]?.count || 0;
    const lowPriority = result.lowPriority[0]?.count || 0;
    const resolvedTickets = result.resolved[0]?.count || 0;
    const openOrInProgressTickets = result.openOrPending[0]?.count || 0;

    // Debug: Log actual priority values from tickets
    const allTickets = result.allTickets || [];
    const uniquePriorities = [
      ...new Set(allTickets.map((t: any) => t.priority)),
    ];
    console.log(
      "🔍 Unique priority values in DB:",
      uniquePriorities.map((p: any) => `"${p}" (type: ${typeof p})`),
    );

    console.log("📊 Dashboard Stats Results:", {
      totalTickets,
      highPriority,
      mediumPriority,
      lowPriority,
      resolved: resolvedTickets,
      openOrPending: openOrInProgressTickets,
      query,
    });

    // Calculate SLA compliance for each ticket
    let withinSLA = 0;
    let outsideSLA = 0;
    let pendingWithinSLA = 0;
    let pendingOutsideSLA = 0;

    // Fetch project's status config so we can identify closed/pending statuses
    // by isClosed flag rather than hardcoded codes.
    let projClosedCodes: Set<number> = new Set([4, 5]); // fallback
    try {
      const StatusModel = require("../models/Status").Status;
      const projStatuses: any[] = await StatusModel.find({
        projectId: projectId,
      }).select("code isClosed");
      if (projStatuses.length > 0) {
        const closedCodes = projStatuses
          .filter((s) => s.isClosed === true)
          .map((s) => s.code);
        projClosedCodes = new Set(
          closedCodes.length > 0 ? closedCodes : [4, 5],
        );
      }
    } catch (statusErr) {
      console.warn(
        "⚠️ [PROJECT DASHBOARD] Could not load status config, using defaults:",
        statusErr,
      );
    }

    const now = new Date();

    console.log("🕐 Starting SLA calculation at:", now.toISOString());

    for (const ticket of allTickets) {
      // Get priority settings for this ticket
      // Priority could be: ObjectId, string code (HIGH, MEDIUM, LOW), numeric (1,2,3,4), or order number
      let prioritySettings = null;

      // Try matching by ObjectId first
      if (
        ticket.priority &&
        typeof ticket.priority === "object" &&
        ticket.priority._id
      ) {
        const priorityId = ticket.priority._id.toString();
        prioritySettings = priorityIdMap.get(priorityId);
      } else if (
        ticket.priority &&
        mongoose.Types.ObjectId.isValid(ticket.priority.toString())
      ) {
        // Priority is an ObjectId
        const priorityId = ticket.priority.toString();
        prioritySettings = priorityIdMap.get(priorityId);
      } else if (typeof ticket.priority === "string") {
        // Priority is a string code
        const priorityCode = ticket.priority.toUpperCase();
        prioritySettings = priorityMap.get(priorityCode);
      } else if (typeof ticket.priority === "number") {
        // Map numeric priority to string code
        const priorityNumMap: Record<number, string> = {
          1: "LOW",
          2: "MEDIUM",
          3: "HIGH",
          4: "CRITICAL",
        };
        const priorityCode = priorityNumMap[ticket.priority] || "MEDIUM";
        prioritySettings = priorityMap.get(priorityCode);
      }

      if (!prioritySettings) {
        // Try to find by order if all else failed
        prioritySettings = priorities.find(
          (p: any) => p.order === ticket.priority,
        );
        if (!prioritySettings) {
          console.log(
            `⚠️ No priority settings found for ticket ${ticket._id}, priority: ${JSON.stringify(ticket.priority)} (type: ${typeof ticket.priority}) - Using default SLA times`,
          );
          // Use default SLA times when no Priority document exists
          const priorityStr =
            typeof ticket.priority === "string"
              ? ticket.priority.toUpperCase()
              : "MEDIUM";
          const defaultSLATimes: Record<
            string,
            { value: number; unit: string }
          > = {
            CRITICAL: { value: 4, unit: "hours" },
            HIGH: { value: 24, unit: "hours" },
            MEDIUM: { value: 72, unit: "hours" },
            LOW: { value: 168, unit: "hours" }, // 7 days
          };
          prioritySettings = {
            name: priorityStr,
            resolutionTime:
              defaultSLATimes[priorityStr] || defaultSLATimes["MEDIUM"],
          };
        }
      }

      // Convert resolution time to milliseconds
      let resolutionTimeMs = 0;
      const resTime = prioritySettings.resolutionTime;
      if (!resTime || !resTime.value || !resTime.unit) {
        console.log(
          `⚠️ Invalid resolution time settings for priority ${prioritySettings.name} - Skipping ticket ${ticket._id}`,
        );
        continue;
      }

      if (resTime.unit === "minutes") {
        resolutionTimeMs = resTime.value * 60 * 1000;
      } else if (resTime.unit === "hours") {
        resolutionTimeMs = resTime.value * 60 * 60 * 1000;
      } else if (resTime.unit === "days") {
        resolutionTimeMs = resTime.value * 24 * 60 * 60 * 1000;
      }

      // Calculate SLA deadline (from ticket creation time)
      const createdAt = new Date(ticket.createdAt);
      const slaDeadline = new Date(createdAt.getTime() + resolutionTimeMs);

      // SLA Calculation Logic:
      // Closed = any status with isClosed=true in the project's Status config
      // Pending = any status not in the closed set
      const isClosed = projClosedCodes.has(ticket.status);
      const isResolved = isClosed; // treat all closing statuses as resolved for SLA purposes
      const isPending = !isClosed;

      if (isResolved || isClosed) {
        // Determine completion time - try multiple sources:
        // 1. Use resolvedAt/closedAt if available (new tickets)
        // 2. Look in changeHistory for status change (existing tickets)
        // 3. Fall back to updatedAt (least accurate but better than nothing)
        let completionTime: Date | null = null;

        if (isResolved && ticket.resolvedAt) {
          completionTime = new Date(ticket.resolvedAt);
        } else if (isClosed && ticket.closedAt) {
          completionTime = new Date(ticket.closedAt);
        } else if (ticket.changeHistory && ticket.changeHistory.length > 0) {
          // Find the status change to Resolved (4) or Closed (5) in changeHistory
          const statusChange = ticket.changeHistory.find(
            (change: any) =>
              change.field === "Status" &&
              (change.newValue === "4" || change.newValue === "5"),
          );
          if (statusChange && statusChange.changedAt) {
            completionTime = new Date(statusChange.changedAt);
          }
        }

        // If still no completion time, fall back to updatedAt
        if (!completionTime) {
          completionTime = new Date(ticket.updatedAt || ticket.createdAt);
        }

        const wasCompletedWithinSLA = completionTime <= slaDeadline;

        if (wasCompletedWithinSLA) {
          withinSLA++;
          const timeTaken = completionTime.getTime() - createdAt.getTime();
          const hoursTaken = Math.floor(timeTaken / (1000 * 60 * 60));
          const minutesTaken = Math.floor(
            (timeTaken % (1000 * 60 * 60)) / (1000 * 60),
          );
          console.log(
            `✅ Ticket ${ticket.ticketNumber || ticket._id}: ${isResolved ? "RESOLVED" : "CLOSED"} within SLA - Took ${hoursTaken}h ${minutesTaken}m (Deadline: ${slaDeadline.toISOString()})`,
          );
        } else {
          outsideSLA++;
          const overdueTime = completionTime.getTime() - slaDeadline.getTime();
          const hoursOverdue = Math.floor(overdueTime / (1000 * 60 * 60));
          const minutesOverdue = Math.floor(
            (overdueTime % (1000 * 60 * 60)) / (1000 * 60),
          );
          console.log(
            `❌ Ticket ${ticket.ticketNumber || ticket._id}: ${isResolved ? "RESOLVED" : "CLOSED"} AFTER SLA - ${hoursOverdue}h ${minutesOverdue}m late (Deadline: ${slaDeadline.toISOString()}, Completed: ${completionTime.toISOString()})`,
          );
        }
      } else if (isPending) {
        // For open/pending tickets, check if current time has crossed SLA deadline
        const isPendingWithinSLA = now <= slaDeadline;

        if (isPendingWithinSLA) {
          pendingWithinSLA++;
          const remainingTime = slaDeadline.getTime() - now.getTime();
          const hoursRemaining = Math.floor(remainingTime / (1000 * 60 * 60));
          const minutesRemaining = Math.floor(
            (remainingTime % (1000 * 60 * 60)) / (1000 * 60),
          );
          console.log(
            `⏳ Ticket ${ticket.ticketNumber || ticket._id}: PENDING within SLA - ${hoursRemaining}h ${minutesRemaining}m remaining (Deadline: ${slaDeadline.toISOString()})`,
          );
        } else {
          pendingOutsideSLA++;
          const overdueTime = now.getTime() - slaDeadline.getTime();
          const hoursOverdue = Math.floor(overdueTime / (1000 * 60 * 60));
          const minutesOverdue = Math.floor(
            (overdueTime % (1000 * 60 * 60)) / (1000 * 60),
          );
          console.log(
            `🔥 Ticket ${ticket.ticketNumber || ticket._id}: PENDING OUTSIDE SLA - ${hoursOverdue}h ${minutesOverdue}m overdue (Deadline: ${slaDeadline.toISOString()})`,
          );
        }
      }
    }

    console.log("📊 SLA Calculation:", {
      totalTicketsChecked: allTickets.length,
      closedWithinSLA: withinSLA,
      closedOutsideSLA: outsideSLA,
      pendingWithinSLA,
      pendingOutsideSLA,
    });

    return res.status(200).json({
      success: true,
      data: {
        totalTickets,
        highPriority,
        mediumPriority,
        lowPriority,
        withinSLA,
        outsideSLA,
        pendingWithinSLA,
        pendingOutsideSLA,
        priorityLabels,
      },
    });
  } catch (error) {
    console.error("Project dashboard stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project dashboard statistics",
    });
  }
};

/**
 * Create offline ticket submission (by agent on behalf of student)
 */
export const createOfflineTicket = async (req: Request, res: Response) => {
  try {
    const agent = (req as any).user;

    console.log("=== OFFLINE TICKET SUBMISSION ===");
    console.log("req.body keys:", Object.keys(req.body));
    console.log("req.body:", req.body);
    console.log("req.files:", req.files);

    const {
      studentId,
      Title, // Title field from form (mapped to subject)
      Subject, // Subject field from form
      subject, // Alternative field name
      description,
      Description, // Alternative field name for description
      category,
      Category, // Alternative field name for category
      categoryHierarchy, // Hierarchical category data (JSON string with level1, level2, level3, level4)
      priority,
      projectId,
      centerId, // Center ID for offline ticket
      submissionType,
      status: initialStatus,
      resolvedAtCreation,
      escalateTo,
      escalationReason,
    } = req.body;

    console.log("Extracted values:");
    console.log("  studentId:", studentId);
    console.log("  Subject:", Subject);
    console.log("  Title:", Title);
    console.log("  Description:", Description);
    console.log("  description:", description);
    console.log("  category:", category);
    console.log("  Category:", Category);
    console.log("  categoryHierarchy:", categoryHierarchy);
    console.log("  projectId:", projectId);

    // Validate required fields (handle both capitalized and lowercase field names)
    const hasDescription = Description || description;
    // Category can come from either direct field OR from categoryHierarchy
    const hasCategoryData = Category || category || categoryHierarchy;

    if (!studentId || !hasDescription || !hasCategoryData || !projectId) {
      console.log("❌ Validation failed - missing fields");
      console.log("  studentId present:", !!studentId);
      console.log("  Subject present:", !!Subject);
      console.log("  Title present:", !!Title);
      console.log("  Description present:", !!Description);
      console.log("  description present:", !!description);
      console.log("  category present:", !!category);
      console.log("  Category present:", !!Category);
      console.log("  categoryHierarchy present:", !!categoryHierarchy);
      console.log("  projectId present:", !!projectId);
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Verify student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Verify the user has STUDENT role — offline portal is for students only
    const studentRole = await Role.findOne({ code: "STUDENT" });
    if (studentRole && student.role) {
      if (student.role.toString() !== studentRole._id.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "This user does not have the Student role. Only student accounts can raise tickets through the offline portal.",
        });
      }
    }

    // Get the agent's full details including centers
    const agentDetails = await User.findById(agent.userId).select(
      "centers firstName lastName email",
    );
    if (!agentDetails) {
      return res.status(404).json({
        success: false,
        message: "Agent not found",
      });
    }

    // Determine ticket center — priority: explicit centerId from request (user-selected center)
    // then fall back to agent's first assigned center, then null (no center).
    let ticketCenterId: any = null;

    if (centerId) {
      // Use the centerId explicitly provided by the frontend (agent selected their operating center)
      ticketCenterId = centerId;
      console.log(`📍 Using centerId from request: ${ticketCenterId}`);
    } else if (agentDetails.centers && agentDetails.centers.length > 0) {
      // Fallback: use agent's first assigned center when no centerId in request
      ticketCenterId = agentDetails.centers[0];
      console.log(
        `📍 No centerId in request, using agent's first center: ${ticketCenterId}`,
      );
    } else {
      // No center available - ticket will have no center assignment
      ticketCenterId = null;
      console.log(`📍 No center available - ticket will be marked as online`);
    }

    console.log(
      `📍 Agent Center Mapping: Agent ${agent.email} has ${agentDetails.centers?.length || 0} center(s)`,
    );
    console.log(`📍 Final Center ID for ticket: ${ticketCenterId}`);

    // Get project and offline ticket numbering configuration
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validate custom field-level rules (minLength, maxLength, regex) for offline submissions
    const offlineFormFields: any[] =
      project.configuration?.ticketSubmissionSettings?.onlineFormFields || [];
    for (const field of offlineFormFields) {
      const v = field.validation;
      if (!v) continue;
      const rawVal = req.body[field.fieldName];
      const value = rawVal == null ? "" : String(rawVal);
      if (!value) continue; // required check already done above
      const label = field.displayLabel || field.fieldName;
      if (v.minLength != null && value.length < Number(v.minLength)) {
        return res.status(400).json({
          success: false,
          message: `${label} must be at least ${v.minLength} characters`,
        });
      }
      if (v.maxLength != null && value.length > Number(v.maxLength)) {
        return res.status(400).json({
          success: false,
          message: `${label} must be at most ${v.maxLength} characters`,
        });
      }
      if (v.regex) {
        try {
          const re = new RegExp(v.regex);
          if (!re.test(value)) {
            return res.status(400).json({
              success: false,
              message: `${label} is not in the correct format`,
            });
          }
        } catch {
          // invalid regex — skip
        }
      }
    }

    // Generate ticket number using offline configuration
    const offlineConfig =
      project.configuration?.offlineModuleSettings?.offlineTicketNumbering;
    console.log(
      "🔧 Offline Ticket Number Config:",
      JSON.stringify(offlineConfig, null, 2),
    );

    const prefix = offlineConfig?.prefix || "OFF";
    const separator = offlineConfig?.separator || "-";
    const includeYear = offlineConfig?.includeYear !== false; // Default true
    const includeMonth = offlineConfig?.includeMonth || false;
    const resetFrequency = offlineConfig?.resetFrequency || "yearly";
    const startingNumber = offlineConfig?.startingNumber || 1;

    const today = new Date();
    let ticketNumber = prefix;

    // Build search pattern for finding the latest ticket
    let searchPattern = `^${prefix.replace(/[-]/g, "\\-")}`;
    if (separator) {
      ticketNumber += separator;
      searchPattern += separator.replace(/[-]/g, "\\-");
    }

    // Add date parts based on configuration
    if (includeYear) {
      const year = today.getFullYear().toString();
      ticketNumber += year;
      searchPattern += year;
    }

    if (includeMonth) {
      const month = String(today.getMonth() + 1).padStart(2, "0");
      if (separator && includeYear) ticketNumber += separator;
      ticketNumber += month;
      if (includeYear) searchPattern += separator.replace(/[-]/g, "\\-");
      searchPattern += month;
    }

    // Add separator before number
    if (separator) {
      ticketNumber += separator;
      searchPattern += separator.replace(/[-]/g, "\\-");
    }

    // Find the highest ticket number for the current period
    const latestTicket = await Ticket.findOne({
      submissionSource: "offline",
      ticketNumber: new RegExp(searchPattern),
    }).sort({ ticketNumber: -1 });

    let nextNumber = startingNumber;
    if (latestTicket && latestTicket.ticketNumber) {
      // Extract the sequence number from the last ticket
      const lastNumber = parseInt(
        latestTicket.ticketNumber.split(separator).pop() || "0",
      );
      nextNumber = lastNumber + 1;
    }

    // Add the sequence number
    ticketNumber += String(nextNumber).padStart(4, "0");

    console.log(`🎫 Generated offline ticket number: ${ticketNumber}`);

    // Handle file attachments — upload to GCS (or local fallback)
    const attachments: any[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        const uploaded = await GCSService.uploadTicketFile(
          file,
          "ticket-attachments",
        );
        attachments.push({
          fieldName: "offline-attachment",
          filename: uploaded.filename,
          originalName: file.originalname,
          path: uploaded.path,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
        });
      }
    }

    // Determine initial status (convert string to numeric if needed)
    let ticketStatus: number;
    if (resolvedAtCreation === "true") {
      ticketStatus = 4; // 4=Resolved
    } else if (initialStatus) {
      // If initialStatus is provided, convert to number
      ticketStatus = typeof initialStatus === "number" ? initialStatus : 1;
    } else {
      ticketStatus = 1; // 1=Open
    }

    // Determine assignment: If escalated, assign to escalateTo; otherwise assign to creating agent
    const assignedToAgentId = escalateTo || agent.userId;

    // Extract subject and description (handle both capitalized and lowercase field names)
    // Support Title, Subject, or subject field names from form
    const ticketSubject =
      Subject ||
      Title ||
      subject ||
      description?.substring(0, 100) ||
      "No subject provided";
    const ticketDescription =
      Description || description || "No description provided";

    // Parse categoryHierarchy and determine final category ID
    // With hierarchical categories, the deepest selected level is used as the ticket's category
    console.time("⏱️ Category & Priority lookup (offline)");
    let ticketPriority = "medium"; // Default fallback
    let finalCategoryId: string | null = null;
    let parsedHierarchy: {
      level1?: string;
      level2?: string;
      level3?: string;
      level4?: string;
      level5?: string;
      displayPath?: string;
    } = {};

    try {
      // Use mongoose.models to ensure the model is available
      const CategoryModel = mongoose.models.Category || Category;

      // Parse categoryHierarchy if provided (JSON string from frontend)
      if (categoryHierarchy) {
        try {
          parsedHierarchy =
            typeof categoryHierarchy === "string"
              ? JSON.parse(categoryHierarchy)
              : categoryHierarchy;
          console.log("📋 Parsed categoryHierarchy:", parsedHierarchy);
        } catch (parseError) {
          console.error("Error parsing categoryHierarchy:", parseError);
        }
      }

      // Determine final category ID: use deepest level from hierarchy OR fallback to category field
      finalCategoryId =
        parsedHierarchy.level5 ||
        parsedHierarchy.level4 ||
        parsedHierarchy.level3 ||
        parsedHierarchy.level2 ||
        parsedHierarchy.level1 ||
        category ||
        Category;

      if (!finalCategoryId) {
        console.log("⚠️ No category ID found from hierarchy or direct field");
      } else {
        console.log(`📌 Final category ID: ${finalCategoryId}`);
      }

      // Look up priority from hierarchy levels (deepest with priority wins)
      // Also collect category names to build displayPath
      // Check levels in order: level1 -> level2 -> level3 -> level4 for names, but deepest priority wins
      const hierarchyLevelsForPriority = [
        parsedHierarchy.level5,
        parsedHierarchy.level4,
        parsedHierarchy.level3,
        parsedHierarchy.level2,
        parsedHierarchy.level1,
      ].filter(Boolean);

      const hierarchyLevelsForNames = [
        parsedHierarchy.level1,
        parsedHierarchy.level2,
        parsedHierarchy.level3,
        parsedHierarchy.level4,
        parsedHierarchy.level5,
      ].filter(Boolean);

      console.log(
        `🔍 Checking ${hierarchyLevelsForPriority.length} hierarchy levels for priority`,
      );

      let priorityFound = false;
      const categoryNames: string[] = [];

      // First, collect all category names in order (level1 -> level4)
      for (const levelId of hierarchyLevelsForNames) {
        if (!levelId || !mongoose.Types.ObjectId.isValid(levelId)) continue;

        const levelCategory = await CategoryModel.findOne({
          _id: levelId,
          projectId: new mongoose.Types.ObjectId(projectId),
          isActive: true,
        });

        if (levelCategory) {
          categoryNames.push(levelCategory.name);
        }
      }

      // Build displayPath from category names
      if (categoryNames.length > 0) {
        parsedHierarchy.displayPath = categoryNames.join(" > ");
        console.log(`📝 Built displayPath: ${parsedHierarchy.displayPath}`);
      }

      // Now check for priority (deepest with priority wins)
      for (const levelId of hierarchyLevelsForPriority) {
        if (!levelId || !mongoose.Types.ObjectId.isValid(levelId)) continue;

        const levelCategory = await CategoryModel.findOne({
          _id: levelId,
          projectId: new mongoose.Types.ObjectId(projectId),
          isActive: true,
        });

        if (levelCategory) {
          console.log(
            `  Level ${levelId}: ${levelCategory.name}, defaultPriority: ${levelCategory.defaultPriority || "not set"}`,
          );

          if (levelCategory.defaultPriority && !priorityFound) {
            ticketPriority = levelCategory.defaultPriority.toLowerCase();
            priorityFound = true;
            console.log(
              `  ✅ Found priority '${ticketPriority}' from level: ${levelCategory.name}`,
            );
          }
        }
      }

      // Fallback: If no priority found in hierarchy, try the direct category field
      if (
        !priorityFound &&
        finalCategoryId &&
        mongoose.Types.ObjectId.isValid(finalCategoryId)
      ) {
        const directCategory = await CategoryModel.findOne({
          _id: finalCategoryId,
          projectId: new mongoose.Types.ObjectId(projectId),
          isActive: true,
        });

        if (directCategory && directCategory.defaultPriority) {
          ticketPriority = directCategory.defaultPriority.toLowerCase();
          console.log(
            `✅ Using priority from direct category: ${ticketPriority} (${directCategory.name})`,
          );
        }
      }

      if (!priorityFound) {
        console.log(
          `⚠️ No priority found in hierarchy, using fallback: ${ticketPriority}`,
        );
      }
    } catch (error) {
      console.error(
        "Error fetching category/priority for offline ticket:",
        error,
      );
    }
    console.timeEnd("⏱️ Category & Priority lookup (offline)");

    // Resolve slaRuleId for name-change-resilient dashboard priority matching (offline)
    let slaRuleIdForOfflineTicket: mongoose.Types.ObjectId | undefined;
    try {
      const SLARuleModel = require("../models/sla-module/SLARule").default;
      const matchedSlaRule = await SLARuleModel.findOne({
        projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
        name: {
          $regex: new RegExp(
            `^${ticketPriority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
        isActive: true,
      })
        .select("_id")
        .lean();
      if (matchedSlaRule) slaRuleIdForOfflineTicket = matchedSlaRule._id;
    } catch (_e) {
      /* non-critical */
    }

    // Create ticket (priority is now dynamic based on hierarchy level defaultPriority)
    const ticket = await Ticket.create({
      ticketNumber,
      subject: ticketSubject,
      description: ticketDescription,
      category: finalCategoryId,
      categoryHierarchy:
        Object.keys(parsedHierarchy).length > 0 ? parsedHierarchy : undefined, // Store hierarchy at root level for display
      priority: ticketPriority, // Now dynamic based on category defaultPriority
      slaRuleId: slaRuleIdForOfflineTicket, // ObjectId ref to SLA rule (rename-resilient)
      status: ticketStatus,
      createdBy: new mongoose.Types.ObjectId(studentId), // Ticket owned by student
      assignedTo: new mongoose.Types.ObjectId(assignedToAgentId), // Assign to escalated agent or creating agent
      submissionSource: "offline", // Mark as offline submission
      attachments,
      tags: [`agent-submission`, `project-${projectId}`, "offline"], // Add 'offline' tag for offline submissions
      metadata: {
        projectId,
        centerId: ticketCenterId, // Associate ticket with agent's center
        submissionType: submissionType || "offline",
        studentEmail: student.email,
        studentName: `${student.firstName} ${student.lastName}`,
        studentPhone: (student as any).phone,
        createdByAgent: agent.userId,
        createdByAgentEmail: agent.email,
        resolvedAtCreation: resolvedAtCreation === "true",
        categoryHierarchy: parsedHierarchy, // Store full hierarchy for reference
      },
      threads: [],
      escalationHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add system message about offline creation
    ticket.threads!.push({
      message: `Query created by ${agent.firstName} ${agent.lastName} (Agent) on behalf of student during offline support.`,
      createdBy: new mongoose.Types.ObjectId(agent.userId),
      isSystemMessage: true,
      attachments: [],
      createdAt: new Date(),
    } as any);

    // Add assignment message
    if (!escalateTo) {
      // Query assigned to creating agent
      ticket.threads!.push({
        message: `Query assigned to ${agent.firstName} ${agent.lastName} (Counselor).`,
        createdBy: new mongoose.Types.ObjectId(agent.userId),
        isSystemMessage: true,
        attachments: [],
        createdAt: new Date(),
      } as any);
    }

    // If marked as resolved, add resolution message
    if (resolvedAtCreation === "true") {
      ticket.threads!.push({
        message: `Issue resolved during offline support session by ${agent.firstName} ${agent.lastName}.`,
        createdBy: new mongoose.Types.ObjectId(agent.userId),
        isSystemMessage: true,
        attachments: [],
        createdAt: new Date(),
      } as any);
    }

    // If escalated, add escalation record
    if (escalateTo && escalationReason) {
      ticket.escalationHistory!.push({
        escalatedTo: new mongoose.Types.ObjectId(escalateTo),
        escalatedBy: new mongoose.Types.ObjectId(agent.userId),
        reason: escalationReason,
        escalatedAt: new Date(),
      } as any);

      ticket.threads!.push({
        message: `Ticket escalated to another agent. Reason: ${escalationReason}`,
        createdBy: new mongoose.Types.ObjectId(agent.userId),
        isSystemMessage: true,
        attachments: [],
        createdAt: new Date(),
      } as any);
    }

    await ticket.save();

    console.log(
      `✅ Offline ticket created: ${ticket._id} | ${ticketNumber} | Agent: ${agent.email} | Student: ${student.email}`,
    );

    // Initialize priority-level SLA tracking (non-blocking) - sets embedded ticketLevelSLA and roleLevelSLA
    (async () => {
      try {
        // Get working calendar for the project
        const calendar = await slaService.getDefaultWorkingCalendar(projectId);

        // Get priority details - first try Priority model, fallback to SLARule
        let priority = await Priority.findOne({
          code: ticketPriority.toUpperCase(),
          projectId: projectId,
        });

        // Fallback: If no Priority record exists, try to get resolution time from SLARule
        if (!priority) {
          const SLARule = (await import("../models/sla-module/SLARule"))
            .default;
          const slaRule = await SLARule.findOne({
            projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
            priority: ticketPriority.toUpperCase(),
            isActive: true,
          });

          if (slaRule) {
            // Create a virtual priority object from SLA rule
            priority = {
              code: ticketPriority.toUpperCase(),
              resolutionTime: slaRule.resolutionTime,
              responseTime: slaRule.responseTime || { value: 1, unit: "hours" },
            } as any;
            console.log(
              `📋 Using SLARule for priority ${ticketPriority}: ${JSON.stringify(slaRule.resolutionTime)}`,
            );
          }
        }

        if (priority && calendar) {
          // Calculate ticket-level SLA
          const ticketSLADueDate = await slaService.calculateTicketLevelSLA(
            ticket.createdAt,
            priority.code,
            project._id as mongoose.Types.ObjectId,
            calendar._id as mongoose.Types.ObjectId,
          );

          if (ticketSLADueDate) {
            // Use atomic updateOne to avoid overwriting escalationMatrixId/roleLevelSLA
            // set by the concurrent autoAssignMatrixToTicket call (race condition fix).
            await Ticket.updateOne(
              { _id: ticket._id },
              {
                $set: {
                  ticketLevelSLA: {
                    dueAt: ticketSLADueDate,
                    pausedDuration: 0,
                  },
                  workingCalendarId: calendar._id,
                },
              },
            );
            console.log(
              `✅ Priority-level SLA tracking initialized for offline ticket ${ticket.ticketNumber}`,
            );
          }
        }
      } catch (error) {
        console.error(
          "❌ Failed to initialize priority-level SLA tracking for offline ticket:",
          error,
        );
      }
    })();

    // Initialize SLA tracking for the new ticket (non-blocking) - legacy SLATracking model
    (async () => {
      try {
        await initializeSLATracking(
          ticket._id,
          new mongoose.Types.ObjectId(projectId),
          ticketPriority,
          ticket.createdAt,
          ticket.categoryHierarchy?.level1, // US-017: category SLA override
        );
        console.log(
          `✅ SLA tracking initialized for offline ticket ${ticketNumber}`,
        );
      } catch (error) {
        console.error(
          "❌ Failed to initialize SLA tracking for offline ticket:",
          error,
        );
      }
    })();

    // Auto-assign escalation matrix based on project and priority (BLOCKING - needed for SLA timer)
    let escalationMatrixAssigned = false;
    try {
      const result = await autoAssignMatrixToTicket(
        ticket._id,
        projectId,
        ticketPriority,
        finalCategoryId ?? undefined, // US-021: use deepest category for matrix lookup
      );
      if (result.success) {
        console.log(
          `✅ Escalation matrix auto-assigned for offline ticket ${ticketNumber}`,
        );
        escalationMatrixAssigned = true;
        // Refresh ticket to get updated escalation matrix fields
        const updatedTicket = await Ticket.findById(ticket._id);
        if (updatedTicket) {
          // Copy escalation matrix fields to our ticket object for response
          (ticket as any).escalationMatrixId = updatedTicket.escalationMatrixId;
          (ticket as any).currentEscalationLevelId =
            updatedTicket.currentEscalationLevelId;
          (ticket as any).currentEscalationLevelNumber =
            updatedTicket.currentEscalationLevelNumber;
          (ticket as any).roleLevelSLA = updatedTicket.roleLevelSLA;
        }
      } else {
        console.log(
          `ℹ️ No escalation matrix for offline ticket ${ticketNumber}: ${result.message}`,
        );
      }
    } catch (error) {
      console.error(
        "❌ Failed to auto-assign escalation matrix for offline ticket:",
        error,
      );
    }

    // Log activity
    try {
      const projectData = await Project.findById(projectId);
      await logActivity({
        userId: agent.userId,
        userName: `${agent.firstName || ""} ${agent.lastName || ""}`.trim(),
        userEmail: agent.email,
        action: "create",
        entity: "ticket",
        entityId: ticket._id.toString(),
        entityName: ticket.subject,
        projectId: projectId,
        projectName: projectData?.name,
        description: `Offline ticket ${ticketNumber} created on behalf of ${student.firstName} ${student.lastName}`,
        req,
        metadata: {
          ticketNumber,
          source: "offline",
          studentId,
          resolvedAtCreation: resolvedAtCreation === "true",
        },
      });
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    // Send email notifications (async, don't wait)
    if (student.email) {
      (async () => {
        try {
          const project = await Project.findById(projectId);
          if (!project) {
            console.error("Project not found for email notifications");
            return;
          }

          const studentName =
            `${student.firstName || ""} ${student.lastName || ""}`.trim();
          const studentEmail = student.email;

          // Check if this is the student's first ticket (welcome email)
          const isFirstTicket =
            (await Ticket.countDocuments({
              createdBy: studentId,
            })) === 1;

          if (isFirstTicket) {
            // Generate login URL for project portal
            const loginUrl = (project as any).customUrlPath
              ? `${process.env.FRONTEND_URL || "http://localhost:3001"}/${(project as any).customUrlPath}/portal/login`
              : `${process.env.FRONTEND_URL || "http://localhost:3001"}/login`;

            console.log(
              "📧 Sending welcome email to new student:",
              studentEmail,
            );
            await sendStudentWelcomeEmail(
              studentEmail,
              studentName,
              (project as any).name || "SAC Helpdesk",
              loginUrl,
              projectId,
            );
          }

          // Send ticket creation confirmation
          console.log("📧 Sending ticket creation email:", ticketNumber);
          await sendTicketCreatedEmail(
            studentEmail,
            ticket.ticketNumber,
            ticket.subject || description.substring(0, 100),
            projectId,
            {
              studentName: studentName,
              status: getStatusName(ticket.status),
              priority: ticket.priority || "medium",
            },
          );

          console.log("✅ Email notifications sent successfully");
        } catch (emailError) {
          console.error("Failed to send email notifications:", emailError);
          // Don't fail the request if email fails
        }
      })();
    }

    return res.status(201).json({
      success: true,
      message: "Offline ticket created successfully",
      data: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        escalationMatrixId: (ticket as any).escalationMatrixId,
        currentEscalationLevelNumber: (ticket as any)
          .currentEscalationLevelNumber,
        roleLevelSLA: (ticket as any).roleLevelSLA,
      },
    });
  } catch (error: any) {
    console.error("Create offline ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create offline ticket",
      error: error.message,
    });
  }
};

/**
 * Get assignable agents for ticket assignment
 * Returns users based on hierarchy:
 * - The current user themselves (so they can self-assign)
 * - All reportees under the current user (from UserReportingHierarchy)
 * Falls back to project-based filtering if no hierarchy is configured
 */
export const getAssignableAgents = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { projectId, useHierarchy, departmentId, ticketId } = req.query; // useHierarchy defaults to true

    // ── RESOLVE TICKET CENTER FOR SCOPE FILTERING ────────────────────────────
    // If a ticketId is provided, derive the center that should be used to scope
    // the assignable-agent list. Offline tickets carry metadata.centerId which
    // restricts reassignment to agents in the same venue.
    let ticketCenterId: string | null = null;
    if (
      ticketId &&
      typeof ticketId === "string" &&
      mongoose.Types.ObjectId.isValid(ticketId)
    ) {
      const rawTicket = await Ticket.findById(ticketId)
        .select("metadata")
        .lean();
      const rawCenter = (rawTicket as any)?.metadata?.centerId;
      if (rawCenter && rawCenter !== "online") {
        ticketCenterId =
          typeof rawCenter === "object"
            ? (rawCenter._id?.toString() ?? String(rawCenter))
            : String(rawCenter);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── DEPARTMENT-BASED SHORT CIRCUIT ──────────────────────────────────────
    // If departmentId is provided, return all active users in that department
    // (bypasses hierarchy / project logic — department is already project-scoped)
    if (departmentId) {
      const deptQuery: any = {
        $or: [
          { departmentRef: departmentId },
          { "projectDepartments.departmentRef": departmentId },
        ],
        isActive: true,
      };

      // Scope to the ticket's center when the ticket belongs to a specific venue
      if (ticketCenterId) {
        deptQuery.centers = {
          $in: [new mongoose.Types.ObjectId(ticketCenterId)],
        };
      }

      // Match users whose departmentRef OR any projectDepartments entry matches
      const agents = await User.find(deptQuery)
        .populate("role", "name isAgent code")
        .select("_id firstName lastName email role")
        .sort({ firstName: 1, lastName: 1 });

      return res.status(200).json({
        success: true,
        data: agents,
        mode: "department",
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Get current user with their role (which contains projects)
    const currentUser = await User.findById(userId).populate("role");

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get projects from user's role (new standardized approach)
    const userRole = await Role.findById(currentUser.role).populate("projects");

    if (!userRole) {
      console.log("❌ User role not found");
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Check if user is Super Admin - they can see all agents
    const isSuperAdmin = (userRole as any).code === "SUPER_ADMIN";

    // Super Admin: return all active agents, but respect projectId filter if provided
    if (isSuperAdmin) {
      let superAdminQuery: any = { isActive: true };
      if (projectId) {
        const projectObjectId = new mongoose.Types.ObjectId(
          projectId as string,
        );
        const rolesInProject = await Role.find({
          projects: projectObjectId,
          isActive: true,
        }).select("_id");
        const roleIdsInProject = rolesInProject.map((r) => r._id);
        superAdminQuery.role = { $in: roleIdsInProject };
        console.log(
          `👑 Super Admin - filtering by project ${projectId} - roles found: ${roleIdsInProject.length}`,
        );
      }
      const allAgents = await User.find(superAdminQuery)
        .populate("role", "name isAgent code")
        .select("_id firstName lastName email role")
        .sort({ firstName: 1, lastName: 1 });
      console.log(
        `👑 Super Admin - returning ${allAgents.length} users as assignable agents`,
      );
      return res.status(200).json({
        success: true,
        data: allAgents,
        mode: "super_admin",
      });
    }

    console.log("🔍 Fetching assignable agents for user:", {
      userId,
      email: currentUser.email,
      role: userRole?.name,
      roleCode: userRole?.code,
      isSuperAdmin,
      projectId,
      useHierarchy: useHierarchy !== "false", // Default to true
    });

    // ============ HIERARCHY-BASED FILTERING ============
    // If hierarchy mode is enabled (default), use reporting hierarchy from User.reportingManager
    if (useHierarchy !== "false" && !isSuperAdmin) {
      try {
        // Get all users who have current user as their reportingManager (direct + recursive)
        const getAllReporteesRecursive = async (
          managerId: mongoose.Types.ObjectId,
          visited = new Set<string>(),
        ): Promise<mongoose.Types.ObjectId[]> => {
          const managerIdStr = managerId.toString();
          if (visited.has(managerIdStr)) return []; // Prevent infinite loops
          visited.add(managerIdStr);

          // Find all users who report to this manager
          const directReportees = await User.find({
            reportingManager: managerId,
          })
            .select("_id")
            .lean();
          const reporteeIds = directReportees.map(
            (r: any) => r._id as mongoose.Types.ObjectId,
          );

          // Recursively get reportees of reportees
          const allReportees: mongoose.Types.ObjectId[] = [...reporteeIds];
          for (const reporteeId of reporteeIds) {
            const subReportees = await getAllReporteesRecursive(
              reporteeId,
              visited,
            );
            allReportees.push(...subReportees);
          }

          return allReportees;
        };

        const currentUserObjectId = new mongoose.Types.ObjectId(userId);
        const allReporteeIds =
          await getAllReporteesRecursive(currentUserObjectId);

        console.log(
          "📊 Hierarchy found (using User.reportingManager) - reportees:",
          allReporteeIds.length,
        );

        // Build list: current user + all reportees
        const assignableUserIds = [currentUserObjectId, ...allReporteeIds];

        // Fetch user details for these IDs
        let assignableQuery: any = {
          _id: { $in: assignableUserIds },
          isActive: true,
        };

        // Scope to the ticket's center for offline tickets
        if (ticketCenterId) {
          assignableQuery.centers = {
            $in: [new mongoose.Types.ObjectId(ticketCenterId)],
          };
        }

        // If projectId is provided, ensure users have access to that project via their role
        if (projectId) {
          const projectObjectId = new mongoose.Types.ObjectId(
            projectId as string,
          );
          const rolesInProject = await Role.find({
            projects: projectObjectId,
            isActive: true,
          }).select("_id");
          const roleIdsInProject = rolesInProject.map((r) => r._id);
          assignableQuery.role = { $in: roleIdsInProject };
          console.log(
            "🎯 Filtering by project:",
            projectId,
            "- roles found:",
            roleIdsInProject.length,
          );
        }

        const agents = await User.find(assignableQuery)
          .populate("role", "name isAgent code")
          .populate("centers", "centerName")
          .select("_id firstName lastName email role centers")
          .sort({ firstName: 1, lastName: 1 });

        console.log("✅ Found assignable agents (hierarchy mode):", {
          count: agents.length,
          agents: agents.map(
            (a) =>
              `${a.firstName} ${a.lastName} (${(a.role as any)?.name}) - Centers: ${(a as any).centers?.map((c: any) => c.centerName).join(", ") || "None"}`,
          ),
        });

        return res.status(200).json({
          success: true,
          data: agents,
          mode: "hierarchy",
        });
      } catch (hierarchyError) {
        console.log(
          "⚠️ Hierarchy fetch failed, falling back to project-based:",
          hierarchyError,
        );
        // Fall through to project-based filtering
      }
    }

    // ============ FALLBACK: PROJECT-BASED FILTERING ============
    // For Super Admin or when hierarchy is disabled/fails

    const userProjectIds = (userRole?.projects || []).map((p: any) =>
      typeof p === "string" ? p : p._id?.toString() || p.toString(),
    );

    // Super Admin can see all agents regardless of project assignment
    if (userProjectIds.length === 0 && !isSuperAdmin) {
      console.log("⚠️ User role has no projects assigned");
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // For Super Admin without specific projects, get ALL agents
    let targetProjectIds = userProjectIds;
    if (isSuperAdmin && userProjectIds.length === 0) {
      // Get all active projects
      const allProjects = await Project.find({ status: "active" }).select(
        "_id",
      );
      targetProjectIds = allProjects.map((p) => p._id.toString());
      console.log(
        "👑 Super Admin - fetching agents from all projects:",
        targetProjectIds.length,
      );
    }

    // If projectId is provided, filter to only that project
    if (projectId) {
      const projectIdStr = projectId.toString();
      // Super Admin can access any project
      if (isSuperAdmin || userProjectIds.includes(projectIdStr)) {
        targetProjectIds = [projectIdStr];
        console.log("🎯 Filtering agents for specific project:", projectIdStr);
      } else {
        console.log(
          "⚠️ User does not have access to requested project:",
          projectIdStr,
        );
        return res.status(200).json({
          success: true,
          data: [],
        });
      }
    }

    const userCenterIds = (currentUser.centers || []).map((c: any) =>
      typeof c === "string" ? c : c._id?.toString() || c.toString(),
    );

    console.log("🔍 Project-based agent filtering:", {
      targetProjectIds,
      centers: userCenterIds,
    });

    // Find all roles where isAgent = true AND are mapped to the target projects
    // Convert targetProjectIds to ObjectIds for proper comparison
    const projectObjectIds = targetProjectIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    const agentRoles = await Role.find({
      isAgent: true,
      isActive: true,
      projects: { $in: projectObjectIds }, // Only roles mapped to user's projects
    }).populate("projects", "name code");

    const agentRoleIds = agentRoles.map((role) => role._id);

    console.log("📋 Found agent roles in current project(s):", {
      count: agentRoles.length,
      roles: agentRoles.map((r) => ({
        name: r.name,
        code: r.code,
        projects: (r.projects as any[])?.map((p: any) => p.name || p),
      })),
    });

    if (agentRoleIds.length === 0) {
      console.log(
        "✅ No agent roles found in current project - returning empty list",
      );
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Build agent query - find users with agent roles
    const agentQuery: any = {
      isActive: true,
      role: { $in: agentRoleIds },
    };

    // If user has centers assigned (and is NOT Super Admin), also filter agents by shared centers (for offline mode)
    // Super Admin should see all agents regardless of center assignment
    if (userCenterIds.length > 0 && !isSuperAdmin) {
      // When we have a specific ticket center, prefer that over the user's full center list
      // (ticket center is a subset — always more specific)
      const scopeCenterIds = ticketCenterId ? [ticketCenterId] : userCenterIds;
      agentQuery.centers = { $in: scopeCenterIds };
      console.log("🏢 Filtering agents by center scope:", scopeCenterIds);
    } else if (ticketCenterId && !isSuperAdmin) {
      // User has no personal centers but ticket has a center — still scope by ticket's center
      agentQuery.centers = { $in: [ticketCenterId] };
      console.log(
        "🏢 Filtering agents by ticket center (user has no center):",
        ticketCenterId,
      );
    } else if (isSuperAdmin) {
      console.log("👑 Super Admin - not filtering by centers");
    }

    // Find all active users who:
    // 1. Have a role with isAgent = true
    // 2. Role is mapped to the same project(s) as current user
    // 3. Share at least one center with the current user (if user has centers)
    const agents = await User.find(agentQuery)
      .populate("role", "name isAgent code")
      .populate("centers", "centerName")
      .select("_id firstName lastName email role centers")
      .sort({ firstName: 1, lastName: 1 });

    console.log("✅ Found assignable agents (project mode):", {
      count: agents.length,
      agents: agents.map(
        (a) =>
          `${a.firstName} ${a.lastName} (${(a.role as any)?.name}) - Centers: ${(a as any).centers?.map((c: any) => c.centerName).join(", ") || "None"}`,
      ),
    });

    return res.status(200).json({
      success: true,
      data: agents,
      mode: "project",
    });
  } catch (error: any) {
    console.error("Get assignable agents error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assignable agents",
      error: error.message,
    });
  }
};

/**
 * Get SLA status for a ticket
 * GET /api/tickets/:id/sla-status
 */
export const getSLAStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id)
      .populate("metadata.projectId")
      .populate("workingCalendarId");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const now = new Date();
    const result: any = {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      ticketLevelSLA: null,
      roleLevelSLA: null,
    };

    // Calculate ticket-level SLA remaining time
    if (ticket.ticketLevelSLA?.dueAt) {
      const calendar = ticket.workingCalendarId as any;
      const remainingMinutes = await slaService.calculateRemainingTime(
        ticket.ticketLevelSLA.dueAt,
        ticket.ticketLevelSLA.pausedAt,
        ticket.ticketLevelSLA.pausedDuration || 0,
        calendar,
      );

      result.ticketLevelSLA = {
        startedAt: ticket.createdAt,
        dueAt: ticket.ticketLevelSLA.dueAt,
        breachedAt: ticket.ticketLevelSLA.breachedAt,
        isPaused: !!ticket.ticketLevelSLA.pausedAt,
        pausedAt: ticket.ticketLevelSLA.pausedAt,
        pausedDuration: ticket.ticketLevelSLA.pausedDuration,
        remainingMinutes: remainingMinutes,
        isBreached: remainingMinutes < 0,
        breachInMinutes: remainingMinutes < 0 ? Math.abs(remainingMinutes) : 0,
      };
    }

    // Calculate role-level SLA remaining time
    if (ticket.roleLevelSLA?.dueAt) {
      const calendar = ticket.workingCalendarId as any;
      const roleRemainingMinutes = await slaService.calculateRemainingTime(
        ticket.roleLevelSLA.dueAt,
        ticket.roleLevelSLA.pausedAt,
        ticket.roleLevelSLA.pausedDuration || 0,
        calendar,
      );

      result.roleLevelSLA = {
        startedAt: ticket.roleLevelSLA.startedAt,
        dueAt: ticket.roleLevelSLA.dueAt,
        breachedAt: ticket.roleLevelSLA.breachedAt,
        isPaused: !!ticket.roleLevelSLA.pausedAt,
        pausedAt: ticket.roleLevelSLA.pausedAt,
        pausedDuration: ticket.roleLevelSLA.pausedDuration,
        remainingMinutes: roleRemainingMinutes,
        isBreached: roleRemainingMinutes < 0,
        breachInMinutes:
          roleRemainingMinutes < 0 ? Math.abs(roleRemainingMinutes) : 0,
      };
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Get SLA status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get SLA status",
      error: error.message,
    });
  }
};

/**
 * Pause SLA for a ticket
 * POST /api/tickets/:id/pause-sla
 */
export const pauseSLA = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userName =
      (req as any).user?.userName || (req as any).user?.name || "Unknown";
    const userEmail = (req as any).user?.email || "unknown@email.com";

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const now = new Date();

    // Pause ticket-level SLA
    if (ticket.ticketLevelSLA && !ticket.ticketLevelSLA.pausedAt) {
      ticket.ticketLevelSLA.pausedAt = now;
    }

    // Pause role-level SLA
    if (ticket.roleLevelSLA && !ticket.roleLevelSLA.pausedAt) {
      ticket.roleLevelSLA.pausedAt = now;
    }

    await ticket.save();

    // Log activity
    await logActivity({
      action: "update",
      entity: "Ticket",
      entityId: ticket._id.toString(),
      userId,
      userName,
      userEmail,
      description: `SLA paused for ticket ${ticket.ticketNumber}`,
    });

    return res.status(200).json({
      success: true,
      message: "SLA paused successfully",
      data: {
        ticketLevelSLA: ticket.ticketLevelSLA,
        roleLevelSLA: ticket.roleLevelSLA,
      },
    });
  } catch (error: any) {
    console.error("Pause SLA error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to pause SLA",
      error: error.message,
    });
  }
};

/**
 * Resume SLA for a ticket
 * POST /api/tickets/:id/resume-sla
 */
export const resumeSLA = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userName =
      (req as any).user?.userName || (req as any).user?.name || "Unknown";
    const userEmail = (req as any).user?.email || "unknown@email.com";

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const now = new Date();

    // Resume ticket-level SLA
    if (ticket.ticketLevelSLA?.pausedAt) {
      const pausedDuration =
        now.getTime() - ticket.ticketLevelSLA.pausedAt.getTime();
      ticket.ticketLevelSLA.pausedDuration =
        (ticket.ticketLevelSLA.pausedDuration || 0) + pausedDuration;
      ticket.ticketLevelSLA.pausedAt = undefined;
    }

    // Resume role-level SLA
    if (ticket.roleLevelSLA?.pausedAt) {
      const pausedDuration =
        now.getTime() - ticket.roleLevelSLA.pausedAt.getTime();
      ticket.roleLevelSLA.pausedDuration =
        (ticket.roleLevelSLA.pausedDuration || 0) + pausedDuration;
      ticket.roleLevelSLA.pausedAt = undefined;
    }

    await ticket.save();

    // Log activity
    await logActivity({
      action: "update",
      entity: "Ticket",
      entityId: ticket._id.toString(),
      userId,
      userName,
      userEmail,
      description: `SLA resumed for ticket ${ticket.ticketNumber}`,
    });

    return res.status(200).json({
      success: true,
      message: "SLA resumed successfully",
      data: {
        ticketLevelSLA: ticket.ticketLevelSLA,
        roleLevelSLA: ticket.roleLevelSLA,
      },
    });
  } catch (error: any) {
    console.error("Resume SLA error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resume SLA",
      error: error.message,
    });
  }
};

// ============================================================
// Bulk delete tickets
// @route   DELETE /api/tickets/bulk
// @access  Private (TICKET_VIEW_ALL or Super Admin)
// ============================================================
export const bulkDeleteTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const userName =
      (req as any).user?.userName || (req as any).user?.name || "Unknown";
    const userEmail = (req as any).user?.email || "unknown@email.com";

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { ticketIds } = req.body as { ticketIds?: string[] };

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "ticketIds array is required" });
    }

    if (ticketIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete more than 100 tickets at once",
      });
    }

    // Validate all IDs are valid ObjectIds
    const validIds = ticketIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (validIds.length !== ticketIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more ticket IDs are invalid",
      });
    }

    // Fetch tickets to log activity (limit fields for performance)
    const tickets = await Ticket.find(
      { _id: { $in: validIds } },
      { ticketNumber: 1 },
    ).lean();

    const result = await Ticket.deleteMany({ _id: { $in: validIds } });

    // Log activity for each deleted ticket
    for (const t of tickets) {
      await logActivity({
        action: "delete",
        entity: "Ticket",
        entityId: (t._id as any).toString(),
        userId,
        userName,
        userEmail,
        description: `Ticket ${t.ticketNumber} deleted in bulk by ${userEmail}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} ticket(s) deleted successfully`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error: any) {
    console.error("Bulk delete tickets error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete tickets",
      error: error.message,
    });
  }
};
