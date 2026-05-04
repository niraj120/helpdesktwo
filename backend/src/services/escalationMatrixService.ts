import mongoose from "mongoose";
import {
  EscalationMatrix,
  IEscalationMatrix,
  IEscalationLevel,
} from "../models/escalation-matrix";
import { Ticket, ITicket } from "../models/Ticket";
import { User } from "../models/User";
import { Project } from "../models/Project";
import SLATracking from "../models/sla-module/SLATracking";
import JobLog from "../models/JobLog";
import { calculateRoleLevelSLA } from "./slaService";
import { WorkingCalendar } from "../models/WorkingCalendar";
import {
  toObjectId,
  toObjectIdStrict,
  newObjectId,
} from "../utils/objectIdUtils";
import { sendSLAWarningEmail } from "../utils/emailService";

/**
 * Convert slaHours value to milliseconds based on slaUnit
 * slaUnit can be: 'mins', 'minutes', 'hrs', 'hours', 'days'
 */
function slaToMs(slaValue: number, slaUnit?: string): number {
  const unit = slaUnit || "hrs";
  if (unit === "mins" || unit === "minutes") {
    return slaValue * 60 * 1000; // minutes to ms
  } else if (unit === "days") {
    return slaValue * 24 * 60 * 60 * 1000; // days to ms
  } else {
    return slaValue * 60 * 60 * 1000; // hours to ms (default)
  }
}

/**
 * Get active escalation matrix for a project and priority.
 * Category-scoped lookup (US-021): if categoryId is provided and a
 * CategoryEscalationConfig exists for it, that matrix takes precedence.
 * Falls through to priority → project-level fallback otherwise.
 */
export async function getMatrixByProjectId(
  projectId: string,
  priority?: string,
  categoryId?: string,
): Promise<IEscalationMatrix | null> {
  try {
    // US-021: category-specific matrix takes precedence
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      // First: check for a CATEGORY-scoped matrix that directly embeds this categoryId
      const categoryMatrix = await EscalationMatrix.findOne({
        scopeMode: "CATEGORY",
        categoryIds: new mongoose.Types.ObjectId(categoryId),
        projectIds: toObjectIdStrict(projectId, "projectId"),
        isActive: true,
      }).lean();
      if (categoryMatrix) {
        console.log(
          `✅ [Escalation] Using category-scoped matrix for category ${categoryId}: ${(categoryMatrix as any).name}`,
        );
        return categoryMatrix as IEscalationMatrix;
      }

      // Fallback: legacy CategoryEscalationConfig join record
      const CategoryEscalationConfig = (
        await import("../models/ticket-module/CategoryEscalationConfig")
      ).default;
      const catConfig = await (CategoryEscalationConfig as any)
        .findOne({
          categoryId: new mongoose.Types.ObjectId(categoryId),
          isActive: true,
        })
        .populate("escalationMatrixId")
        .lean();
      if (catConfig?.escalationMatrixId) {
        console.log(
          `✅ [Escalation] Using legacy category-config for category ${categoryId}: ${(catConfig.escalationMatrixId as any).name}`,
        );
        return catConfig.escalationMatrixId as IEscalationMatrix;
      }
      console.log(
        `⚠️ [Escalation] No active category-config for ${categoryId}, falling back to project matrix`,
      );
    }

    // First try to find a matrix matching both project and priority
    if (priority) {
      const priorityUpper = priority.toUpperCase();
      const priorityMatrix = await EscalationMatrix.findOne({
        projectIds: toObjectIdStrict(projectId, "projectId"),
        applicablePriorities: priorityUpper,
        isActive: true,
      }).lean();

      if (priorityMatrix) {
        console.log(
          `✅ Found priority-specific matrix for ${priorityUpper}: ${(priorityMatrix as any).name}`,
        );
        return priorityMatrix as IEscalationMatrix;
      }
    }

    // Fallback: find any active matrix for this project (without priority restriction)
    const matrix = await EscalationMatrix.findOne({
      projectIds: toObjectIdStrict(projectId, "projectId"),
      isActive: true,
    }).lean();

    if (matrix) {
      console.log(
        `⚠️ Using fallback matrix (no priority match): ${(matrix as any).name}`,
      );
    }

    return matrix as IEscalationMatrix | null;
  } catch (error) {
    console.error("Error getting escalation matrix by project:", error);
    return null;
  }
}

/**
 * Auto-assign escalation matrix to a ticket based on its project, priority,
 * and optionally a category-specific config (US-021).
 * Should be called during ticket creation.
 */
