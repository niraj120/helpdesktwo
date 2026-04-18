import { Request, Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { Ticket } from "../models/Ticket";
import { Center } from "../models/Center";
import { Project } from "../models/Project";
import { Category } from "../models/Category";
import { HierarchyConfig } from "../models/HierarchyConfig";
import { Priority } from "../models/master-data/Priority";
import { GCSService } from "../services/gcsService";
import { normaliseMobile } from "../utils/normaliseMobile";
import { geoCache, TTL } from "../utils/geoCache";
import { PublicApiRequest } from "../middleware/validatePublicApiKey";
import { initializeSLATracking } from "../services/slaHelperService";
import { autoAssignMatrixToTicket } from "../services/escalationMatrixService";
import {
  autoAssignTicket,
  AutoAssignResult,
} from "../utils/ticketAutoAssignment";
import * as slaService from "../services/slaService";
import {
  sendTicketCreatedEmail,
  sendStudentWelcomeEmail,
} from "../utils/emailService";
import { logActivity } from "../utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function validationError(
  res: Response,
  errors: { field: string; message: string }[],
): void {
  res.status(422).json({
    status: "error",
    code: "VALIDATION_ERROR",
    message: "Validation failed.",
    errors,
  });
}

/**
 * Build a mobile query that matches both 10-digit ("9876543210") and
 * 12-digit ("919876543210") formats, since existing users are stored
 * as 10-digit but normaliseMobile returns 12-digit.
 */
function mobileQuery(normMobile: string): { $in: string[] } {
  const variants: string[] = [normMobile];
  if (normMobile.startsWith("91") && normMobile.length === 12) {
    variants.push(normMobile.slice(2)); // 10-digit form
  }
  return { $in: variants };
}

/** Haversine straight-line distance in metres */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// API 1 — GET /v1/users/lookup
// ─────────────────────────────────────────────────────────────────────────────