export async function autoAssignMatrixToTicket(
  ticketId: string | mongoose.Types.ObjectId,
  projectId: string | mongoose.Types.ObjectId,
  ticketPriority?: string,
  categoryId?: string,
): Promise<{ success: boolean; matrixId?: string; message: string }> {
  try {
    // If priority not provided, fetch ticket to get it
    let priority = ticketPriority;
    if (!priority) {
      const existingTicket = await Ticket.findById(ticketId)
        .select("priority")
        .lean();
      priority = existingTicket?.priority;
      console.log(`📋 Fetched ticket priority: ${priority}`);
    }

    const matrix = await getMatrixByProjectId(
      projectId.toString(),
      priority,
      categoryId,
    );

    if (!matrix) {
      return {
        success: false,
        message: "No escalation matrix configured for this project",
      };
    }

    // Sort levels and get the first level
    // Handle both SAME_FOR_ALL and PER_PRIORITY matrices.
    // getEffectiveLevelsByPriority works with lean() objects (no Mongoose methods needed).
    const effectiveLevels: IEscalationLevel[] = getEffectiveLevelsByPriority(
      matrix,
      typeof priority === "string" ? priority : undefined,
    );
    const sortedLevels = [...effectiveLevels]
      .filter((l) => l.isActive)
      .sort((a, b) => a.levelNumber - b.levelNumber);

    if (sortedLevels.length === 0) {
      return {
        success: false,
        message: "No active levels in escalation matrix",
      };
    }

    const now = new Date();

    // Calculate role-level SLA deadline
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    // Detect the correct start level:
    // For OFFLINE tickets, if the creating agent's role maps to a higher level, start there.
    // This handles the case where a Level 2 agent creates an offline ticket directly.
    // For ONLINE tickets, always start at Level 1 regardless of auto-assignment —
    // the auto-assignment pool may include any role and must not inflate the start level.
    let startLevel = sortedLevels[0]; // default: Level 1
    const isOfflineTicket =
      ticket.submissionSource === "offline" ||
      (ticket.metadata as any)?.submissionType === "offline";
    if (ticket.assignedTo && isOfflineTicket) {
      const assignedUser = await User.findById(ticket.assignedTo)
        .select("role")
        .lean();
      if (assignedUser) {
        // Check direct-user assignment first (assigneeType='user')
        const matchedByUser = sortedLevels.find(
          (l) =>
            (l as any).assigneeType === "user" &&
            (l as any).assigneeUserId?.toString() ===
              ticket.assignedTo?.toString(),
        );
        if (matchedByUser) {
          startLevel = matchedByUser;
          console.log(
            `🎯 Assigned agent matches Level ${matchedByUser.levelNumber} (by-user) — starting matrix there instead of Level 1`,
          );
        } else if (assignedUser.role) {
          // Fall back to role-based matching
          const matchedByRole = sortedLevels.find(
            (l) => l.roleId?.toString() === assignedUser.role?.toString(),
          );
          if (matchedByRole) {
            startLevel = matchedByRole;
            console.log(
              `🎯 Assigned agent's role matches Level ${matchedByRole.levelNumber} — starting matrix there instead of Level 1`,
            );
          }
        }
      }
    }

    const ticketCreatedAt = ticket.createdAt || now;

    // Calculate SLA deadline using working calendar if available
    // IMPORTANT: Look up working calendar from project if not set on ticket
    let workingCalendarId = ticket.workingCalendarId;
    if (!workingCalendarId && ticket.metadata?.projectId) {
      const projectCalendar = await WorkingCalendar.findOne({
        projectId:
          typeof ticket.metadata.projectId === "string"
            ? new mongoose.Types.ObjectId(ticket.metadata.projectId)
            : ticket.metadata.projectId,
        isActive: true,
      });
      if (projectCalendar) {
        workingCalendarId = projectCalendar._id as mongoose.Types.ObjectId;
        // Also save it to ticket for future use
        ticket.workingCalendarId = workingCalendarId;
        console.log(
          `📅 Working calendar found for project: ${projectCalendar.name} (${workingCalendarId})`,
        );
      } else {
        console.log(
          `⚠️ No working calendar found for project ${ticket.metadata.projectId} - SLA will use simple time calculation`,
        );
      }
    }

    // CRITICAL: Determine actual SLA start time based on working hours
    // If ticket created outside working hours, SLA starts at next working time
    let escalationStartTime = ticketCreatedAt;
    if (workingCalendarId) {
      const calendar = await WorkingCalendar.findById(workingCalendarId);
      if (calendar && calendar.isActive) {
        if (!calendar.isWorkingTime(ticketCreatedAt)) {
          // Created outside working hours - start SLA at next working time
          escalationStartTime = calendar.getNextWorkingTime(ticketCreatedAt);
          console.log(
            `⏰ Ticket created outside working hours. SLA starts at: ${escalationStartTime.toISOString()} (${escalationStartTime.toLocaleString("en-IN", { timeZone: calendar.timezone || "Asia/Kolkata" })})`,
          );
        } else {
          console.log(
            `✅ Ticket created during working hours. SLA starts immediately.`,
          );
        }
      }
    }

    let roleLevelDueAt: Date;
    try {
      // Use working calendar aware calculation
      const ticketPriorityStr =
        typeof priority === "string" ? priority : "MEDIUM";
      roleLevelDueAt = await calculateRoleLevelSLA(
        escalationStartTime,
        matrix as IEscalationMatrix,
        startLevel.levelNumber,
        ticketPriorityStr,
        workingCalendarId,
      );
    } catch (err) {
      // Fallback to simple calculation - respect slaUnit
      roleLevelDueAt = new Date(
        new Date(escalationStartTime).getTime() +
          slaToMs(startLevel.slaHours, startLevel.slaUnit),
      );
    }

    // Build atomic update fields — avoids overwriting ticketLevelSLA/workingCalendarId
    // set by the concurrent Priority SLA IIFE in ticketController (race condition fix).
    const matrixUpdateFields: Record<string, any> = {
      escalationMatrixId: new mongoose.Types.ObjectId(matrix._id),
      currentEscalationLevelId: startLevel._id,
      currentEscalationLevelNumber: startLevel.levelNumber,
      roleLevelSLA: {
        startedAt: escalationStartTime,
        dueAt: roleLevelDueAt,
        breachedAt: undefined,
        pausedAt: undefined,
        pausedDuration: 0,
      },
    };

    // Include workingCalendarId if we resolved it in this function
    if (workingCalendarId) {
      matrixUpdateFields.workingCalendarId = workingCalendarId;
    }

    // If the start level is a direct-user assignment and the ticket is currently
    // unassigned, assign it to that specific user now.
    if (
      (startLevel as any).assigneeType === "user" &&
      (startLevel as any).assigneeUserId &&
      !ticket.assignedTo
    ) {
      matrixUpdateFields.assignedTo = new mongoose.Types.ObjectId(
        (startLevel as any).assigneeUserId.toString(),
      );
      matrixUpdateFields.assignedVia = "by-user";
      console.log(
        `👤 [Escalation] L${startLevel.levelNumber} is user-type — auto-assigning ticket to user ${(startLevel as any).assigneeUserId}`,
      );
    }

    // If the start level is role-based and the ticket is currently unassigned,
    // pick an agent from that role's user pool via round-robin.
    if (
      (!(startLevel as any).assigneeType ||
        (startLevel as any).assigneeType === "role") &&
      startLevel.roleId &&
      !ticket.assignedTo &&
      !matrixUpdateFields.assignedTo
    ) {
      const roleAgents = await User.find({
        role: startLevel.roleId,
        isActive: true,
      })
        .select("_id")
        .lean();

      if (roleAgents.length > 0) {
        // Round-robin: find which agent was last assigned for this project, pick the next one
        const lastTicket = await Ticket.findOne({
          project: ticket.project,
          assignedTo: { $exists: true, $ne: null },
        })
          .sort({ createdAt: -1 })
          .select("assignedTo")
          .lean();

        let chosenAgent: mongoose.Types.ObjectId;
        if (!lastTicket?.assignedTo) {
          chosenAgent = roleAgents[0]._id as mongoose.Types.ObjectId;
        } else {
          const lastIdx = roleAgents.findIndex(
            (u) => u._id.toString() === lastTicket.assignedTo!.toString(),
          );
          const nextIdx = (lastIdx + 1) % roleAgents.length;
          chosenAgent = roleAgents[nextIdx]._id as mongoose.Types.ObjectId;
        }

        matrixUpdateFields.assignedTo = chosenAgent;
        matrixUpdateFields.assignedVia = "by-role";
        matrixUpdateFields["metadata.assignedVia"] = "by-role";
        matrixUpdateFields["metadata.autoAssigned"] = true;
        console.log(
          `👥 [Escalation] L${startLevel.levelNumber} is role-type — round-robin assigned ticket to agent ${chosenAgent}`,
        );
      } else {
        console.log(
          `⚠️ [Escalation] L${startLevel.levelNumber} role ${startLevel.roleId} has no active users — ticket stays unassigned`,
        );
      }
    }

    await Ticket.updateOne({ _id: ticket._id }, { $set: matrixUpdateFields });

    console.log(
      `🎯 Role-level SLA initialized: L${startLevel.levelNumber} deadline = ${roleLevelDueAt.toISOString()} (${startLevel.slaHours} ${startLevel.slaUnit || "hrs"})`,
    );

    // Also update legacy SLA tracking for backward compatibility
    if (startLevel.slaHours > 0) {
      const resolutionDeadline = new Date(
        new Date(escalationStartTime).getTime() +
          slaToMs(startLevel.slaHours, startLevel.slaUnit),
      );

      await SLATracking.findOneAndUpdate(
        { ticketId: new mongoose.Types.ObjectId(ticketId.toString()) },
        {
          $set: {
            resolutionDeadline: resolutionDeadline,
            currentEscalationLevel: startLevel.levelNumber - 1, // 0-indexed for compatibility
            nextEscalationDue: resolutionDeadline,
          },
          $setOnInsert: {
            ticketId: new mongoose.Types.ObjectId(ticketId.toString()),
            projectId: new mongoose.Types.ObjectId(projectId.toString()),
            responseStatus: "pending",
            resolutionStatus: "pending",
            escalationHistory: [],
            isPaused: false,
            pausedDuration: 0,
          },
        },
        { upsert: true, new: true },
      );

      console.log(
        `✅ Legacy SLA tracking updated with Level ${startLevel.levelNumber} SLA: ${startLevel.slaHours}h`,
      );
    }

    console.log(
      `✅ Auto-assigned escalation matrix "${matrix.name}" to ticket ${ticketId}`,
    );

    return {
      success: true,
      matrixId: matrix._id.toString(),
      message: `Assigned to escalation matrix "${matrix.name}" at level ${startLevel.levelNumber}`,
    };
  } catch (error) {
    console.error("Error auto-assigning escalation matrix:", error);
    return {
      success: false,
      message: `Failed to auto-assign escalation matrix: ${(error as Error).message}`,
    };
  }
}

/**
 * Escalation Validation Service
 *
 * Provides backend validation for escalation operations.
 * This service enforces the following core rules:
 * 1. Escalation must be based on level_number, NOT role names
 * 2. Role names must never be hardcoded
 * 3. Backend validation is mandatory
 * 4. UI restrictions alone are not sufficient
 * 5. System must function even if roles differ across portals
 */

export interface AllowedEscalationLevel {
  levelId: string;
  levelNumber: number;
  levelName: string;
  roleId: string;
  roleName?: string;
  slaHours: number;
  slaUnit?: string; // 'mins', 'hrs', 'days'
  // For de-escalation: the specific previous handler at this level
  previousHandlerId?: string;
  previousHandlerName?: string;
  previousHandlerEmail?: string;
  isDeEscalation?: boolean; // True if this is a backward/de-escalation option
  wasLevelSkipped?: boolean; // True if this level was never handled (no previous handler exists)
  availableUsers?: Array<{ id: string; name: string; email: string }>; // Users from role when level was skipped
}

export interface EscalationValidationResult {
  allowed: boolean;
  reason?: string;
  targetLevel?: AllowedEscalationLevel;
}

export interface EscalationContext {
  ticket: ITicket;
  matrix: IEscalationMatrix;
  currentLevel?: IEscalationLevel;
  currentLevelNumber: number;
}

/**
 * Resolve the effective levels for a ticket from a matrix.
 *
 * For SAME_FOR_ALL matrices this is simply `matrix.levels`.
 * For PER_PRIORITY matrices we try (in order):
 *   1. Exact match on ticket.priority
 *   2. Find the config that contains the ticket's currentEscalationLevelId
 *   3. Find the config that contains the ticket's currentEscalationLevelNumber
 *   4. First available priority config as a last resort
 *
 * This prevents "highest escalation level" false-positives when a ticket's
 * stored priority code doesn't match any configured priority tier.
 */

/**
 * Get effective escalation levels for a priority code.
 * Uses direct property access so it works with both Mongoose documents
 * AND lean() plain objects (which have no instance methods).
 */
function getEffectiveLevelsByPriority(
  matrix: any,
  priority?: string,
): IEscalationLevel[] {
  const allConfigs: any[] = matrix.priorityConfigs || [];

  if (matrix.priorityMode !== "PER_PRIORITY") {
    return matrix.levels || [];
  }

  // Direct property access — no Mongoose method call
  if (priority) {
    const exactConfig = allConfigs.find(
      (c: any) => c.priorityCode === priority.toUpperCase(),
    );
    if (exactConfig && (exactConfig.levels || []).length > 0) {
      return exactConfig.levels;
    }
  }

  // Fallback: first available config
  if (allConfigs.length > 0 && (allConfigs[0].levels || []).length > 0) {
    console.log(
      `⚠️ [Escalation] PER_PRIORITY fallback: priority "${priority}" not matched, using first config "${allConfigs[0].priorityCode}"`,
    );
    return allConfigs[0].levels;
  }

  return [];
}

function getEffectiveLevelsForTicket(
  matrix: IEscalationMatrix,
  ticket: ITicket,
): IEscalationLevel[] {
  if ((matrix as any).priorityMode !== "PER_PRIORITY") {
    return (matrix as any).levels || [];
  }

  const ticketPriority = (ticket as any).priority;

  // 1. Exact priority match (direct property access, works for lean objects)
  const allConfigs: any[] = (matrix as any).priorityConfigs || [];
  if (ticketPriority) {
    const exactConfig = allConfigs.find(
      (c: any) => c.priorityCode === ticketPriority.toUpperCase(),
    );
    if (exactConfig && (exactConfig.levels || []).length > 0) {
      return exactConfig.levels;
    }
  }

  // 2. Find the config whose levels contain the ticket's current level ID
  if (ticket.currentEscalationLevelId) {
    for (const cfg of allConfigs) {
      const found = (cfg.levels || []).find(
        (l: any) =>
          l._id?.toString() === ticket.currentEscalationLevelId?.toString(),
      );
      if (found) {
        console.log(
          `⚠️ [Escalation] PER_PRIORITY fallback: using config "${cfg.priorityCode}" (matched by level ID)`,
        );
        return cfg.levels;
      }
    }
  }

  // 3. Find the config whose levels contain the ticket's current level number
  if (ticket.currentEscalationLevelNumber) {
    for (const cfg of allConfigs) {
      const found = (cfg.levels || []).find(
        (l: any) => l.levelNumber === ticket.currentEscalationLevelNumber,
      );
      if (found) {
        console.log(
          `⚠️ [Escalation] PER_PRIORITY fallback: using config "${cfg.priorityCode}" (matched by level number)`,
        );
        return cfg.levels;
      }
    }
  }

  // 4. Last resort: first available config
  if (allConfigs.length > 0 && (allConfigs[0].levels || []).length > 0) {
    console.log(
      `⚠️ [Escalation] PER_PRIORITY fallback: priority "${ticketPriority}" not found, using first config "${allConfigs[0].priorityCode}"`,
    );
    return allConfigs[0].levels;
  }

  return [];
}

/**
 * Get escalation context for a ticket
 */
export async function getEscalationContext(
  ticketId: string,
): Promise<EscalationContext | null> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return null;
  }

  let resolvedMatrixId = ticket.escalationMatrixId;

  // Fallback: if matrix was never assigned to the ticket (e.g. ticket created before matrix
  // was configured), look it up dynamically by project and patch the ticket for future use.
  if (!resolvedMatrixId) {
    const projectId = (ticket as any).metadata?.projectId;
    if (!projectId) {
      console.log(
        `⚠️ [Escalation] Ticket ${ticketId} has no escalationMatrixId and no metadata.projectId — cannot resolve matrix`,
      );
      return null;
    }
    const fallbackMatrix = await getMatrixByProjectId(
      projectId.toString(),
      (ticket as any).priority,
      (ticket as any).metadata?.categoryId,
    );
    if (!fallbackMatrix) {
      console.log(
        `⚠️ [Escalation] No active EscalationMatrix found for project ${projectId} — ticket ${ticketId} has no matrix`,
      );
      return null;
    }
    resolvedMatrixId = (fallbackMatrix as any)._id;
    // Persist the resolved matrix on the ticket so auto-escalation worker works too
    await Ticket.findByIdAndUpdate(ticketId, {
      $set: { escalationMatrixId: resolvedMatrixId },
    });
    ticket.escalationMatrixId = resolvedMatrixId;
    console.log(
      `✅ [Escalation] Retroactively assigned matrix "${(fallbackMatrix as any).name}" to ticket ${ticketId}`,
    );
  }

  const matrix = await EscalationMatrix.findById(resolvedMatrixId)
    .populate("levels.roleId", "name code")
    .populate("priorityConfigs.levels.roleId", "name code");

  if (!matrix) {
    return null;
  }

  const currentLevelNumber = ticket.currentEscalationLevelNumber || 0;
  let currentLevel: IEscalationLevel | undefined;

  // Resolve all levels across both SAME_FOR_ALL and PER_PRIORITY modes
  // Uses fallback logic for PER_PRIORITY when ticket priority doesn't match any config
  const allMatrixLevels: IEscalationLevel[] = getEffectiveLevelsForTicket(
    matrix,
    ticket,
  );

  if (ticket.currentEscalationLevelId) {
    currentLevel = allMatrixLevels.find(
      (l) => l._id?.toString() === ticket.currentEscalationLevelId?.toString(),
    );
  } else if (currentLevelNumber > 0) {
    currentLevel = allMatrixLevels.find(
      (l) => l.levelNumber === currentLevelNumber,
    );
  }

  return {
    ticket,
    matrix,
    currentLevel,
    currentLevelNumber,
  };
}

/**
 * Get all allowed escalation levels for a ticket
 *
 * Function: getAllowedEscalationLevels(ticket_id)
 *
 * Sequential Mode Logic:
 * - Forward: can only escalate to immediate next level (no skipping)
 * - Backward: only to immediate previous level (if allowBackward is true)
 *
 * Random Mode Logic:
 * - Forward escalation always allowed (unless skip is disabled)
 * - Backward escalation to any level (if allowBackward is true)
 */