export const lookupUser = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const { mobile: rawMobile, project_id } = req.query as Record<string, string>;

  // Validate
  const errors: { field: string; message: string }[] = [];
  if (!rawMobile)
    errors.push({ field: "mobile", message: "Mobile number is required." });
  if (!project_id)
    errors.push({ field: "project_id", message: "project_id is required." });
  if (errors.length) {
    validationError(res, errors);
    return;
  }

  const normMobile = normaliseMobile(rawMobile);
  if (!normMobile) {
    validationError(res, [
      {
        field: "mobile",
        message: "Mobile number must be 10–13 digits including country code.",
      },
    ]);
    return;
  }

  // Fetch user — scoped to project
  const user = await User.findOne({
    mobile: mobileQuery(normMobile),
    projects: new mongoose.Types.ObjectId(project_id),
  })
    .select(
      "_id firstName lastName fullName mobile email uniqueId isActive createdAt centers",
    )
    .populate("centers", "centerName city _id")
    .lean();

  if (!user) {
    res.status(200).json({
      status: "not_found",
      project_id,
      data: null,
      message: "No user registered with this mobile number in this project.",
    });
    return;
  }

  const firstCenter = Array.isArray(user.centers)
    ? (user.centers as any[])[0]
    : null;

  res.status(200).json({
    status: "found",
    project_id,
    data: {
      user_id: (user._id as mongoose.Types.ObjectId).toString(),
      name:
        user.fullName ??
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      mobile: user.mobile,
      email: user.email ?? null,
      employee_id: user.uniqueId ?? null,
      center: firstCenter
        ? {
            center_id: firstCenter._id.toString(),
            name: firstCenter.centerName,
            city: firstCenter.city,
          }
        : null,
      registered_on: user.createdAt,
      is_active: user.isActive,
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// API 2 — POST /v1/tickets
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_CHANNELS = ["whatsapp", "chatbot", "web", "sms"] as const;

export const createPublicTicket = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const { mobile: rawMobile, message, channel, user_id, metadata } = req.body;
    const project_id = req.publicApiProjectId!; // set by validatePublicApiKey middleware

    const errors: { field: string; message: string }[] = [];

    const projectId = new mongoose.Types.ObjectId(project_id);

    // Load project first so we know the submission mode before validating
    const project = await Project.findById(projectId)
      .select(
        "code name publicApiSettings ticketSequence configuration branding",
      )
      .lean();

    if (!project) {
      res.status(404).json({
        status: "error",
        code: "PROJECT_NOT_FOUND",
        message: "Project not found.",
      });
      return;
    }

    // Determine mode — for online/both, mobile/message/channel are NOT required
    const submissionMode = (project as any).configuration
      ?.ticketSubmissionSettings?.mode as string | undefined;
    const isOnlineMode =
      submissionMode === "online" || submissionMode === "both";

    // For non-online (chatbot/WhatsApp) mode, validate legacy core fields
    if (!isOnlineMode) {
      if (!rawMobile)
        errors.push({ field: "mobile", message: "Mobile number is required." });
      if (!message || typeof message !== "string") {
        errors.push({ field: "message", message: "Message is required." });
      } else if (message.trim().length < 5) {
        errors.push({
          field: "message",
          message: "Message must be at least 5 characters.",
        });
      } else if (message.trim().length > 2000) {
        errors.push({
          field: "message",
          message: "Message must not exceed 2000 characters.",
        });
      }
      if (!channel || !ALLOWED_CHANNELS.includes(channel)) {
        errors.push({
          field: "channel",
          message: "channel must be one of: whatsapp, chatbot, web, sms",
        });
      }
      if (errors.length) {
        validationError(res, errors);
        return;
      }
    }

    // Normalise mobile — required for non-online, optional for online
    const normMobile = rawMobile ? normaliseMobile(rawMobile) : null;
    if (!isOnlineMode && !normMobile) {
      validationError(res, [
        {
          field: "mobile",
          message: "Mobile number must be 10–13 digits including country code.",
        },
      ]);
      return;
    }

    // For online mode, resolve channel and description from form body
    const effectiveChannel: string =
      channel && ALLOWED_CHANNELS.includes(channel)
        ? channel
        : isOnlineMode
          ? "web"
          : channel;

    // For online mode, derive description from issueDescription field if message not provided
    const rawIssueDescription: string | undefined = req.body.issueDescription;
    const strippedIssueDescription = rawIssueDescription
      ? rawIssueDescription.replace(/<[^>]*>/g, "").trim()
      : undefined;
    const effectiveMessage: string =
      (message && message.trim()) ||
      strippedIssueDescription ||
      "Online form submission";
    const allOnlineFormFields: any[] =
      (project as any).configuration?.ticketSubmissionSettings
        ?.onlineFormFields ?? [];

    // Fetch hierarchy config for auto-injected category level fields
    const hierarchyConfigForValidation = await HierarchyConfig.findOne({
      projectId: projectId,
      isActive: true,
    }).lean();

    const hierarchyLevelsForValidation: any[] = (
      hierarchyConfigForValidation as any
    )?.levels ?? [
      {
        levelNumber: 1,
        displayName: "Category",
        isMandatory: true,
        isActive: true,
      },
    ];

    const systemFieldSchema = [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      ...hierarchyLevelsForValidation
        .filter((l: any) => l.isActive !== false)
        .sort((a: any, b: any) => a.levelNumber - b.levelNumber)
        .map((l: any) => ({
          key: `category_level_${l.levelNumber}`,
          label: l.displayName,
          type: "select" as const,
          required: !!l.isMandatory,
        })),
    ];

    const fieldSchema: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
      maxLength?: number;
      placeholder?: string;
    }> = [
      ...systemFieldSchema,
      ...(isOnlineMode
        ? allOnlineFormFields
            .filter((f: any) => f.isFixed || f.includeInPublicApi)
            .map((f: any) => ({
              key: f.fieldName,
              label: f.fieldLabel || f.fieldName,
              type: ["dropdown", "radio", "checkbox"].includes(f.fieldType)
                ? "select"
                : f.fieldType,
              required: f.isFixed ? true : !!f.required,
              options: f.options,
              maxLength: f.validation?.maxLength,
              placeholder: f.placeholder,
            }))
        : (project.publicApiSettings?.customFields ?? [])),
    ];
    if (fieldSchema.length > 0) {
      for (const field of fieldSchema) {
        const val = req.body[field.key];
        const empty = val === undefined || val === null || val === "";
        if (field.required && empty) {
          errors.push({
            field: field.key,
            message: `${field.label} is required.`,
          });
          continue;
        }
        if (empty) continue; // optional + not provided → skip
        if (
          (field.type === "select" || field.type === "multiselect") &&
          field.options?.length
        ) {
          const submitted_vals = Array.isArray(val) ? val : [val];
          const invalid = submitted_vals.filter(
            (v: string) => !field.options!.includes(v),
          );
          if (invalid.length) {
            errors.push({
              field: field.key,
              message: `${field.label} must be one of: ${field.options!.join(", ")}.`,
            });
          }
        } else if (field.type === "number" && isNaN(Number(val))) {
          errors.push({
            field: field.key,
            message: `${field.label} must be a number.`,
          });
        } else if (
          field.type === "text" &&
          field.maxLength &&
          String(val).length > field.maxLength
        ) {
          errors.push({
            field: field.key,
            message: `${field.label} must not exceed ${field.maxLength} characters.`,
          });
        } else if (
          field.type === "email" &&
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(val))
        ) {
          errors.push({
            field: field.key,
            message: `${field.label} must be a valid email address.`,
          });
        }
      }
      if (errors.length) {
        validationError(res, errors);
        return;
      }
    }

    const dupWindowMins =
      project.publicApiSettings?.duplicateTicketWindowMinutes ?? 5;
    const windowStart = new Date(Date.now() - dupWindowMins * 60 * 1000);

    // Duplicate guard — only check by mobile for non-online mode; skip if no mobile
    const existing = normMobile
      ? ((await Ticket.findOne({
          mobile: normMobile,
          project: projectId,
          createdAt: { $gte: windowStart },
        })
          .select("ticketNumber createdAt")
          .lean()) as { ticketNumber?: string; createdAt?: Date } | null)
      : null;

    if (existing) {
      res.status(409).json({
        status: "error",
        code: "DUPLICATE_TICKET",
        message: "A ticket was already created from this number recently.",
        data: {
          existing_ticket_number: existing.ticketNumber,
          created_at: existing.createdAt,
        },
      });
      return;
    }

    // Resolve user
    let linkedUser: {
      _id: any;
      fullName?: string;
      firstName?: string;
      lastName?: string;
    } | null = null;

    if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
      linkedUser = (await User.findOne({
        _id: new mongoose.Types.ObjectId(user_id),
        projects: projectId,
      })
        .select("_id fullName firstName lastName")
        .lean()) as any;
    }

    if (!linkedUser && normMobile) {
      // Auto-lookup by mobile
      linkedUser = (await User.findOne({
        mobile: mobileQuery(normMobile),
        projects: projectId,
      })
        .select("_id fullName firstName lastName")
        .lean()) as any;
    }

    // For online mode, also try lookup by email if still no linked user
    if (!linkedUser && isOnlineMode && req.body.email) {
      linkedUser = (await User.findOne({
        email: req.body.email,
        projects: projectId,
      })
        .select("_id fullName firstName lastName")
        .lean()) as any;
    }

    // ── Category resolution ────────────────────────────────────────────────
    // category_level_N can be an ObjectId string or a category name string.
    const resolveCategoryOid = async (
      val: string | undefined,
    ): Promise<mongoose.Types.ObjectId | undefined> => {
      if (!val) return undefined;
      if (mongoose.Types.ObjectId.isValid(val) && val.length === 24) {
        return new mongoose.Types.ObjectId(val);
      }
      // Name-based lookup
      const cat = await Category.findOne({
        name: {
          $regex: new RegExp(
            `^${val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
        projectId,
        isActive: true,
      })
        .select("_id")
        .lean();
      return cat ? (cat as any)._id : undefined;
    };

    const [catL1, catL2, catL3, catL4] = await Promise.all([
      resolveCategoryOid(req.body.category_level_1),
      resolveCategoryOid(req.body.category_level_2),
      resolveCategoryOid(req.body.category_level_3),
      resolveCategoryOid(req.body.category_level_4),
    ]);
    const categoryObjectId = catL1;
    const deepestCategoryObjectId = catL4 ?? catL3 ?? catL2 ?? catL1;
    // Subject: read from Subject / Title / subject form fields (matches submitTicket convention)
    const formSubject: string =
      ((req.body.Subject || req.body.Title || req.body.subject) as string) ||
      "";
    const builtCategoryHierarchy: Record<string, any> | undefined = catL1
      ? {
          level1: catL1,
          ...(catL2 ? { level2: catL2 } : {}),
          ...(catL3 ? { level3: catL3 } : {}),
          ...(catL4 ? { level4: catL4 } : {}),
        }
      : undefined;

    // ── Priority from category ─────────────────────────────────────────────
    let ticketPriority = "MEDIUM";
    if (deepestCategoryObjectId) {
      const catDoc = await Category.findOne({
        _id: deepestCategoryObjectId,
        isActive: true,
      })
        .select("defaultPriority")
        .lean();
      if ((catDoc as any)?.defaultPriority) {
        ticketPriority = (catDoc as any).defaultPriority.toUpperCase();
      }
    }

    // ── Auto-assignment ────────────────────────────────────────────────────
    const assignmentResult: AutoAssignResult | null = await autoAssignTicket(
      project_id,
      deepestCategoryObjectId ?? null,
    );
    const assignedAgent = assignmentResult?.agentId ?? null;

    // ── Student user auto-create ───────────────────────────────────────────
    // Mirrors submitTicket: create a student account for first-time submitters
    let isNewStudent = false;
    if (!linkedUser && isOnlineMode && req.body.email) {
      const studentRole = await Role.findOne({ code: "STUDENT" }).lean();
      if (studentRole) {
        const nameParts = ((req.body.name as string) ?? "Student").split(" ");
        const newStudent = await User.create({
          email: req.body.email,
          firstName: nameParts[0] || "Student",
          lastName: nameParts.slice(1).join(" ") || "",
          role: (studentRole as any)._id,
          projects: [projectId],
          isActive: true,
          requirePasswordSetup: true,
          registrationSource: "online",
        });
        linkedUser = newStudent as any;
        isNewStudent = true;
      }
    }

    // ── SLA rule ID (rename-resilient priority matching) ───────────────────
    let slaRuleIdForTicket: mongoose.Types.ObjectId | undefined;
    try {
      const SLARuleModel = require("../models/sla-module/SLARule").default;
      const matchedSlaRule = await SLARuleModel.findOne({
        projectIds: { $in: [projectId] },
        name: { $regex: new RegExp(`^${ticketPriority}$`, "i") },
        isActive: true,
      })
        .select("_id")
        .lean();
      if (matchedSlaRule) slaRuleIdForTicket = matchedSlaRule._id;
    } catch (_e) {
      /* non-critical */
    }

    // ── Ticket number (same scan-based approach as submitTicket) ────────────
    const ticketNumberConfig = (project as any)?.configuration
      ?.ticketNumberSettings;
    const tnPrefix =
      ticketNumberConfig?.prefix ||
      project!.publicApiSettings?.projectCode ||
      project!.code ||
      "TKT";
    const tnFormat =
      ticketNumberConfig?.format || "{PREFIX}-{YYYY}{MM}{DD}-{NNNN}";
    const tnResetPeriod = ticketNumberConfig?.resetPeriod || "daily";
    const today = new Date();

    const generateUniqueTicketNumber = async (): Promise<string> => {
      const searchPattern = tnFormat
        .replace("{PREFIX}", tnPrefix)
        .replace("{YYYY}", String(today.getFullYear()))
        .replace("{MM}", String(today.getMonth() + 1).padStart(2, "0"))
        .replace("{DD}", String(today.getDate()).padStart(2, "0"))
        .replace("{NNNN}", "");

      const latestTicket = await Ticket.findOne({
        project: projectId,
        ticketNumber: new RegExp(`^${searchPattern.replace(/[-]/g, "\\-")}`),
      }).sort({ ticketNumber: -1 });

      let nextNumber = ticketNumberConfig?.startingNumber || 1;
      if (latestTicket?.ticketNumber) {
        const lastNumber = parseInt(
          latestTicket.ticketNumber.split("-").pop() || "0",
        );
        nextNumber = lastNumber + 1;
      }

      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = tnFormat
          .replace("{PREFIX}", tnPrefix)
          .replace("{YYYY}", String(today.getFullYear()))
          .replace("{MM}", String(today.getMonth() + 1).padStart(2, "0"))
          .replace("{DD}", String(today.getDate()).padStart(2, "0"))
          .replace("{NNNN}", String(nextNumber).padStart(4, "0"));
        const exists = await Ticket.findOne({ ticketNumber: candidate });
        if (!exists) return candidate;
        nextNumber++;
      }

      // Fallback if all 10 attempts collide
      return `${tnPrefix}-${Date.now().toString().slice(-8)}`;
    };

    const ticketNumber = await generateUniqueTicketNumber();

    // ── Build metadata ─────────────────────────────────────────────────────
    const formFieldValues: Record<string, any> = {};
    for (const field of fieldSchema) {
      const val = req.body[field.key];
      if (val !== undefined && val !== null && val !== "") {
        formFieldValues[field.key] = val;
      }
    }
    const ticketMetadata: Record<string, any> = {
      ...(metadata ?? {}),
      studentName: req.body.name,
      studentEmail: req.body.email,
      projectId,
      submissionType: "online",
      autoAssigned: !!assignedAgent,
      assignedVia: assignmentResult?.assignedVia ?? null,
      ...(Object.keys(formFieldValues).length > 0
        ? { formFields: formFieldValues }
        : {}),
    };

    // ── Build attachments from URL(s) in body ─────────────────────────────
    // Vendor can send: Attachment: "https://..." or attachments: ["https://...", ...]
    // Any valid URL is stored as-is (S3, GCS, CDN, etc.)
    const attachments: any[] = [];
    const rawAttachment: string | string[] | undefined =
      req.body.Attachment || req.body.attachment || req.body.attachments;
    const attachmentUrls: string[] = Array.isArray(rawAttachment)
      ? rawAttachment
      : rawAttachment
        ? [rawAttachment]
        : [];
    for (const url of attachmentUrls) {
      if (!url || typeof url !== "string" || !url.trim()) continue;
      try {
        new URL(url); // validates it's a proper URL
        const fileName = url.split("?")[0].split("/").pop() || "attachment";
        const ext = fileName.includes(".")
          ? fileName.split(".").pop()!.toLowerCase()
          : "";
        const mimeMap: Record<string, string> = {
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          mp4: "video/mp4",
          mov: "video/quicktime",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xls: "application/vnd.ms-excel",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          zip: "application/zip",
        };
        attachments.push({
          filename: fileName,
          originalName: fileName,
          path: url.trim(),
          mimetype: mimeMap[ext] || "application/octet-stream",
          size: 0, // unknown for external URLs
          uploadedAt: new Date(),
        });
      } catch {
        // Not a valid URL — skip silently
      }
    }

    // ── Create ticket ──────────────────────────────────────────────────────
    const ticket = await Ticket.create({
      ticketNumber,
      subject: (formSubject || effectiveMessage).slice(0, 200) || ticketNumber,
      description: effectiveMessage || ticketNumber,
      status: 1,
      priority: ticketPriority,
      slaRuleId: slaRuleIdForTicket,
      category: categoryObjectId,
      categoryHierarchy: builtCategoryHierarchy,
      project: projectId,
      submissionSource: effectiveChannel,
      mobile: normMobile || undefined,
      isRegistered: !!linkedUser,
      createdBy: (linkedUser as any)?._id,
      assignedTo: assignedAgent,
      assignedVia: assignmentResult?.assignedVia ?? undefined,
      assignmentAttempts: assignmentResult?.attempts ?? 0,
      metadata: ticketMetadata,
      tags: ["student-submission", `project-${project_id}`, "online"],
      formSchemaSnapshot: fieldSchema.length > 0 ? fieldSchema : undefined,
      attachments,
    });

    // ── Non-blocking post-creation tasks ──────────────────────────────────
    // SLA tracking
    (async () => {
      try {
        await initializeSLATracking(
          ticket._id,
          projectId,
          ticketPriority,
          ticket.createdAt,
          builtCategoryHierarchy?.level1,
        );
      } catch (e) {
        console.error("[createPublicTicket] SLA tracking failed:", e);
      }
    })();

    // Priority-level SLA
    (async () => {
      try {
        const calendar = await slaService.getDefaultWorkingCalendar(projectId);
        let priorityDoc = await Priority.findOne({
          code: ticketPriority,
          projectId,
        });
        if (!priorityDoc) {
          const SLARuleModel = require("../models/sla-module/SLARule").default;
          const slaRule = await SLARuleModel.findOne({
            projectIds: { $in: [projectId] },
            priority: ticketPriority,
            isActive: true,
          });
          if (slaRule) {
            priorityDoc = {
              code: ticketPriority,
              resolutionTime: slaRule.resolutionTime,
              responseTime: slaRule.responseTime || { value: 1, unit: "hours" },
            } as any;
          }
        }
        if (priorityDoc && calendar) {
          const dueAt = await slaService.calculateTicketLevelSLA(
            ticket.createdAt,
            (priorityDoc as any).code,
            projectId,
            (calendar as any)._id,
          );
          if (dueAt) {
            await Ticket.updateOne(
              { _id: ticket._id },
              {
                $set: {
                  "ticketLevelSLA.dueAt": dueAt,
                  "ticketLevelSLA.pausedDuration": 0,
                  workingCalendarId: (calendar as any)._id,
                },
              },
            );
          }
        }
      } catch (e) {
        console.error("[createPublicTicket] Priority SLA failed:", e);
      }
    })();

    // Escalation matrix
    (async () => {
      try {
        await autoAssignMatrixToTicket(
          ticket._id,
          project_id,
          ticketPriority,
          categoryObjectId?.toString(),
        );
      } catch (e) {
        console.error("[createPublicTicket] Escalation matrix failed:", e);
      }
    })();

    // Email notification
    const studentEmail = req.body.email as string | undefined;
    const studentName = req.body.name as string | undefined;
    if (studentEmail) {
      (async () => {
        try {
          if (isNewStudent) {
            const customUrlPath =
              (project as any)?.branding?.customUrlPath || "portal";
            const frontendUrl =
              process.env.NODE_ENV === "production"
                ? process.env.PRODUCTION_FRONTEND_URL ||
                  "https://helpdesk.hubblehox.ai"
                : process.env.FRONTEND_URL || "http://localhost:3001";
            await sendStudentWelcomeEmail(
              studentEmail,
              studentName ?? "Student",
              (project as any)?.name || "",
              `${frontendUrl}/${customUrlPath}/student/login`,
              project_id,
            );
          }
          await sendTicketCreatedEmail(
            studentEmail,
            ticket.ticketNumber,
            ticket.subject,
            project_id,
            {
              studentName,
              status: "Open",
              priority: ticketPriority,
            },
          );
        } catch (e) {
          console.error("[createPublicTicket] Email notification failed:", e);
        }
      })();
    }

    // Activity log
    (async () => {
      try {
        await logActivity({
          userId: (linkedUser as any)?._id?.toString() ?? "anonymous",
          userName: studentName ?? "Anonymous",
          userEmail: studentEmail ?? "unknown",
          action: "create",
          entity: "ticket",
          entityId: ticket._id.toString(),
          entityName: ticket.subject,
          projectId: project_id,
          projectName: (project as any)?.name || "",
          description: `Ticket ${ticket.ticketNumber} created via public API`,
          req,
          metadata: { ticketNumber: ticket.ticketNumber, source: "public-api" },
        });
      } catch (e) {
        console.error("[createPublicTicket] Activity log failed:", e);
      }
    })();

    const userName = linkedUser
      ? ((linkedUser as any).fullName ??
        `${(linkedUser as any).firstName ?? ""} ${(linkedUser as any).lastName ?? ""}`.trim())
      : null;

    res.status(201).json({
      status: "success",
      project_id,
      data: {
        ticket_id: ticket._id.toString(),
        ticket_number: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        category: req.body.category_level_1 || null,
        status: "open",
        priority: ticketPriority.toLowerCase(),
        channel: effectiveChannel,
        mobile: normMobile ?? undefined,
        assigned_to: assignedAgent ? assignedAgent.toString() : null,
        user: {
          user_id: linkedUser ? (linkedUser as any)._id.toString() : null,
          name: userName,
          is_registered: !!linkedUser,
        },
        estimated_response_time:
          project!.publicApiSettings?.estimatedResponseTime ?? "Within 4 hours",
        created_at: ticket.createdAt,
      },
    });
  } catch (err: any) {
    console.error("[createPublicTicket] Unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        status: "error",
        code: "INTERNAL_ERROR",
        message: err?.message || "An unexpected error occurred.",
      });
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// API 3 — GET /v1/tickets/form-schema
// Returns the custom fields schema configured for this project so the
// consuming team knows which fields to send in POST /v1/tickets
// ─────────────────────────────────────────────────────────────────────────────
export const getFormSchema = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;
  const project = await Project.findById(
    new mongoose.Types.ObjectId(project_id),
  )
    .select(
      "publicApiSettings name code configuration.ticketSubmissionSettings",
    )
    .lean();

  if (!project) {
    res.status(404).json({
      status: "error",
      code: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
    return;
  }

  const schemaMode = (project as any).configuration?.ticketSubmissionSettings
    ?.mode as string | undefined;
  const isOnlineSchema = schemaMode === "online" || schemaMode === "both";
  const allOnlineFields: any[] =
    (project as any).configuration?.ticketSubmissionSettings
      ?.onlineFormFields ?? [];

  const mapField = (f: any) => ({
    key: f.fieldName,
    label: f.fieldLabel || f.fieldName,
    type: f.fieldType,
    required: !!f.required,
    ...(f.options?.length ? { options: f.options } : {}),
    ...(f.validation?.maxLength ? { max_length: f.validation.maxLength } : {}),
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
  });

  // Fetch hierarchy config to auto-include category levels as fixed fields
  const hierarchyConfig = await HierarchyConfig.findOne({
    projectId: new mongoose.Types.ObjectId(project_id),
    isActive: true,
  }).lean();

  const hierarchyLevels: any[] = (hierarchyConfig as any)?.levels ?? [
    {
      levelNumber: 1,
      displayName: "Category",
      isMandatory: true,
      isActive: true,
    },
  ];

  const hierarchyFixedFields = hierarchyLevels
    .filter((l: any) => l.isActive !== false)
    .sort((a: any, b: any) => a.levelNumber - b.levelNumber)
    .map((l: any) => ({
      key: `category_level_${l.levelNumber}`,
      label: l.displayName,
      type: "select",
      required: !!l.isMandatory,
    }));

  // System fields always present for online-mode projects (Name + Email + hierarchy levels).
  // These correspond to the chip fields in the form builder that are not stored in onlineFormFields.
  const systemFixedFields = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    ...hierarchyFixedFields,
  ];

  // fixed_fields: system chips (name, email, category levels) + any onlineFormFields with isFixed=true
  // custom_fields: user-added fields marked includeInPublicApi=true (non-fixed)
  let fixedFields: any[] = [];
  let customFields: any[] = [];

  if (isOnlineSchema) {
    fixedFields = [
      ...systemFixedFields,
      ...allOnlineFields.filter((f: any) => f.isFixed).map(mapField),
    ];
    customFields = allOnlineFields
      .filter((f: any) => !f.isFixed && f.includeInPublicApi)
      .map(mapField);
  } else {
    // Non-online projects: still expose system fields + backward-compat customFields
    fixedFields = [...systemFixedFields];
    customFields = (project.publicApiSettings?.customFields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      ...(f.options?.length ? { options: f.options } : {}),
      ...(f.maxLength ? { max_length: f.maxLength } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    }));
  }

  console.log(
    "[getFormSchema] project_id:",
    project_id,
    "isOnlineSchema:",
    isOnlineSchema,
    "fixedFields:",
    JSON.stringify(fixedFields),
    "customFields:",
    JSON.stringify(customFields),
  );

  res.json({
    status: "success",
    project_id,
    project_name: (project as any).name,
    core_fields: [
      { key: "mobile", label: "Mobile Number", type: "phone", required: true },
      {
        key: "message",
        label: "Message",
        type: "text",
        required: true,
        max_length: 2000,
      },
      {
        key: "channel",
        label: "Channel",
        type: "select",
        required: true,
        options: ["whatsapp", "chatbot", "web", "sms"],
      },
    ],
    fixed_fields: fixedFields,
    custom_fields: customFields,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// API 4a — POST /v1/tickets/lms-form
// Accepts multipart/form-data from an external LMS "raise ticket" form.
// Fields: name, email, category, grade, subject, dayNumber, issueDescription,
//         attachment (optional file upload).
// Auth:   X-API-Key + X-Project-ID headers (same as all public API endpoints).
// ─────────────────────────────────────────────────────────────────────────────

export const createLmsFormTicket = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;

  // Fields come from multipart/form-data body
  const name: string | undefined = req.body.name?.trim();
  const email: string | undefined = req.body.email?.trim().toLowerCase();
  const category: string | undefined = req.body.category?.trim();
  const grade: string | undefined = req.body.grade?.trim();
  const subject: string | undefined = req.body.subject?.trim();
  const dayNumber: string | undefined = req.body.dayNumber?.trim();
  const issueDescription: string | undefined =
    req.body.issueDescription?.trim();
  const attachmentFile = (req as any).file as Express.Multer.File | undefined;

  // Validate required fields
  const errors: { field: string; message: string }[] = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({
      field: "email",
      message: "A valid email address is required.",
    });
  }
  if (!issueDescription || issueDescription.length < 5) {
    errors.push({
      field: "issueDescription",
      message: "Issue description is required (minimum 5 characters).",
    });
  }
  if (!category) {
    errors.push({ field: "category", message: "Category is required." });
  }
  if (errors.length) {
    validationError(res, errors);
    return;
  }

  const projectId = new mongoose.Types.ObjectId(project_id);

  // Load project
  const project = await Project.findById(projectId)
    .select("code publicApiSettings ticketSequence")
    .lean();
  if (!project) {
    res.status(404).json({
      status: "error",
      code: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
    return;
  }

  // Try to match the submitted category string to a Category document in this project
  const escapedCategory = category!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const categoryDoc = await Category.findOne({
    name: { $regex: new RegExp(`^${escapedCategory}$`, "i") },
    projectId,
    isActive: true,
  })
    .select("_id name defaultPriority")
    .lean();

  // Look up registered user by email scoped to this project
  const linkedUser = (await User.findOne({
    email,
    projects: projectId,
  })
    .select("_id fullName firstName lastName")
    .lean()) as {
    _id: any;
    fullName?: string;
    firstName?: string;
    lastName?: string;
  } | null;

  // Strip HTML tags from issueDescription before storing
  const safeDescription = issueDescription!.replace(/<[^>]*>/g, "").trim();

  // Upload attachment to GCS (or local fallback) if a real file was sent
  const attachments: any[] = [];
  if (attachmentFile && attachmentFile.size > 0) {
    try {
      const uploaded = await GCSService.uploadTicketFile(
        attachmentFile,
        "ticket-attachments",
      );
      attachments.push({
        fieldName: attachmentFile.fieldname,
        filename: uploaded.filename,
        originalName: attachmentFile.originalname,
        path: uploaded.path,
        mimetype: attachmentFile.mimetype,
        size: attachmentFile.size,
        uploadedAt: new Date(),
      });
    } catch (uploadErr) {
      console.error("[LMS form] attachment upload failed:", uploadErr);
      // Non-fatal: create ticket without the attachment
    }
  }

  // Atomically increment ticket sequence to assign a unique ticket number
  const updatedProject = await Project.findByIdAndUpdate(
    projectId,
    { $inc: { ticketSequence: 1 } },
    { new: true, select: "ticketSequence code publicApiSettings" },
  );
  const seq = updatedProject!.ticketSequence;
  const projectCode =
    updatedProject!.publicApiSettings?.projectCode ||
    updatedProject!.code ||
    "TKT";
  const year = new Date().getFullYear();
  const ticketNumber = `${projectCode}-${year}-${String(seq).padStart(6, "0")}`;

  // Derive priority from matched category (fallback: MEDIUM)
  const priority =
    (categoryDoc as any)?.defaultPriority?.toUpperCase() ?? "MEDIUM";

  const ticket = await Ticket.create({
    ticketNumber,
    subject: category!.slice(0, 200),
    description: safeDescription,
    status: 1, // open
    priority,
    project: projectId,
    category: categoryDoc ? (categoryDoc as any)._id : undefined,
    submissionSource: "web",
    isRegistered: !!linkedUser,
    createdBy: linkedUser?._id,
    attachments,
    metadata: {
      studentName: name ?? null,
      studentEmail: email,
      centerId: "online",
      submissionType: "online",
      projectId,
      customFields: {
        ...(grade ? { grade } : {}),
        ...(subject ? { lmsSubject: subject } : {}),
        ...(dayNumber ? { dayNumber } : {}),
      },
    },
  });

  res.status(201).json({
    status: "success",
    project_id,
    data: {
      ticket_id: (ticket as any)._id.toString(),
      ticket_number: ticket.ticketNumber,
      status: "open",
      priority: ticket.priority,
      subject: ticket.subject,
      created_at: (ticket as any).createdAt,
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// API 5 — POST /v1/centers/nearest
// ─────────────────────────────────────────────────────────────────────────────

interface GeoPoint {
  lat: number;
  long: number;
  area?: string;
  city?: string;
  state?: string;
}

async function geocodePincode(pincode: string): Promise<GeoPoint | null> {
  const cacheKey = `geocode:${pincode}`;
  const cached = geoCache.get<GeoPoint>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // ── Attempt 1: Google Geocoding API (if key is configured) ──────────────
  if (apiKey) {
    try {
      let data: any;
      // components-only is most reliable for Indian pincodes
      const urlComponents =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?components=postal_code:${pincode}|country:IN` +
        `&key=${apiKey}`;
      const resp1 = await axios.get(urlComponents, { timeout: 5000 });
      data = resp1.data;

      if (data.status !== "OK" || !data.results?.length) {
        // plain address fallback within Google
        const urlAddress =
          `https://maps.googleapis.com/maps/api/geocode/json` +
          `?address=${encodeURIComponent(pincode + " India")}` +
          `&key=${apiKey}`;
        const resp2 = await axios.get(urlAddress, { timeout: 5000 });
        data = resp2.data;
      }

      if (data.status === "OK" && data.results?.length) {
        const result = data.results[0];
        const location: GeoPoint = {
          lat: result.geometry.location.lat,
          long: result.geometry.location.lng,
        };
        for (const comp of result.address_components ?? []) {
          const types: string[] = comp.types;
          if (
            types.includes("sublocality_level_1") ||
            types.includes("sublocality")
          )
            location.area = location.area ?? comp.long_name;
          if (types.includes("locality")) location.city = comp.long_name;
          if (types.includes("administrative_area_level_1"))
            location.state = comp.long_name;
        }
        geoCache.set(cacheKey, location, TTL.GEOCODE);
        return location;
      }
      console.warn(
        `[geocodePincode] Google returned status=${data.status} for pincode=${pincode}, trying Nominatim`,
        data.error_message ?? "",
      );
    } catch (err: any) {
      console.warn(
        `[geocodePincode] Google request failed for pincode=${pincode}: ${err.message}, trying Nominatim`,
      );
    }
  }

  // ── Attempt 2: OpenStreetMap Nominatim (free, no API key needed) ─────────
  try {
    const nominatimUrl =
      `https://nominatim.openstreetmap.org/search` +
      `?postalcode=${encodeURIComponent(pincode)}&country=IN&format=json&limit=1`;
    const nominatimResp = await axios.get(nominatimUrl, {
      timeout: 7000,
      headers: {
        "User-Agent": "SAC-Helpdesk-CenterFinder/1.0",
        "Accept-Language": "en",
      },
    });
    const hits: any[] = nominatimResp.data;
    if (Array.isArray(hits) && hits.length > 0) {
      const hit = hits[0];
      const location: GeoPoint = {
        lat: parseFloat(hit.lat),
        long: parseFloat(hit.lon),
        city: hit.address?.city ?? hit.address?.town ?? hit.address?.village,
        state: hit.address?.state,
        area:
          hit.address?.suburb ??
          hit.address?.neighbourhood ??
          hit.address?.county,
      };
      geoCache.set(cacheKey, location, TTL.GEOCODE);
      return location;
    }
  } catch (err: any) {
    console.warn(
      `[geocodePincode] Nominatim request failed for pincode=${pincode}: ${err.message}`,
    );
  }

  console.error(
    `[geocodePincode] All geocoding attempts failed for pincode=${pincode}`,
  );
  return null;
}

interface CentreWithDistance {
  center_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode?: string;
  phone?: string;
  email?: string;
  location: { lat: number; long: number };
  distance: { value_meters: number; text: string };
  duration?: { value_seconds: number; text: string };
  travel_mode: string;
  maps_url: string;
  google_api_used: boolean;
}

async function getDistancesFromGoogle(
  origin: GeoPoint,
  centres: Array<{ _id: unknown; latitude: number; longitude: number }>,
  projectId: string,
  pincode: string,
): Promise<
  Map<
    string,
    {
      distanceMeters: number;
      distanceText: string;
      durationSeconds: number;
      durationText: string;
    }
  >
> {
  const distMap = new Map<
    string,
    {
      distanceMeters: number;
      distanceText: string;
      durationSeconds: number;
      durationText: string;
    }
  >();
  const cacheKey = `distances:${projectId}:${pincode}`;
  const cached = geoCache.get<typeof distMap>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return distMap;

  const BATCH_SIZE = 25;
  for (let i = 0; i < centres.length; i += BATCH_SIZE) {
    const batch = centres.slice(i, i + BATCH_SIZE);
    const destinations = batch
      .map((c) => `${c.latitude},${c.longitude}`)
      .join("|");

    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${origin.lat},${origin.long}` +
      `&destinations=${encodeURIComponent(destinations)}` +
      `&mode=driving&units=metric` +
      `&key=${apiKey}`;

    const { data } = await axios.get(url, { timeout: 8000 });
    if (data.status !== "OK") continue;

    const elements: any[] = data.rows[0]?.elements ?? [];
    batch.forEach((centre, idx) => {
      const el = elements[idx];
      if (el?.status === "OK") {
        distMap.set(centre._id!.toString(), {
          distanceMeters: el.distance.value,
          distanceText: el.distance.text,
          durationSeconds: el.duration.value,
          durationText: el.duration.text,
        });
      }
    });
  }

  if (distMap.size > 0) {
    geoCache.set(cacheKey, distMap, TTL.DISTANCES);
  }
  return distMap;
}

export const findNearestCentres = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const { pincode, limit: limitRaw } = req.body;
  // project_id is authoritative from the validated middleware (X-Project-ID header)
  const project_id = req.publicApiProjectId!;

  // Validate pincode
  const errors: { field: string; message: string }[] = [];
  if (!pincode) {
    errors.push({ field: "pincode", message: "Pincode is required." });
  } else if (!/^\d{6}$/.test(String(pincode))) {
    errors.push({
      field: "pincode",
      message: "Pincode must be exactly 6 digits.",
    });
  }
  const limit = Math.min(10, Math.max(1, parseInt(limitRaw ?? "3", 10) || 3));
  if (
    limitRaw !== undefined &&
    (isNaN(parseInt(limitRaw)) ||
      parseInt(limitRaw) < 1 ||
      parseInt(limitRaw) > 10)
  ) {
    errors.push({ field: "limit", message: "limit must be between 1 and 10." });
  }
  if (errors.length) {
    validationError(res, errors);
    return;
  }

  // Fetch active centres with coordinates
  const cacheKey = `centers:${project_id}`;
  let centres = geoCache.get<any[]>(cacheKey);
  if (!centres) {
    centres = await Center.find({
      projectId: new mongoose.Types.ObjectId(project_id),
      isActive: true,
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null },
    })
      .select(
        "_id centerName address city state pincode phone email latitude longitude",
      )
      .lean();
    geoCache.set(cacheKey, centres, TTL.CENTRES);
  }

  const totalCentresInProject = await Center.countDocuments({
    projectId: new mongoose.Types.ObjectId(project_id),
    isActive: true,
  });

  if (!centres || centres.length === 0) {
    res.status(200).json({
      status: "no_results",
      project_id,
      data: [],
      total_centers_in_project: totalCentresInProject,
      message: "No centres are registered in this project.",
    });
    return;
  }

  // Geocode the pincode
  let pincodeLocation: GeoPoint | null = null;
  try {
    pincodeLocation = await geocodePincode(String(pincode));
  } catch {
    // Fall through to not-found
  }

  if (!pincodeLocation) {
    // Fallback: return all centres without distance/duration info
    const fallbackData = centres.slice(0, limit).map((c: any) => ({
      center_id: c._id.toString(),
      name: c.centerName,
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      pincode: c.pincode,
      phone: c.phone,
      email: c.email,
      location: { lat: c.latitude, long: c.longitude },
      distance: null,
      duration: null,
      travel_mode: "unknown",
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.centerName, c.city, c.state].filter(Boolean).join(", "))}`,
      google_api_used: false,
    }));
    res.status(200).json({
      status: "partial",
      project_id,
      geocode_failed: true,
      message:
        "Could not geocode pincode — showing all registered centres without distance.",
      total_centers_in_project: totalCentresInProject,
      data: fallbackData,
    });
    return;
  }

  // Try Google Distance Matrix, fall back to Haversine
  let googleApiUsed = false;
  let distanceMap = new Map<
    string,
    {
      distanceMeters: number;
      distanceText: string;
      durationSeconds: number;
      durationText: string;
    }
  >();

  try {
    if (process.env.GOOGLE_MAPS_API_KEY) {
      distanceMap = await getDistancesFromGoogle(
        pincodeLocation,
        centres,
        project_id,
        String(pincode),
      );
      googleApiUsed = distanceMap.size > 0;
    }
  } catch {
    googleApiUsed = false;
  }

  // Build result with distances
  const results: CentreWithDistance[] = centres.map((c) => {
    const googleDist = distanceMap.get(c._id.toString());
    const distMeters = googleDist
      ? googleDist.distanceMeters
      : Math.round(
          haversineDistance(
            pincodeLocation!.lat,
            pincodeLocation!.long,
            c.latitude,
            c.longitude,
          ),
        );

    const distText = googleDist
      ? googleDist.distanceText
      : distMeters >= 1000
        ? `${(distMeters / 1000).toFixed(1)} km`
        : `${distMeters} m`;

    const entry: CentreWithDistance = {
      center_id: c._id.toString(),
      name: c.centerName,
      address: c.address,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
      phone: c.phone,
      email: c.email,
      location: { lat: c.latitude, long: c.longitude },
      distance: { value_meters: distMeters, text: distText },
      travel_mode: "driving",
      maps_url: `https://maps.google.com/?q=${c.latitude},${c.longitude}`,
      google_api_used: googleApiUsed,
    };

    if (googleDist) {
      entry.duration = {
        value_seconds: googleDist.durationSeconds,
        text: googleDist.durationText,
      };
    }

    return entry;
  });

  // Sort by distance ascending, return top N
  results.sort((a, b) => a.distance.value_meters - b.distance.value_meters);

  res.status(200).json({
    status: "success",
    project_id,
    query: {
      pincode,
      pincode_location: pincodeLocation,
    },
    data: results
      .slice(0, limit)
      .map(({ google_api_used: _g, ...rest }) => rest),
    total_centers_in_project: totalCentresInProject,
    google_api_used: googleApiUsed,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/tickets/count — ticket count for the project with optional filters
// ─────────────────────────────────────────────────────────────────────────────
export const getTicketCount = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;
  const projectId = new mongoose.Types.ObjectId(project_id);

  const { status, email, mobile } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { project: projectId };

  if (status !== undefined) {
    const s = parseInt(status, 10);
    if (isNaN(s) || s < 1 || s > 5) {
      return validationError(res, [
        {
          field: "status",
          message: "status must be an integer between 1 and 5",
        },
      ]);
    }
    filter.status = s;
  }

  if (email) {
    filter["metadata.studentEmail"] = {
      $regex: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    };
  }

  if (mobile) {
    const norm = normaliseMobile(mobile);
    if (!norm) {
      return validationError(res, [
        { field: "mobile", message: "Invalid mobile number" },
      ]);
    }
    filter["metadata.studentPhone"] = mobileQuery(norm);
  }

  const count = await Ticket.countDocuments(filter);

  res.json({ status: "success", project_id, count });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/tickets/search — search tickets by email, mobile, status, pagination
// ─────────────────────────────────────────────────────────────────────────────
export const searchTickets = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;
  const projectId = new mongoose.Types.ObjectId(project_id);

  const {
    email,
    mobile,
    status,
    page: rawPage,
    limit: rawLimit,
  } = req.query as Record<string, string>;

  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(rawLimit ?? "20", 10) || 20),
  );
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { project: projectId };

  if (status !== undefined) {
    const s = parseInt(status, 10);
    if (isNaN(s) || s < 1 || s > 5) {
      return validationError(res, [
        {
          field: "status",
          message: "status must be an integer between 1 and 5",
        },
      ]);
    }
    filter.status = s;
  }

  if (email) {
    filter["metadata.studentEmail"] = {
      $regex: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    };
  }

  if (mobile) {
    const norm = normaliseMobile(mobile);
    if (!norm) {
      return validationError(res, [
        { field: "mobile", message: "Invalid mobile number" },
      ]);
    }
    filter["metadata.studentPhone"] = mobileQuery(norm);
  }

  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .select(
        "ticketNumber status createdAt metadata.studentName metadata.studentEmail metadata.studentPhone",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Ticket.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    project_id,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    tickets: tickets.map((t: any) => ({
      ticket_number: t.ticketNumber,
      status: t.status,
      created_at: t.createdAt,
      student_name: t.metadata?.studentName ?? null,
      student_email: t.metadata?.studentEmail ?? null,
      student_phone: t.metadata?.studentPhone ?? null,
    })),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/tickets/by-number/:ticketNumber — full ticket details
// ─────────────────────────────────────────────────────────────────────────────
export const getTicketByNumber = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;
  const projectId = new mongoose.Types.ObjectId(project_id);
  const { ticketNumber } = req.params;

  if (!ticketNumber) {
    return validationError(res, [
      { field: "ticketNumber", message: "Ticket number is required" },
    ]);
  }

  const ticket = await Ticket.findOne({
    ticketNumber,
    project: projectId,
  })
    .populate("assignedTo", "firstName lastName email")
    .populate("category", "name")
    .lean();

  if (!ticket) {
    res.status(404).json({
      status: "error",
      code: "NOT_FOUND",
      message: `Ticket '${ticketNumber}' not found in this project.`,
    });
    return;
  }

  const t = ticket as any;
  res.json({
    status: "success",
    project_id,
    ticket: {
      ticket_number: t.ticketNumber,
      status: t.status,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
      category: t.category?.name ?? null,
      assigned_to: t.assignedTo
        ? {
            name: [t.assignedTo.firstName, t.assignedTo.lastName]
              .filter(Boolean)
              .join(" "),
            email: t.assignedTo.email,
          }
        : null,
      student_name: t.metadata?.studentName ?? null,
      student_email: t.metadata?.studentEmail ?? null,
      student_phone: t.metadata?.studentPhone ?? null,
      message: t.metadata?.message ?? null,
      channel: t.metadata?.channel ?? null,
      custom_fields: t.metadata?.formFields ?? {},
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/users — create or upsert a user in the project
// ─────────────────────────────────────────────────────────────────────────────
export const createPublicUser = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;
  const projectId = new mongoose.Types.ObjectId(project_id);

  const {
    email,
    mobile: rawMobile,
    firstName,
    lastName,
  } = req.body as Record<string, string>;

  const errors: { field: string; message: string }[] = [];
  if (!email) errors.push({ field: "email", message: "email is required" });
  if (errors.length) return validationError(res, errors);

  const emailNorm = email.toLowerCase().trim();
  const normMobile = rawMobile ? normaliseMobile(rawMobile) : null;

  if (rawMobile && !normMobile) {
    return validationError(res, [
      { field: "mobile", message: "Invalid mobile number" },
    ]);
  }

  const update: Record<string, unknown> = {
    $setOnInsert: { createdAt: new Date() },
    $addToSet: { projects: projectId },
  };

  const setFields: Record<string, unknown> = {};
  if (firstName) setFields.firstName = firstName.trim();
  if (lastName) setFields.lastName = lastName.trim();
  if (normMobile) setFields.mobile = normMobile;
  if (Object.keys(setFields).length) update.$set = setFields;

  const user = await User.findOneAndUpdate({ email: emailNorm }, update, {
    new: true,
    upsert: true,
    runValidators: false,
    setDefaultsOnInsert: true,
  }).lean();

  const u = user as any;
  res.status(201).json({
    status: "success",
    project_id,
    user: {
      user_id: u._id.toString(),
      email: u.email,
      first_name: u.firstName ?? null,
      last_name: u.lastName ?? null,
      mobile: u.mobile ?? null,
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/centers — create a centre in the project
// ─────────────────────────────────────────────────────────────────────────────
export const createPublicCenter = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  const project_id = req.publicApiProjectId!;
  const projectId = new mongoose.Types.ObjectId(project_id);

  const {
    centerName,
    address,
    city,
    state,
    pincode,
    phone,
    email,
    latitude,
    longitude,
  } = req.body as Record<string, string>;

  const errors: { field: string; message: string }[] = [];
  if (!centerName)
    errors.push({ field: "centerName", message: "centerName is required" });
  if (!address)
    errors.push({ field: "address", message: "address is required" });
  if (!city) errors.push({ field: "city", message: "city is required" });
  if (!state) errors.push({ field: "state", message: "state is required" });
  if (errors.length) return validationError(res, errors);

  const center = await Center.create({
    projectId,
    centerName: centerName.trim(),
    address: address.trim(),
    city: city.trim(),
    state: state.trim(),
    ...(pincode ? { pincode: pincode.trim() } : {}),
    ...(phone ? { phone: phone.trim() } : {}),
    ...(email ? { email: email.trim() } : {}),
    ...(latitude ? { latitude: parseFloat(latitude) } : {}),
    ...(longitude ? { longitude: parseFloat(longitude) } : {}),
  });

  res.status(201).json({
    status: "success",
    project_id,
    center: {
      center_id: (center as any)._id.toString(),
      center_name: (center as any).centerName,
      address: (center as any).address,
      city: (center as any).city,
      state: (center as any).state,
      pincode: (center as any).pincode ?? null,
      phone: (center as any).phone ?? null,
      email: (center as any).email ?? null,
    },
  });
};