export async function getAllowedEscalationLevels(
  ticketId: string,
): Promise<AllowedEscalationLevel[]> {
  try {
    const context = await getEscalationContext(ticketId);
    if (!context) {
      console.log(
        `⚠️ [Escalation] getEscalationContext returned null for ticket ${ticketId}`,
      );
      return [];
    }

    const { matrix, currentLevelNumber, ticket } = context;
    console.log(
      `🔍 [Escalation] ticket=${ticketId} currentLevelNumber=${currentLevelNumber} mode=${matrix.escalationMode} levels=${matrix.levels.length} submissionSource=${(ticket as any).submissionSource}`,
    );
    const allowedLevels: AllowedEscalationLevel[] = [];

    // Helper to find who was the handler at a specific level
    // We look for escalation history where fromLevel = targetLevel (person who escalated FROM that level)
    // OR where toLevelNumber = targetLevel (the person assigned TO that level)
    const findHandlerAtLevel = async (
      targetLevel: number,
    ): Promise<{
      id?: string;
      name?: string;
      email?: string;
      wasActuallyHandled?: boolean;
    }> => {
      const escalationHistory = ticket.escalationHistory || [];

      // Sort by date descending to get most recent first
      const sortedHistory = [...escalationHistory].sort(
        (a, b) =>
          new Date(b.escalatedAt).getTime() - new Date(a.escalatedAt).getTime(),
      );

      // Method 1: Find escalation that happened FROM the target level
      // The escalatedBy is the person who had the ticket at that level
      for (const record of sortedHistory) {
        if (record.fromLevelNumber === targetLevel) {
          const handler = await User.findById(record.escalatedBy).select(
            "firstName lastName email",
          );
          if (handler) {
            return {
              id: handler._id.toString(),
              name: `${handler.firstName || ""} ${handler.lastName || ""}`.trim(),
              email: handler.email,
              wasActuallyHandled: true,
            };
          }
        }
      }

      // Method 2: Find escalation that went TO the target level (the escalatedTo is the assigned agent)
      // This handles cases where an agent was assigned to a level but hasn't escalated yet
      for (const record of sortedHistory) {
        if (record.toLevelNumber === targetLevel && record.escalatedTo) {
          const handler = await User.findById(record.escalatedTo).select(
            "firstName lastName email",
          );
          if (handler) {
            return {
              id: handler._id.toString(),
              name: `${handler.firstName || ""} ${handler.lastName || ""}`.trim(),
              email: handler.email,
              wasActuallyHandled: true,
            };
          }
        }
      }

      // For Level 1: Use the initially assigned agent OR current assignedTo if still at L1
      if (targetLevel === 1) {
        // Check if ticket was initially assigned to someone
        if (ticket.assignedTo && currentLevelNumber !== 1) {
          // Look for the first escalation from L1 - that person was the L1 handler
          const l1Escalation = sortedHistory.find(
            (r) => r.fromLevelNumber === 1,
          );
          if (l1Escalation?.escalatedBy) {
            const handler = await User.findById(
              l1Escalation.escalatedBy,
            ).select("firstName lastName email");
            if (handler) {
              return {
                id: handler._id.toString(),
                name: `${handler.firstName || ""} ${handler.lastName || ""}`.trim(),
                email: handler.email,
                wasActuallyHandled: true,
              };
            }
          }
        }

        // Fallback for L1 - use current assignedTo (they were the L1 handler even if metadata is incomplete)
        if (ticket.assignedTo) {
          const handler = await User.findById(ticket.assignedTo).select(
            "firstName lastName email",
          );
          if (handler) {
            return {
              id: handler._id.toString(),
              name: `${handler.firstName || ""} ${handler.lastName || ""}`.trim(),
              email: handler.email,
              wasActuallyHandled: true,
            };
          }
        }
      }

      // If we reach here, this level was SKIPPED (never had a handler)
      // Return empty - frontend should show "available agents" from this level's role
      console.log(
        `⚠️ Level ${targetLevel} was skipped - no previous handler exists`,
      );
      return { wasActuallyHandled: false };
    };

    // Sort levels by levelNumber
    // Handle both SAME_FOR_ALL and PER_PRIORITY matrices, with fallback for unknown priorities
    const effectiveLevelsForAllowed: IEscalationLevel[] =
      getEffectiveLevelsForTicket(matrix, ticket);
    const sortedLevels = [...effectiveLevelsForAllowed]
      .filter((l) => l.isActive)
      .sort((a, b) => a.levelNumber - b.levelNumber);

    if (sortedLevels.length === 0) {
      console.log(
        `⚠️ [Escalation] No active levels in matrix for ticket ${ticketId}`,
      );
      return [];
    }
    console.log(
      `🔍 [Escalation] sortedLevels=[${sortedLevels.map((l) => l.levelNumber).join(",")}] currentLevelNumber=${currentLevelNumber}`,
    );

    if (matrix.escalationMode === "SEQUENTIAL") {
      // SEQUENTIAL mode: Only allow immediate next level (forward)
      const nextLevel = sortedLevels.find(
        (l) => l.levelNumber === currentLevelNumber + 1,
      );

      if (nextLevel) {
        const roleData = nextLevel.roleId as any;
        // Handle both populated and non-populated roleId
        const roleIdStr =
          roleData?._id?.toString() || roleData?.toString() || "";
        allowedLevels.push({
          levelId: nextLevel._id?.toString() || "",
          levelNumber: nextLevel.levelNumber,
          levelName: nextLevel.levelName,
          roleId: roleIdStr,
          roleName: roleData?.name || undefined,
          slaHours: nextLevel.slaHours,
          slaUnit: nextLevel.slaUnit || "hrs",
        });
      }

      // SEQUENTIAL mode: Also allow immediate previous level (backward) if allowBackward is true
      // In SEQUENTIAL mode, levels are never skipped, so previous level always has a handler
      if (matrix.allowBackward && currentLevelNumber > 1) {
        const prevLevel = sortedLevels.find(
          (l) => l.levelNumber === currentLevelNumber - 1,
        );

        if (prevLevel) {
          const roleData = prevLevel.roleId as any;
          // Handle both populated and non-populated roleId
          const roleIdStr =
            roleData?._id?.toString() || roleData?.toString() || "";

          // Find who was the handler at this specific level
          const handler = await findHandlerAtLevel(prevLevel.levelNumber);

          allowedLevels.push({
            levelId: prevLevel._id?.toString() || "",
            levelNumber: prevLevel.levelNumber,
            levelName: prevLevel.levelName,
            roleId: roleIdStr,
            roleName: roleData?.name || undefined,
            slaHours: prevLevel.slaHours,
            slaUnit: prevLevel.slaUnit || "hrs",
            isDeEscalation: true, // Mark as de-escalation
            previousHandlerId: handler.id,
            previousHandlerName: handler.name,
            previousHandlerEmail: handler.email,
          });
        }
      }
    } else {
      // RANDOM mode: Allow based on configuration
      for (const level of sortedLevels) {
        if (level.levelNumber === currentLevelNumber) {
          // Cannot escalate to same level
          continue;
        }

        if (level.levelNumber > currentLevelNumber) {
          // Forward escalation
          if (
            !matrix.allowSkipLevel &&
            level.levelNumber > currentLevelNumber + 1
          ) {
            // Skip level not allowed - only add immediate next
            if (allowedLevels.length === 0) {
              const roleData = level.roleId as any;
              // Handle both populated and non-populated roleId
              const roleIdStr =
                roleData?._id?.toString() || roleData?.toString() || "";
              allowedLevels.push({
                levelId: level._id?.toString() || "",
                levelNumber: level.levelNumber,
                levelName: level.levelName,
                roleId: roleIdStr,
                roleName: roleData?.name || undefined,
                slaHours: level.slaHours,
                slaUnit: level.slaUnit || "hrs",
              });
            }
          } else {
            // Add all forward levels
            const roleData = level.roleId as any;
            // Handle both populated and non-populated roleId
            const roleIdStr =
              roleData?._id?.toString() || roleData?.toString() || "";
            allowedLevels.push({
              levelId: level._id?.toString() || "",
              levelNumber: level.levelNumber,
              levelName: level.levelName,
              roleId: roleIdStr,
              roleName: roleData?.name || undefined,
              slaHours: level.slaHours,
              slaUnit: level.slaUnit || "hrs",
            });
          }
        } else if (
          level.levelNumber < currentLevelNumber &&
          matrix.allowBackward
        ) {
          // Backward escalation allowed
          const roleData = level.roleId as any;
          // Handle both populated and non-populated roleId
          const roleIdStr =
            roleData?._id?.toString() || roleData?.toString() || "";

          // Find who was the handler at this specific level
          const handler = await findHandlerAtLevel(level.levelNumber);

          // If level was skipped, get available users from role
          let availableUsers:
            | Array<{ id: string; name: string; email: string }>
            | undefined;
          if (!handler.wasActuallyHandled && roleIdStr) {
            const usersWithRole = await User.find({
              roleId: toObjectIdStrict(roleIdStr, "roleId"),
              isActive: true,
            })
              .select("firstName lastName email")
              .lean();
            availableUsers = usersWithRole.map((u) => ({
              id: u._id.toString(),
              name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
              email: u.email,
            }));
          }

          allowedLevels.push({
            levelId: level._id?.toString() || "",
            levelNumber: level.levelNumber,
            levelName: level.levelName,
            roleId: roleIdStr,
            roleName: roleData?.name || undefined,
            slaHours: level.slaHours,
            slaUnit: level.slaUnit || "hrs",
            isDeEscalation: true, // Mark as de-escalation
            // Use the handler who was at THIS specific level (if level was handled)
            previousHandlerId: handler.wasActuallyHandled
              ? handler.id
              : undefined,
            previousHandlerName: handler.wasActuallyHandled
              ? handler.name
              : undefined,
            previousHandlerEmail: handler.wasActuallyHandled
              ? handler.email
              : undefined,
            wasLevelSkipped: !handler.wasActuallyHandled,
            availableUsers,
          });
        }
      }
    }

    // Sort by level number for consistent ordering
    return allowedLevels.sort((a, b) => a.levelNumber - b.levelNumber);
  } catch (err: any) {
    console.error(
      `❌ [Escalation] getAllowedEscalationLevels failed for ticket ${ticketId}:`,
      err.message,
    );
    throw err; // Re-throw so the controller can return a proper error response
  }
}

/**
 * Validate if escalation to a target level is allowed
 *
 * Function: validateEscalation(ticket_id, target_level_id)
 *
 * This validation must run before any ticket update.
 */
export async function validateEscalation(
  ticketId: string,
  targetLevelId: string,
): Promise<EscalationValidationResult> {
  const allowedLevels = await getAllowedEscalationLevels(ticketId);

  const targetLevel = allowedLevels.find(
    (level) => level.levelId === targetLevelId,
  );

  if (!targetLevel) {
    return {
      allowed: false,
      reason: "Escalation not permitted as per matrix rules",
    };
  }

  return {
    allowed: true,
    targetLevel,
  };
}

/**
 * Validate escalation by target level number (alternative validation method)
 */
export async function validateEscalationByLevelNumber(
  ticketId: string,
  targetLevelNumber: number,
): Promise<EscalationValidationResult> {
  const allowedLevels = await getAllowedEscalationLevels(ticketId);

  const targetLevel = allowedLevels.find(
    (level) => level.levelNumber === targetLevelNumber,
  );

  if (!targetLevel) {
    return {
      allowed: false,
      reason: "Escalation not permitted as per matrix rules",
    };
  }

  return {
    allowed: true,
    targetLevel,
  };
}

/**
 * Execute escalation for a ticket
 *
 * Function: escalateTicket(ticket_id, target_level_id)
 *
 * Steps:
 * 1. Validate escalation
 * 2. Update ticket.current_level_id
 * 3. Get role_id from target level
 * 4. Assign ticket to users belonging to that role (or specific user if targetUserId provided)
 */
export async function executeEscalation(
  ticketId: string,
  targetLevelId: string,
  escalatedBy: string,
  reason: string,
  targetUserId?: string, // Optional: specific user to assign to
): Promise<{
  success: boolean;
  message: string;
  ticket?: ITicket;
  assignedUser?: any;
}> {
  // Step 1: Validate escalation
  const validation = await validateEscalation(ticketId, targetLevelId);
  if (!validation.allowed) {
    return {
      success: false,
      message: validation.reason || "Escalation not permitted",
    };
  }

  if (!validation.targetLevel) {
    return {
      success: false,
      message: "Target level not found",
    };
  }

  const context = await getEscalationContext(ticketId);
  if (!context) {
    return {
      success: false,
      message: "Ticket or escalation matrix not found",
    };
  }

  const { ticket, matrix } = context;
  const targetLevel = validation.targetLevel;
  const currentLevelNumber = ticket.currentEscalationLevelNumber || 0;
  const isDeEscalation = targetLevel.levelNumber < currentLevelNumber;

  let assignedUser: any = null;

  // If a specific targetUserId is provided, use that user
  if (targetUserId) {
    console.log(`👤 Specific user requested for assignment: ${targetUserId}`);
    const specificUser = await User.findById(targetUserId).select(
      "firstName lastName email isActive role",
    );

    if (specificUser && specificUser.isActive) {
      // Verify the user has the correct role for this level
      if (specificUser.role?.toString() === targetLevel.roleId?.toString()) {
        assignedUser = specificUser;
        console.log(
          `✅ Using specified user: ${specificUser.firstName} ${specificUser.lastName}`,
        );
      } else {
        console.log(
          `⚠️ Specified user has different role (${specificUser.role}) than level role (${targetLevel.roleId}), but proceeding anyway`,
        );
        assignedUser = specificUser;
      }
    } else {
      console.log(`⚠️ Specified user not found or inactive: ${targetUserId}`);
    }
  }

  // For de-escalation, try to find the previous handler at the target level
  if (
    !assignedUser &&
    isDeEscalation &&
    ticket.escalationHistory &&
    ticket.escalationHistory.length > 0
  ) {
    console.log(
      `📥 De-escalation to Level ${targetLevel.levelNumber}, searching for previous handler...`,
    );

    // Strategy 1: Find escalation record with fromLevelNumber matching target (new format)
    const relevantEscalation = [...ticket.escalationHistory]
      .reverse()
      .find(
        (record: any) => record.fromLevelNumber === targetLevel.levelNumber,
      );

    if (relevantEscalation?.previousAssignee) {
      const prevUserId = relevantEscalation.previousAssignee;
      const prevUser = await User.findById(prevUserId).select(
        "firstName lastName email isActive",
      );

      if (prevUser && prevUser.isActive) {
        assignedUser = prevUser;
        console.log(
          `📥 De-escalation: Found previous handler from history - ${prevUser.firstName} ${prevUser.lastName}`,
        );
      }
    }

    // Strategy 2: For Level 1 de-escalation with old records, the first escalatedBy is the L1 handler
    if (!assignedUser && targetLevel.levelNumber === 1) {
      // Find the first escalation record - the escalatedBy was the original L1 handler
      const firstEscalation = ticket.escalationHistory[0] as any;
      if (firstEscalation?.escalatedBy) {
        const escalatorId =
          firstEscalation.escalatedBy._id || firstEscalation.escalatedBy;
        const escalator = await User.findById(escalatorId).select(
          "firstName lastName email isActive",
        );

        if (escalator && escalator.isActive) {
          assignedUser = escalator;
          console.log(
            `📥 De-escalation: Using original L1 handler (from first escalation) - ${escalator.firstName} ${escalator.lastName}`,
          );
        }
      }
    }

    // Strategy 3: For other levels, look for escalatedBy who has the target level's role
    if (!assignedUser) {
      for (const record of [...ticket.escalationHistory].reverse()) {
        const rec = record as any;
        if (rec.escalatedBy) {
          const escalatorId = rec.escalatedBy._id || rec.escalatedBy;
          const escalator = await User.findById(escalatorId)
            .select("firstName lastName email role isActive")
            .lean();

          if (
            escalator &&
            escalator.isActive &&
            escalator.role?.toString() === targetLevel.roleId?.toString()
          ) {
            assignedUser = escalator;
            console.log(
              `📥 De-escalation: Found handler by role match - ${escalator.firstName} ${escalator.lastName}`,
            );
            break;
          }
        }
      }
    }
  }

  // If no previous handler found (or forward escalation), assign based on level type
  if (!assignedUser) {
    // Case A: Level is assigned to a specific user (assigneeType === 'user')
    if (
      (targetLevel as any).assigneeType === "user" &&
      (targetLevel as any).assigneeUserId
    ) {
      console.log(
        `👤 Direct user assignment from level config (Level ${targetLevel.levelNumber})`,
      );
      const directUser = await User.findById(
        (targetLevel as any).assigneeUserId,
      ).select("firstName lastName email isActive role");

      if (!directUser || !directUser.isActive) {
        return {
          success: false,
          message: `The assigned user for level "${targetLevel.levelName}" is inactive or not found`,
        };
      }

      assignedUser = directUser;
      console.log(
        `✅ Assigned to level-configured user: ${directUser.firstName} ${directUser.lastName}`,
      );
    } else {
      // Case B: Role-based round-robin assignment
      console.log(
        `📤 ${isDeEscalation ? "No previous handler found, using" : "Forward escalation, using"} round-robin assignment`,
      );

      // Guard: cannot query by role without a valid roleId
      if (!targetLevel.roleId) {
        return {
          success: false,
          message: "Escalation level has no role configured for round-robin assignment",
        };
      }

    // Build user query
    const userQuery: any = {
      role: new mongoose.Types.ObjectId(targetLevel.roleId),
      isActive: true,
    };

    // Filter by project if ticket has one
    if (ticket.project) {
      userQuery.$or = [
        { projects: { $in: [ticket.project] } },
        { projects: { $size: 0 } }, // Users with no project restriction
      ];
    }

    // Filter by center for offline tickets
    // Note: centerId of "online" is a sentinel string for online tickets, not a real ObjectId
    const ticketCenterId = (ticket as any).metadata?.centerId;
    const isValidCenterId = ticketCenterId && ticketCenterId !== "online";
    const isOfflineTicket =
      ticket.submissionSource === "offline" || !!isValidCenterId;
    if (isOfflineTicket && isValidCenterId) {
      userQuery.centers = { $in: [ticketCenterId] };
      console.log(
        `📍 Filtering escalation users by ticket center: ${ticketCenterId}`,
      );
    }

    // Step 2: Find users belonging to the target role
    // Use round-robin or notify all depending on configuration
    const usersInRole = await User.find(userQuery).sort({
      "assignments.lastAssignedAt": 1,
    }); // Round-robin: least recently assigned first

    if (usersInRole.length === 0) {
      return {
        success: false,
        message: `No active users found for the target escalation level (${targetLevel.levelName})${isOfflineTicket ? " in the same center" : ""}`,
      };
    }

    // Select user for assignment (round-robin: first user in sorted list)
    assignedUser = usersInRole[0];
    } // end Case B (role-based round-robin)
  }

  // Safety guard — TypeScript control-flow narrowing: both Case A and Case B either
  // return early or set assignedUser, so this branch is never actually reached at runtime.
  if (!assignedUser) {
    return { success: false, message: "Could not determine assignment target for this escalation level" };
  }

  // Step 3: Update ticket
  const oldAssignedTo = ticket.assignedTo;
  const oldLevelNumber = ticket.currentEscalationLevelNumber || 0;

  // Find the old level name from the matrix
  const oldLevel = matrix.levels.find((l) => l.levelNumber === oldLevelNumber);
  const oldLevelName = oldLevel?.levelName || `Level ${oldLevelNumber}`;

  ticket.currentEscalationLevelId = new mongoose.Types.ObjectId(
    targetLevel.levelId,
  );
  ticket.currentEscalationLevelNumber = targetLevel.levelNumber;
  ticket.assignedTo = assignedUser._id;

  // Add to escalation history with level tracking info for de-escalation support
  if (!ticket.escalationHistory) {
    ticket.escalationHistory = [];
  }

  ticket.escalationHistory.push({
    _id: new mongoose.Types.ObjectId(),
    escalatedTo: assignedUser._id,
    escalatedBy: new mongoose.Types.ObjectId(escalatedBy),
    reason: reason,
    escalatedAt: new Date(),
    // Level tracking for proper de-escalation
    fromLevelNumber: oldLevelNumber,
    toLevelNumber: targetLevel.levelNumber,
    fromLevelName: oldLevelName,
    toLevelName: targetLevel.levelName,
    // Store the previous assignee so we can re-assign to them during de-escalation
    previousAssignee: oldAssignedTo,
  } as any);

  // Track change in change history
  if (!ticket.changeHistory) {
    ticket.changeHistory = [];
  }

  ticket.changeHistory.push({
    _id: new mongoose.Types.ObjectId(),
    field: "escalationLevel",
    oldValue: `Level ${oldLevelNumber}`,
    newValue: `Level ${targetLevel.levelNumber} (${targetLevel.levelName})`,
    changedBy: new mongoose.Types.ObjectId(escalatedBy),
    changedAt: new Date(),
    changeType: "update",
  } as any);

  // Step 4: Update role-level SLA on ticket (CRITICAL for auto-escalation)
  // Reset the deadline based on current time + new level's SLA
  if (targetLevel.slaHours > 0) {
    const now = new Date();
    const newRoleLevelDeadline = new Date(
      now.getTime() + slaToMs(targetLevel.slaHours, targetLevel.slaUnit),
    );

    // Update roleLevelSLA on ticket (used by auto-escalation worker)
    ticket.roleLevelSLA = {
      startedAt: now,
      dueAt: newRoleLevelDeadline,
      breachedAt: undefined,
      pausedAt: undefined,
      pausedDuration: 0,
    };

    console.log(
      `✅ Role-level SLA reset for Level ${targetLevel.levelNumber}: deadline = ${newRoleLevelDeadline.toISOString()} (${targetLevel.slaHours} ${targetLevel.slaUnit || "hrs"})`,
    );
  }

  await ticket.save();

  // Step 5: Update legacy SLA tracking with new level's SLA hours
  if (targetLevel.slaHours > 0) {
    const now = new Date();
    const newResolutionDeadline = new Date(
      now.getTime() + slaToMs(targetLevel.slaHours, targetLevel.slaUnit),
    );

    await SLATracking.findOneAndUpdate(
      { ticketId: ticket._id },
      {
        $set: {
          resolutionDeadline: newResolutionDeadline,
          currentEscalationLevel: targetLevel.levelNumber - 1, // 0-indexed for compatibility
          nextEscalationDue: newResolutionDeadline,
        },
        $push: {
          escalationHistory: {
            escalatedAt: now,
            fromLevel: oldLevelNumber,
            toLevel: targetLevel.levelNumber,
            escalatedBy: new mongoose.Types.ObjectId(escalatedBy),
          },
        },
      },
      { upsert: false },
    );

    console.log(
      `✅ SLA deadline reset for escalation to Level ${targetLevel.levelNumber}: ${targetLevel.slaHours}h from now, new deadline: ${newResolutionDeadline.toISOString()}`,
    );
  }

  return {
    success: true,
    message: `Ticket escalated to ${targetLevel.levelName} and assigned to ${assignedUser.firstName} ${assignedUser.lastName}`,
    ticket,
    assignedUser,
  };
}

/**
 * Get users available for a specific escalation level
 */
export async function getUsersForLevel(
  matrixId: string,
  levelId: string,
  projectId?: string,
): Promise<any[]> {
  const matrix = await EscalationMatrix.findById(matrixId);
  if (!matrix) {
    return [];
  }

  const level = matrix.levels.find((l) => l._id?.toString() === levelId);
  if (!level) {
    return [];
  }

  const query: any = {
    role: level.roleId,
    isActive: true,
  };

  if (projectId) {
    query.$or = [
      { projects: { $in: [new mongoose.Types.ObjectId(projectId)] } },
      { projects: { $size: 0 } },
    ];
  }

  // Include centers in selection for center-based filtering (offline projects)
  return User.find(query)
    .select("firstName lastName email centers")
    .populate("role", "name code")
    .lean();
}

/**
 * Assign escalation matrix to a ticket
 */
export async function assignMatrixToTicket(
  ticketId: string,
  matrixId: string,
  startAtLevel?: number,
): Promise<{ success: boolean; message: string }> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return { success: false, message: "Ticket not found" };
  }

  const matrix = await EscalationMatrix.findById(matrixId);
  if (!matrix || !matrix.isActive) {
    return {
      success: false,
      message: "Escalation matrix not found or inactive",
    };
  }

  // Sort levels and get the starting level
  // Handle both SAME_FOR_ALL and PER_PRIORITY matrices.
  // getEffectiveLevelsByPriority works with non-lean Mongoose docs too.
  const effectiveLevelsForAssign: IEscalationLevel[] =
    getEffectiveLevelsByPriority(matrix, (ticket as any).priority);
  const sortedLevels = [...effectiveLevelsForAssign]
    .filter((l) => l.isActive)
    .sort((a, b) => a.levelNumber - b.levelNumber);

  if (sortedLevels.length === 0) {
    return { success: false, message: "No active levels in the matrix" };
  }

  // Find the starting level
  let startLevel: IEscalationLevel;
  if (startAtLevel !== undefined) {
    const found = sortedLevels.find((l) => l.levelNumber === startAtLevel);
    if (!found) {
      return {
        success: false,
        message: `Level ${startAtLevel} not found in matrix`,
      };
    }
    startLevel = found;
  } else {
    // Start at the first level
    startLevel = sortedLevels[0];
  }

  const now = new Date();

  // Resolve working calendar (from ticket or project)
  let workingCalendarId = ticket.workingCalendarId;
  if (!workingCalendarId && ticket.metadata?.projectId) {
    const projectCalendar = await WorkingCalendar.findOne({
      projectId:
        typeof ticket.metadata.projectId === "string"
          ? new mongoose.Types.ObjectId(ticket.metadata.projectId)
          : ticket.metadata.projectId,
      isActive: true,
    });
    if (projectCalendar) {
      workingCalendarId = projectCalendar._id as mongoose.Types.ObjectId;
    }
  }

  // Determine effective SLA start time (skip non-working hours)
  let slaStartTime: Date = now;
  if (workingCalendarId) {
    const calendar = await WorkingCalendar.findById(workingCalendarId);
    if (calendar?.isActive && !calendar.isWorkingTime(now)) {
      slaStartTime = calendar.getNextWorkingTime(now);
    }
  }

  // Calculate L1 SLA deadline
  let roleLevelDueAt: Date;
  try {
    roleLevelDueAt = await calculateRoleLevelSLA(
      slaStartTime,
      matrix as IEscalationMatrix,
      startLevel.levelNumber,
      (ticket as any).priority || "MEDIUM",
      workingCalendarId,
    );
  } catch {
    roleLevelDueAt = new Date(
      slaStartTime.getTime() + slaToMs(startLevel.slaHours, startLevel.slaUnit),
    );
  }

  const matrixUpdateFields: Record<string, any> = {
    escalationMatrixId: new mongoose.Types.ObjectId(matrixId),
    currentEscalationLevelId: startLevel._id,
    currentEscalationLevelNumber: startLevel.levelNumber,
    roleLevelSLA: {
      startedAt: slaStartTime,
      dueAt: roleLevelDueAt,
      breachedAt: undefined,
      pausedAt: undefined,
      pausedDuration: 0,
    },
  };

  if (workingCalendarId) {
    matrixUpdateFields.workingCalendarId = workingCalendarId;
  }

  // Auto-assign to specific user if the start level designates one
  if (
    (startLevel as any).assigneeType === "user" &&
    (startLevel as any).assigneeUserId &&
    !ticket.assignedTo
  ) {
    matrixUpdateFields.assignedTo = new mongoose.Types.ObjectId(
      (startLevel as any).assigneeUserId.toString(),
    );
    console.log(
      `👤 [Escalation] L${startLevel.levelNumber} is user-type — auto-assigning ticket to user ${(startLevel as any).assigneeUserId}`,
    );
  }

  await Ticket.updateOne({ _id: ticket._id }, { $set: matrixUpdateFields });

  console.log(
    `🎯 [Escalation] Matrix "${matrix.name}" manually assigned at L${startLevel.levelNumber}, SLA due ${roleLevelDueAt.toISOString()}`,
  );

  return {
    success: true,
    message: `Ticket assigned to escalation matrix "${matrix.name}" at level ${startLevel.levelNumber}`,
  };
}

/**
 * Check and process auto-escalation for SLA breached tickets
 * This function should be called by a scheduled job (e.g., every 5 minutes)
 *
 * Logic:
 * 1. Find tickets with escalation matrix that has autoEscalate enabled
 * 2. Check if current level SLA has been breached
 * 3. If breached, auto-escalate to next level (sequential behavior)
 */
export async function processAutoEscalation(): Promise<{
  processed: number;
  escalated: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    escalated: 0,
    skipped: 0,
    errors: [] as string[],
  };
  const jobStartMs = Date.now();

  try {
    // Find all matrices that have auto-escalation enabled.
    // We use $ne: false so that:
    //   - Matrices with autoEscalate: true   → included (explicit enable)
    //   - Matrices with autoEscalate: null/undefined → included (legacy, default-on)
    //   - Matrices with autoEscalate: false  → excluded  (explicit disable)
    const autoEscalateMatrices = await EscalationMatrix.find({
      isActive: true,
      autoEscalate: { $ne: false },
    });

    if (autoEscalateMatrices.length === 0) {
      return result;
    }

    const matrixIds = autoEscalateMatrices.map((m) => m._id);

    // Find open tickets with these matrices.
    // Use closedAt absence as the primary guard so that projects with custom
    // isClosed status codes (anything other than 4/5) are also excluded.
    const tickets = await Ticket.find({
      escalationMatrixId: { $in: matrixIds },
      status: { $in: [1, 2, 3] },
      closedAt: { $exists: false }, // safety net for custom close status codes
    });

    for (const ticket of tickets) {
      result.processed++;

      try {
        const matrix = autoEscalateMatrices.find(
          (m) => m._id.toString() === ticket.escalationMatrixId?.toString(),
        );

        if (!matrix) continue;

        const currentLevelNumber = ticket.currentEscalationLevelNumber || 1;

        // Use lean-safe helper — works with both Mongoose docs and plain objects.
        const levelsForPriority: IEscalationLevel[] =
          getEffectiveLevelsByPriority(matrix, ticket.priority);

        const currentLevel = levelsForPriority.find(
          (l) => l.levelNumber === currentLevelNumber && l.isActive,
        );

        if (!currentLevel) {
          console.log(
            `⚠️  [AUTO-ESC] Ticket ${ticket.ticketNumber}: No active level ${currentLevelNumber} found in matrix "${matrix.name}" ` +
              `(priorityMode=${matrix.priorityMode}, priority=${ticket.priority}, levelsCount=${levelsForPriority.length})`,
          );
          continue;
        }

        // Check if role-level SLA is paused
        if (ticket.roleLevelSLA?.pausedAt) {
          console.log(
            `⏸️  Ticket ${ticket.ticketNumber}: Role-level SLA is paused, skipping`,
          );
          continue;
        }

        // US-ESC-013: Grace period — skip tickets recently updated (agent is mid-response)
        if (!(matrix as any).bypassGracePeriod) {
          const projectDoc = ticket.metadata?.projectId
            ? await Project.findById(
                typeof ticket.metadata.projectId === "string"
                  ? ticket.metadata.projectId
                  : (ticket.metadata.projectId as any)?._id,
              ).select("configuration.ticketAssignmentSettings")
            : null;
          const graceMins =
            (projectDoc as any)?.configuration?.ticketAssignmentSettings
              ?.autoEscalateGracePeriodMins ?? 2;
          const updatedAt = (ticket as any).updatedAt as Date | undefined;
          if (updatedAt) {
            const now2 = new Date();
            const msSinceUpdate = now2.getTime() - updatedAt.getTime();
            if (msSinceUpdate < graceMins * 60 * 1000) {
              console.log(
                `⏳ [AUTO-ESC] Ticket ${ticket.ticketNumber}: Updated ${Math.round(msSinceUpdate / 60000)}m ago — within grace period (${graceMins}m), skipping`,
              );
              result.skipped++;
              continue;
            }
          }
        }

        // Check if role-level SLA has been breached using roleLevelSLA.dueAt
        const now = new Date();
        let slaBreach = false;
        let slaSource = "unknown";

        // US-ESC-007: % threshold mode — trigger when X% of ticket-level SLA is consumed
        const levelThresholdType = (currentLevel as any).slaThresholdType as
          | string
          | undefined;
        const levelThresholdPct = (currentLevel as any).slaThresholdPercent as
          | number
          | undefined;
        if (levelThresholdType === "percent" && levelThresholdPct != null) {
          // Determine total ticket SLA window
          const ticketDueAt =
            ticket.ticketLevelSLA?.dueAt ?? ticket.roleLevelSLA?.dueAt;
          const ticketCreatedAt = ticket.createdAt;
          if (ticketDueAt && ticketCreatedAt) {
            const totalSlaMs =
              new Date(ticketDueAt).getTime() - ticketCreatedAt.getTime();
            const elapsedMs = now.getTime() - ticketCreatedAt.getTime();
            const consumedPct =
              totalSlaMs > 0 ? (elapsedMs / totalSlaMs) * 100 : 0;
            slaBreach = consumedPct >= levelThresholdPct;
            slaSource = `percentThreshold=${levelThresholdPct}% consumed=${Math.round(consumedPct)}%`;
            console.log(
              `📊 [AUTO-ESC] Ticket ${ticket.ticketNumber}: SLA ${Math.round(consumedPct)}% consumed (threshold ${levelThresholdPct}%) — breach=${slaBreach}`,
            );
          }
          // If we can't determine total SLA, fall through to standard check
          if (slaSource === "unknown") {
            console.log(
              `⚠️  [AUTO-ESC] Ticket ${ticket.ticketNumber}: % threshold configured but no ticketLevelSLA.dueAt — falling back to fixed check`,
            );
          }
        }

        // Standard fixed-duration check (slaThresholdType='fixed' or unset)
        if (slaSource === "unknown") {
          // Use roleLevelSLA.dueAt as the primary source for role-level escalation
          if (ticket.roleLevelSLA?.dueAt) {
            slaBreach = now > new Date(ticket.roleLevelSLA.dueAt);
            slaSource = `roleLevelSLA.dueAt=${ticket.roleLevelSLA.dueAt}`;
            if (slaBreach) {
              console.log(
                `⏰ [AUTO-ESC] Ticket ${ticket.ticketNumber}: Role-level SLA breached (dueAt: ${ticket.roleLevelSLA.dueAt})`,
              );
            } else {
              const minsLeft = Math.round(
                (new Date(ticket.roleLevelSLA.dueAt).getTime() -
                  now.getTime()) /
                  60000,
              );
              console.log(
                `✅ [AUTO-ESC] Ticket ${ticket.ticketNumber}: SLA OK, ${minsLeft} min(s) remaining`,
              );
            }
          } else {
            // BUG FIX: roleLevelSLA not set (older ticket or auto-assign didn't run).
            // Fallback 1: Check legacy SLATracking model
            const slaTracking = await SLATracking.findOne({
              ticketId: ticket._id,
            });
            if (slaTracking?.resolutionDeadline) {
              slaBreach = now > slaTracking.resolutionDeadline;
              slaSource = `SLATracking.resolutionDeadline=${slaTracking.resolutionDeadline}`;
            } else {
              // Fallback 2: Use roleLevelSLA.startedAt if available (more accurate than createdAt for escalated tickets).
              // Only fall back to createdAt if at level 1 to avoid false positives.
              const slaStartTime =
                currentLevelNumber === 1
                  ? ticket.createdAt
                  : ticket.roleLevelSLA?.startedAt || ticket.createdAt;
              const slaDeadline = new Date(
                slaStartTime.getTime() +
                  slaToMs(currentLevel.slaHours, currentLevel.slaUnit),
              );
              slaBreach = now > slaDeadline;
              slaSource = `fallback from ${slaStartTime.toISOString()} + ${currentLevel.slaHours}${currentLevel.slaUnit || "hrs"}`;
              console.log(
                `⚠️  [AUTO-ESC] Ticket ${ticket.ticketNumber}: roleLevelSLA missing, using fallback SLA source (${slaSource})`,
              );
            }
          }
        } // end: standard fixed-time SLA check (slaSource === 'unknown')

        if (!slaBreach) {
          // SLA not breached yet
          continue;
        }

        // SLA breached - find next level (sequential behavior for auto-escalation)
        // BUG FIX: Use levelsForPriority (already resolved above) not matrix.levels
        const sortedLevels = [...levelsForPriority]
          .filter((l) => l.isActive)
          .sort((a, b) => a.levelNumber - b.levelNumber);

        const nextLevel = sortedLevels.find(
          (l) => l.levelNumber === currentLevelNumber + 1,
        );

        if (!nextLevel) {
          // Already at highest level, can't escalate further
          console.log(
            `ℹ️  [AUTO-ESC] Ticket ${ticket.ticketNumber}: Already at highest level (L${currentLevelNumber}), cannot auto-escalate further`,
          );
          continue;
        }

        // US-ESC-006: warn if a notify-level has no named recipients and no role members
        if ((nextLevel as any).levelType === "notify") {
          const namedUserIds: mongoose.Types.ObjectId[] =
            (nextLevel as any).notifyUserIds ?? [];
          if (namedUserIds.length === 0) {
            const roleUserCount = await User.countDocuments({
              role: nextLevel.roleId,
              isActive: true,
            });
            if (roleUserCount === 0) {
              console.warn(
                `⚠️  [AUTO-ESC] Ticket ${ticket.ticketNumber}: notify-level "${nextLevel.levelName}" (L${nextLevel.levelNumber}) has no role members and no notifyUserIds — notification will be empty`,
              );
            }
          }
        }

        // Resolve the assignee for the next level.
        // User-type levels have a named assigneeUserId; role-type levels pick a random member.
        let assignedUser: { _id: any; firstName?: string; lastName?: string };
        const nextIsUserType = (nextLevel as any).assigneeType === "user";

        if (nextIsUserType) {
          // Direct-user level: use the named user
          const namedUserId = (nextLevel as any).assigneeUserId;
          if (!namedUserId) {
            const errMsg = `Ticket ${ticket.ticketNumber}: User-type level ${nextLevel.levelNumber} has no assigneeUserId set`;
            console.log(`❌ [AUTO-ESC] ${errMsg}`);
            result.errors.push(errMsg);
            continue;
          }
          const namedUser = await User.findById(namedUserId).select(
            "_id firstName lastName isActive",
          );
          if (!namedUser || !(namedUser as any).isActive) {
            const errMsg = `Ticket ${ticket.ticketNumber}: Named user ${namedUserId} for level ${nextLevel.levelNumber} not found or inactive`;
            console.log(`❌ [AUTO-ESC] ${errMsg}`);
            result.errors.push(errMsg);
            continue;
          }
          assignedUser = namedUser;
        } else {
          // BUG FIX: Add project scope to user query to avoid finding users from other projects
          const userQuery: any = {
            role: nextLevel.roleId,
            isActive: true,
          };
          if (ticket.project) {
            userQuery.$or = [
              { projects: { $in: [ticket.project] } },
              { projects: { $exists: false } },
              { projects: { $size: 0 } },
            ];
          }
          const usersInRole = await User.find(userQuery).select(
            "_id firstName lastName",
          );

          if (usersInRole.length === 0) {
            const errMsg = `Ticket ${ticket.ticketNumber}: No active users in role ${nextLevel.roleId} for level ${nextLevel.levelNumber} (project: ${ticket.project})`;
            console.log(`❌ [AUTO-ESC] ${errMsg}`);
            result.errors.push(errMsg);
            continue;
          }

          // Select a random user from the role
          assignedUser =
            usersInRole[Math.floor(Math.random() * usersInRole.length)];
        }

        const previousAssignee = ticket.assignedTo;

        // Update ticket with new escalation level
        ticket.currentEscalationLevelId = nextLevel._id;
        ticket.currentEscalationLevelNumber = nextLevel.levelNumber;
        // US-ESC-005: only change assignedTo when levelType is 'reassign' (or unset, default behaviour)
        if ((nextLevel as any).levelType !== "notify") {
          ticket.assignedTo = assignedUser._id as mongoose.Types.ObjectId;
        }
        // Keep status as-is (no "escalated" status value in system)

        // Add to escalation history
        if (!ticket.escalationHistory) {
          ticket.escalationHistory = [];
        }
        ticket.escalationHistory.push({
          escalatedTo: assignedUser._id as mongoose.Types.ObjectId,
          escalatedBy:
            previousAssignee || (assignedUser._id as mongoose.Types.ObjectId), // Use PREVIOUS assignee for history
          fromLevelNumber: currentLevelNumber,
          toLevelNumber: nextLevel.levelNumber,
          reason:
            `Auto-escalated from L${currentLevelNumber} to L${nextLevel.levelNumber} due to SLA breach` +
            ((nextLevel as any).levelType === "notify" ? " (notify-only)" : ""),
          escalatedAt: new Date(),
        });

        // Mark current role-level SLA as breached
        if (ticket.roleLevelSLA) {
          ticket.roleLevelSLA.breachedAt = now;
        }

        // Calculate new role-level SLA deadline for the next level
        if (nextLevel.slaHours > 0) {
          let newRoleLevelDueAt: Date;
          try {
            // Use working calendar aware calculation
            // Ensure we have working calendar (might not be set on older tickets)
            let workingCalendarId = ticket.workingCalendarId;
            if (!workingCalendarId && ticket.metadata?.projectId) {
              const projectCalendar = await WorkingCalendar.findOne({
                projectId:
                  typeof ticket.metadata.projectId === "string"
                    ? new mongoose.Types.ObjectId(ticket.metadata.projectId)
                    : ticket.metadata.projectId,
                isActive: true,
              });
              if (projectCalendar) {
                workingCalendarId =
                  projectCalendar._id as mongoose.Types.ObjectId;
                ticket.workingCalendarId = workingCalendarId;
              }
            }

            const ticketPriority =
              typeof ticket.priority === "string" ? ticket.priority : "MEDIUM";
            newRoleLevelDueAt = await calculateRoleLevelSLA(
              now, // Start from now
              matrix as IEscalationMatrix,
              nextLevel.levelNumber,
              ticketPriority,
              workingCalendarId,
            );
          } catch (err) {
            // Fallback to simple calculation - respecting slaUnit
            newRoleLevelDueAt = new Date(
              now.getTime() + slaToMs(nextLevel.slaHours, nextLevel.slaUnit),
            );
          }

          // Update role-level SLA on the ticket
          ticket.roleLevelSLA = {
            startedAt: now,
            dueAt: newRoleLevelDueAt,
            breachedAt: undefined,
            pausedAt: undefined,
            pausedDuration: 0,
          };

          console.log(
            `   ↳ Role-level SLA reset: L${nextLevel.levelNumber} deadline = ${newRoleLevelDueAt.toISOString()}`,
          );
        }

        await ticket.save();

        // Also update legacy SLATracking model for backward compatibility
        if (nextLevel.slaHours > 0) {
          const newDeadline = new Date(
            now.getTime() + slaToMs(nextLevel.slaHours, nextLevel.slaUnit),
          );
          await SLATracking.findOneAndUpdate(
            { ticketId: ticket._id },
            {
              $set: {
                resolutionDeadline: newDeadline,
                currentEscalationLevel: nextLevel.levelNumber - 1,
                nextEscalationDue: newDeadline,
              },
              $push: {
                escalationHistory: {
                  escalatedAt: now,
                  fromLevel: currentLevelNumber,
                  toLevel: nextLevel.levelNumber,
                  escalatedBy: assignedUser._id,
                  autoEscalated: true,
                },
              },
            },
          );
        }

        result.escalated++;

        console.log(
          `[AUTO-ESCALATION] Ticket ${ticket.ticketNumber} escalated from L${currentLevelNumber} to L${nextLevel.levelNumber}`,
        );
      } catch (err: any) {
        result.errors.push(
          `Ticket ${ticket.ticketNumber || ticket._id}: ${err.message}`,
        );
      }
    }
  } catch (err: any) {
    result.errors.push(`General error: ${err.message}`);
  }

  // US-ESC-012: Persist job run metadata to JobLog collection
  try {
    const jobStatus: "success" | "partial" | "error" =
      result.errors.length === 0
        ? "success"
        : result.escalated > 0 || result.processed > 0
          ? "partial"
          : "error";
    await JobLog.create({
      jobType: "auto-escalation",
      ranAt: new Date(),
      durationMs: Date.now() - jobStartMs,
      processed: result.processed,
      escalated: result.escalated,
      skipped: result.skipped,
      errorMessages: result.errors,
      status: jobStatus,
    });
  } catch (logErr) {
    console.error("[AUTO-ESC] Failed to persist JobLog:", logErr);
  }

  return result;
}

/**
 * Get tickets eligible for auto-escalation (for preview/monitoring)
 */
export async function getAutoEscalationCandidates(): Promise<
  {
    ticketNumber: string;
    matrixName: string;
    currentLevel: number;
    slaBreachedAt: Date;
    hoursOverdue: number;
  }[]
> {
  const candidates: {
    ticketNumber: string;
    matrixName: string;
    currentLevel: number;
    slaBreachedAt: Date;
    hoursOverdue: number;
  }[] = [];

  const autoEscalateMatrices = await EscalationMatrix.find({
    isActive: true,
    autoEscalate: true,
  });

  if (autoEscalateMatrices.length === 0) {
    return candidates;
  }

  const matrixIds = autoEscalateMatrices.map((m) => m._id);

  // Status values: 1=open, 2=in-progress, 3=on-hold (don't check resolved/closed)
  const tickets = await Ticket.find({
    escalationMatrixId: { $in: matrixIds },
    status: { $in: [1, 2, 3] },
  });

  for (const ticket of tickets) {
    const matrix = autoEscalateMatrices.find(
      (m) => m._id.toString() === ticket.escalationMatrixId?.toString(),
    );

    if (!matrix) continue;

    const currentLevelNumber = ticket.currentEscalationLevelNumber || 1;
    const currentLevel = matrix.levels.find(
      (l) => l.levelNumber === currentLevelNumber && l.isActive,
    );

    if (!currentLevel) continue;

    const escalationStartTime = ticket.updatedAt || ticket.createdAt;
    const slaDeadline = new Date(
      escalationStartTime.getTime() +
        slaToMs(currentLevel.slaHours, currentLevel.slaUnit),
    );
    const now = new Date();

    if (now > slaDeadline) {
      const hoursOverdue =
        (now.getTime() - slaDeadline.getTime()) / (1000 * 60 * 60);
      candidates.push({
        ticketNumber: ticket.ticketNumber,
        matrixName: matrix.name,
        currentLevel: currentLevelNumber,
        slaBreachedAt: slaDeadline,
        hoursOverdue: Math.round(hoursOverdue * 10) / 10,
      });
    }
  }

  return candidates;
}

/**
 * US-ESC-008: Process pre-breach SLA warnings.
 * For every open ticket with an escalation matrix that has slaWarningConfig,
 * check if any warning threshold has been crossed and send the warning email
 * if it hasn't been sent yet.
 */
export async function processSLAWarnings(): Promise<void> {
  try {
    const now = new Date();

    // Find open tickets that have an escalation matrix assigned and a started roleLevelSLA
    const tickets = await Ticket.find({
      status: { $nin: ["resolved", "closed"] },
      escalationMatrixId: { $exists: true, $ne: null },
      "roleLevelSLA.startedAt": { $exists: true },
      "roleLevelSLA.dueAt": { $exists: true },
      "roleLevelSLA.breachedAt": { $exists: false },
    }).lean();

    if (tickets.length === 0) return;

    // Gather unique matrix IDs
    const matrixIds = [
      ...new Set(tickets.map((t) => String(t.escalationMatrixId))),
    ];
    const matrices = await EscalationMatrix.find({
      _id: { $in: matrixIds },
    }).lean();
    const matrixMap = new Map(matrices.map((m: any) => [String(m._id), m]));

    let warningsSentCount = 0;

    for (const ticket of tickets) {
      const matrix: any = matrixMap.get(String(ticket.escalationMatrixId));
      if (!matrix?.slaWarningConfig?.warningThresholds?.length) continue;

      const sla = ticket.roleLevelSLA!;
      const totalMs =
        new Date(sla.dueAt).getTime() - new Date(sla.startedAt).getTime();
      if (totalMs <= 0) continue;

      const elapsedMs = now.getTime() - new Date(sla.startedAt).getTime();
      const elapsedPct = Math.min(100, (elapsedMs / totalMs) * 100);

      const alreadySent: number[] = (sla as any).warningsSent || [];
      const thresholdsToFireNow = (
        matrix.slaWarningConfig.warningThresholds as number[]
      ).filter((t) => elapsedPct >= t && !alreadySent.includes(t));

      if (thresholdsToFireNow.length === 0) continue;

      // Build recipient list
      const recipientEmails: string[] = [];

      if (matrix.slaWarningConfig.notifyAssignedAgent && ticket.assignedTo) {
        const agent = (await User.findById(ticket.assignedTo)
          .select("email firstName lastName")
          .lean()) as any;
        if (agent?.email) {
          recipientEmails.push(agent.email);
        }
      }

      if (matrix.slaWarningConfig.notifyRoles?.length) {
        const roleMembers = (await User.find({
          role: { $in: matrix.slaWarningConfig.notifyRoles },
          isActive: true,
        })
          .select("email firstName lastName")
          .lean()) as any[];
        for (const m of roleMembers) {
          if (m.email && !recipientEmails.includes(m.email))
            recipientEmails.push(m.email);
        }
      }

      const assignedAgent = ticket.assignedTo
        ? ((await User.findById(ticket.assignedTo)
            .select("firstName lastName")
            .lean()) as any)
        : null;
      const agentName = assignedAgent
        ? `${assignedAgent.firstName} ${assignedAgent.lastName}`
        : "Unassigned";

      const ticketNumber = (ticket as any).ticketNumber || String(ticket._id);
      const ticketTitle =
        (ticket as any).title || (ticket as any).subject || "Untitled";
      const projectId = (ticket as any).metadata?.projectId?.toString();

      // Send warning emails for each threshold
      for (const threshold of thresholdsToFireNow) {
        for (const email of recipientEmails) {
          await sendSLAWarningEmail(
            email,
            ticketNumber,
            ticketTitle,
            threshold,
            agentName,
            projectId,
          );
          warningsSentCount++;
        }
      }

      // Record all fired thresholds so we don't send again
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $addToSet: {
            "roleLevelSLA.warningsSent": { $each: thresholdsToFireNow },
          },
        },
      );
    }

    console.log(
      `[processSLAWarnings] Sent ${warningsSentCount} warning email(s) across ${tickets.length} checked tickets.`,
    );
  } catch (err) {
    console.error("[processSLAWarnings] Error:", err);
  }
}

export default {
  getMatrixByProjectId,
  autoAssignMatrixToTicket,
  getEscalationContext,
  getAllowedEscalationLevels,
  validateEscalation,
  validateEscalationByLevelNumber,
  executeEscalation,
  getUsersForLevel,
  assignMatrixToTicket,
  processAutoEscalation,
  getAutoEscalationCandidates,
  processSLAWarnings,
};
