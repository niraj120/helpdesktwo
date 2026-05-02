// @ts-nocheck
// TEMPORARILY DISABLED TYPE CHECKING - changeType casing issues
import { Request, Response } from "express";
import {
  EscalationMatrix,
  IEscalationLevel,
} from "../../models/escalation-matrix";
import { Role } from "../../models/Role";
import { User } from "../../models/User";
import { Ticket } from "../../models/Ticket";
import CategoryEscalationConfig from "../../models/ticket-module/CategoryEscalationConfig";
import escalationMatrixService from "../../services/escalationMatrixService";
import { logActivity } from "../../utils/logger";
import * as slaService from "../../services/slaService";
import mongoose from "mongoose";
import JobLog from "../../models/JobLog";

/**
 * Normalize applicablePriorities to uppercase strings
 * Converts ObjectIds to priority codes by looking up in the database
 * Also ensures all values are uppercase strings for consistent matching
 */
async function normalizeApplicablePriorities(
  priorities: any[],
  projectIds: string[],
): Promise<string[]> {
  if (!priorities || priorities.length === 0) return [];

  const normalized: string[] = [];

  for (const priority of priorities) {
    // If it's already a valid priority code (uppercase string)
    const validCodes = [
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
      "URGENT",
      "NORMAL",
    ];
    const upperValue = String(priority).toUpperCase();

    if (validCodes.includes(upperValue)) {
      normalized.push(upperValue);
      continue;
    }

    // If it looks like an ObjectId, try to look up the priority name
    if (mongoose.Types.ObjectId.isValid(priority)) {
      try {
        // Try to find the SLA rule with this ID to get its name
        const SLARule = mongoose.model("SLARule");
        const rule = await SLARule.findById(priority).select("name");
        if (rule?.name) {
          normalized.push(String(rule.name).toUpperCase());
          continue;
        }
      } catch (err) {
        console.warn(`Could not look up priority ${priority}:`, err);
      }
    }

    // Fallback: just use the value as-is (uppercased)
    if (priority && typeof priority === "string") {
      normalized.push(priority.toUpperCase());
    }
  }

  // Remove duplicates
  return [...new Set(normalized)];
}

/**
 * Get all escalation matrices
 * GET /api/escalation-matrix
 */
export const getAllEscalationMatrices = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, isActive } = req.query;
    const filter: any = {};

    if (projectId) {
      filter.projectIds = { $in: [projectId] };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    // Auto project scoping: non-super-admins see only their assigned projects
    const callerRole = (req as any).user?.role;
    const isSuperAdmin =
      callerRole?.code === "SUPER_ADMIN" || callerRole?.name === "Super Admin";
    if (!isSuperAdmin) {
      if (callerRole?.projects?.length > 0) {
        const allowedIds = callerRole.projects.map(
          (p: any) => p._id?.toString() || p.toString(),
        );
        filter.projectIds = { $in: allowedIds };
      } else {
        filter.projectIds = { $in: [] };
      }
    }

    console.log(
      "🔍 Fetching escalation matrices with filter:",
      JSON.stringify(filter),
    );

    const matrices = await EscalationMatrix.find(filter)
      .populate("projectIds", "name code")
      .populate("levels.roleId", "name code")
      .populate("levels.assigneeUserId", "firstName lastName email")
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${matrices.length} escalation matrices`);

    // Attach linked category counts for badge display
    const matrixIds = matrices.map((m: any) => m._id);
    const categoryCounts = await CategoryEscalationConfig.aggregate([
      { $match: { escalationMatrixId: { $in: matrixIds }, isActive: true } },
      { $group: { _id: "$escalationMatrixId", count: { $sum: 1 } } },
    ]);
    const countMap: Record<string, number> = {};
    categoryCounts.forEach((c: any) => {
      countMap[c._id.toString()] = c.count;
    });
    const matricesWithCounts = matrices.map((m: any) => ({
      ...m,
      linkedCategoriesCount: countMap[m._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      data: matricesWithCounts,
    });
  } catch (error: any) {
    console.error("Error fetching escalation matrices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch escalation matrices",
      error: error.message,
    });
  }
};

/**
 * Get single escalation matrix by ID
 * GET /api/escalation-matrix/:id
 */
export const getEscalationMatrixById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const matrix = await EscalationMatrix.findById(id)
      .populate("projectIds", "name code")
      .populate("levels.roleId", "name code")
      .populate("levels.assigneeUserId", "firstName lastName email")
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email");

    if (!matrix) {
      res.status(404).json({
        success: false,
        message: "Escalation matrix not found",
      });
      return;
    }

    // Fetch users for each level
    const levelsWithUsers = await Promise.all(
      matrix.levels.map(async (level) => {
        const users = await User.find({
          role: level.roleId,
          isActive: true,
        })
          .select("firstName lastName email")
          .lean();

        return {
          ...(level as any).toObject(),
          users,
        };
      }),
    );

    // Fetch linked categories for this matrix
    const linkedCategories = await CategoryEscalationConfig.find({
      escalationMatrixId: id,
      isActive: true,
    })
      .populate("categoryId", "name level")
      .lean();

    res.status(200).json({
      success: true,
      data: {
        ...matrix.toObject(),
        levels: levelsWithUsers,
        linkedCategories: linkedCategories.map((lc: any) => ({
          _id: lc._id,
          categoryId: lc.categoryId?._id || lc.categoryId,
          categoryName: lc.categoryId?.name || "Unknown",
          categoryLevel: lc.categoryId?.level,
          projectId: lc.projectId,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error fetching escalation matrix:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch escalation matrix",
      error: error.message,
    });
  }
};

/**
 * Create new escalation matrix
 * POST /api/escalation-matrix
 */
export const createEscalationMatrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const {
      name,
      description,
      escalationMode,
      allowSkipLevel,
      allowBackward,
      autoEscalate,
      levels,
      projectIds,
      isActive,
      priorityMode,
      priorityConfigs,
      applicablePriorities,
      scopeMode,
      categoryIds,
      slaWarningConfig,
    } = req.body;

    // Validate required fields
    if (!name) {
      res.status(400).json({
        success: false,
        message: "Matrix name is required",
      });
      return;
    }

    if (!escalationMode || !["SEQUENTIAL", "RANDOM"].includes(escalationMode)) {
      res.status(400).json({
        success: false,
        message: "Invalid escalation mode. Must be SEQUENTIAL or RANDOM",
      });
      return;
    }

    // Validate levels
    if (!levels || !Array.isArray(levels) || levels.length === 0) {
      res.status(400).json({
        success: false,
        message: "At least one escalation level is required",
      });
      return;
    }

    // Validate level numbers are unique
    const levelNumbers = levels.map((l: IEscalationLevel) => l.levelNumber);
    if (new Set(levelNumbers).size !== levelNumbers.length) {
      res.status(400).json({
        success: false,
        message: "Level numbers must be unique",
      });
      return;
    }

    // Validate all roleIds exist — skipped for PER_PRIORITY mode where top-level
    // levels are only a UI template and may carry an empty roleId.
    // Also skipped for levels where assigneeType === 'user'.
    if (priorityMode !== "PER_PRIORITY") {
      const emptyRoleLevel = levels.find(
        (l: any) =>
          l.assigneeType !== "user" &&
          (!l.roleId || String(l.roleId).trim() === ""),
      );
      if (emptyRoleLevel) {
        res.status(400).json({
          success: false,
          message: `Level "${emptyRoleLevel.levelName || emptyRoleLevel.levelNumber}" must have a role selected`,
        });
        return;
      }

      const roleIds = levels
        .filter((l: any) => l.assigneeType !== "user" && l.roleId)
        .map((l: IEscalationLevel) => l.roleId);
      if (roleIds.length > 0) {
        const existingRoles = await Role.find({ _id: { $in: roleIds } });
        if (existingRoles.length !== roleIds.length) {
          res.status(400).json({
            success: false,
            message: "One or more role IDs are invalid",
          });
          return;
        }
      }
    }

    // Prepare matrix data
    // Normalize applicablePriorities to uppercase codes (e.g., 'HIGH', 'MEDIUM', 'LOW')
    const normalizedPriorities = await normalizeApplicablePriorities(
      applicablePriorities || [],
      projectIds || [],
    );
    console.log(
      `📋 Normalized applicablePriorities: ${JSON.stringify(applicablePriorities)} → ${JSON.stringify(normalizedPriorities)}`,
    );

    const matrixData: any = {
      name,
      description,
      escalationMode,
      allowSkipLevel: escalationMode === "RANDOM" ? allowSkipLevel : false,
      allowBackward: allowBackward === true,
      autoEscalate: autoEscalate === true,
      levels: levels.map((l: any) => ({
        levelNumber: l.levelNumber,
        levelName: l.levelName,
        assigneeType: l.assigneeType || "role",
        // Store null instead of empty string to avoid ObjectId cast errors
        roleId: l.roleId && String(l.roleId).trim() !== "" ? l.roleId : null,
        assigneeUserId:
          l.assigneeUserId && String(l.assigneeUserId).trim() !== ""
            ? l.assigneeUserId
            : null,
        slaHours: l.slaHours || 24,
        slaUnit: l.slaUnit || "hrs",
        responseTime: l.responseTime,
        levelType: l.levelType || "reassign",
        notifyUserIds: Array.isArray(l.notifyUserIds) ? l.notifyUserIds : [],
        slaThresholdType: l.slaThresholdType || "fixed",
        slaThresholdPercent: l.slaThresholdPercent,
        isActive: l.isActive !== false,
      })),
      projectIds: projectIds || [],
      applicablePriorities: normalizedPriorities,
      scopeMode: scopeMode || "PRIORITY",
      categoryIds: Array.isArray(categoryIds) ? categoryIds : [],
      slaWarningConfig: slaWarningConfig || undefined,
      isActive: isActive !== false,
      createdBy: userId,
    };

    // Handle priority mode configuration
    if (priorityMode) {
      matrixData.priorityMode = priorityMode;

      if (priorityMode === "PER_PRIORITY") {
        if (
          !priorityConfigs ||
          !Array.isArray(priorityConfigs) ||
          priorityConfigs.length === 0
        ) {
          res.status(400).json({
            success: false,
            message:
              "Priority configurations are required when priority mode is PER_PRIORITY",
          });
          return;
        }
        // Sanitize empty roleId/assigneeUserId strings to null (same as top-level levels)
        matrixData.priorityConfigs = priorityConfigs.map((config: any) => ({
          ...config,
          levels: (config.levels || []).map((l: any) => ({
            ...l,
            roleId:
              l.roleId && String(l.roleId).trim() !== "" ? l.roleId : null,
            assigneeUserId:
              l.assigneeUserId && String(l.assigneeUserId).trim() !== ""
                ? l.assigneeUserId
                : null,
          })),
        }));

        // Validate each priority configuration against priority SLA
        if (projectIds && projectIds.length > 0) {
          for (const config of priorityConfigs) {
            const validation =
              await slaService.validateEscalationLevelsAgainstPriority(
                config.priorityCode,
                config.levels,
                projectIds[0],
              );

            if (!validation.valid) {
              res.status(400).json({
                success: false,
                message: `Validation failed for priority ${config.priorityCode}: ${validation.reason}`,
                details: validation,
              });
              return;
            }
          }
        }
      }
    }

    // Create the matrix
    const matrix = new EscalationMatrix(matrixData);

    await matrix.save();

    // Log activity
    await logActivity({
      action: "CREATE",
      entityType: "EscalationMatrix",
      entityId: matrix._id.toString(),
      userId,
      description: `Created escalation matrix: ${name}`,
      metadata: { name, escalationMode, levelCount: levels.length },
    });

    console.log(`✅ Created escalation matrix: ${name} (${matrix._id})`);

    res.status(201).json({
      success: true,
      message: "Escalation matrix created successfully",
      data: matrix,
    });
  } catch (error: any) {
    console.error("Error creating escalation matrix:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create escalation matrix",
      error: error.message,
    });
  }
};

/**
 * Update escalation matrix
 * PUT /api/escalation-matrix/:id
 */
export const updateEscalationMatrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const {
      name,
      description,
      escalationMode,
      allowSkipLevel,
      allowBackward,
      autoEscalate,
      levels,
      projectIds,
      isActive,
      priorityMode,
      priorityConfigs,
      applicablePriorities,
      scopeMode,
      categoryIds,
      slaWarningConfig,
    } = req.body;

    // Debug: Log incoming request body
    console.log("📥 [UPDATE] Escalation Matrix - Received body:", {
      name,
      escalationMode,
      allowSkipLevel,
      allowBackward,
      autoEscalate,
      isActive,
      scopeMode,
      categoryIds,
      categoryIdsCount: Array.isArray(categoryIds)
        ? categoryIds.length
        : "not-array",
    });

    const matrix = await EscalationMatrix.findById(id);
    if (!matrix) {
      res.status(404).json({
        success: false,
        message: "Escalation matrix not found",
      });
      return;
    }

    // Check if matrix is in use by tickets
    const ticketsUsingMatrix = await Ticket.countDocuments({
      escalationMatrixId: id,
      status: { $nin: [4, 5] }, // Not resolved or closed
    });

    if (
      ticketsUsingMatrix > 0 &&
      escalationMode &&
      escalationMode !== matrix.escalationMode
    ) {
      res.status(400).json({
        success: false,
        message: `Cannot change escalation mode while ${ticketsUsingMatrix} active tickets are using this matrix`,
      });
      return;
    }

    // Validate levels if provided
    if (levels && Array.isArray(levels)) {
      const levelNumbers = levels.map((l: IEscalationLevel) => l.levelNumber);
      if (new Set(levelNumbers).size !== levelNumbers.length) {
        res.status(400).json({
          success: false,
          message: "Level numbers must be unique",
        });
        return;
      }

      // Validate all roleIds exist — skipped for PER_PRIORITY mode where top-level
      // levels are only a UI template and may carry an empty roleId.
      // Also skipped for levels where assigneeType === 'user'.
      const effectivePriorityMode = priorityMode ?? matrix.priorityMode;
      if (effectivePriorityMode !== "PER_PRIORITY") {
        const emptyRoleLevel = levels.find(
          (l: any) =>
            l.assigneeType !== "user" &&
            (!l.roleId || String(l.roleId).trim() === ""),
        );
        if (emptyRoleLevel) {
          res.status(400).json({
            success: false,
            message: `Level "${emptyRoleLevel.levelName || emptyRoleLevel.levelNumber}" must have a role selected`,
          });
          return;
        }

        const roleIds = levels
          .filter((l: any) => l.assigneeType !== "user" && l.roleId)
          .map((l: IEscalationLevel) => l.roleId);
        if (roleIds.length > 0) {
          const existingRoles = await Role.find({ _id: { $in: roleIds } });
          if (existingRoles.length !== roleIds.length) {
            res.status(400).json({
              success: false,
              message: "One or more role IDs are invalid",
            });
            return;
          }
        }
      }

      // Validate priority configs if in PER_PRIORITY mode
      if (
        matrix.priorityMode === "PER_PRIORITY" ||
        (priorityMode && priorityMode === "PER_PRIORITY")
      ) {
        if (
          !priorityConfigs ||
          !Array.isArray(priorityConfigs) ||
          priorityConfigs.length === 0
        ) {
          res.status(400).json({
            success: false,
            message:
              "Priority configurations are required when priority mode is PER_PRIORITY",
          });
          return;
        }
      }

      matrix.levels = levels.map((l: any) => ({
        levelNumber: l.levelNumber,
        levelName: l.levelName,
        assigneeType: l.assigneeType || "role",
        // Store null instead of empty string to avoid ObjectId cast errors
        roleId: l.roleId && String(l.roleId).trim() !== "" ? l.roleId : null,
        assigneeUserId:
          l.assigneeUserId && String(l.assigneeUserId).trim() !== ""
            ? l.assigneeUserId
            : null,
        slaHours: l.slaHours || 24,
        slaUnit: l.slaUnit || "hrs",
        responseTime: l.responseTime,
        levelType: l.levelType || "reassign",
        notifyUserIds: Array.isArray(l.notifyUserIds) ? l.notifyUserIds : [],
        slaThresholdType: l.slaThresholdType || "fixed",
        slaThresholdPercent: l.slaThresholdPercent,
        isActive: l.isActive !== false,
      })) as any;
    }

    // Update fields
    if (name) matrix.name = name;
    if (description !== undefined) matrix.description = description;
    if (escalationMode) matrix.escalationMode = escalationMode;

    // Handle mode-specific options
    if (escalationMode === "RANDOM") {
      if (allowSkipLevel !== undefined) matrix.allowSkipLevel = allowSkipLevel;
    } else if (escalationMode === "SEQUENTIAL") {
      matrix.allowSkipLevel = false; // Skip level only for RANDOM mode
    }
    // Allow backward escalation for both modes
    if (allowBackward !== undefined) matrix.allowBackward = allowBackward;

    if (projectIds) matrix.projectIds = projectIds;
    if (isActive !== undefined) matrix.isActive = isActive;
    if (autoEscalate !== undefined) matrix.autoEscalate = autoEscalate;
    if (scopeMode !== undefined) (matrix as any).scopeMode = scopeMode;
    if (categoryIds !== undefined) {
      (matrix as any).categoryIds = Array.isArray(categoryIds)
        ? categoryIds
        : [];
      matrix.markModified("categoryIds");
    }
    if (slaWarningConfig !== undefined)
      (matrix as any).slaWarningConfig = slaWarningConfig;

    // Update priority mode configuration
    if (priorityMode !== undefined) {
      matrix.priorityMode = priorityMode;
    }
    if (priorityConfigs !== undefined) {
      // Validate priority configs against SLA if changing
      if (
        matrix.priorityMode === "PER_PRIORITY" &&
        matrix.projectIds &&
        matrix.projectIds.length > 0
      ) {
        for (const config of priorityConfigs) {
          const validation =
            await slaService.validateEscalationLevelsAgainstPriority(
              config.priorityCode,
              config.levels,
              matrix.projectIds[0].toString(),
            );

          if (!validation.valid) {
            res.status(400).json({
              success: false,
              message: `Validation failed for priority ${config.priorityCode}: ${validation.reason}`,
              details: validation,
            });
            return;
          }
        }
      }
      // Sanitize empty roleId/assigneeUserId strings to null (same as top-level levels)
      matrix.priorityConfigs = priorityConfigs.map((config: any) => ({
        ...config,
        levels: (config.levels || []).map((l: any) => ({
          ...l,
          roleId: l.roleId && String(l.roleId).trim() !== "" ? l.roleId : null,
          assigneeUserId:
            l.assigneeUserId && String(l.assigneeUserId).trim() !== ""
              ? l.assigneeUserId
              : null,
        })),
      }));
    }

    // Update applicablePriorities if provided - normalize to uppercase codes
    if (applicablePriorities !== undefined) {
      const normalizedPriorities = await normalizeApplicablePriorities(
        applicablePriorities,
        matrix.projectIds?.map((p: any) => p.toString()) || [],
      );
      console.log(
        `📋 [UPDATE] Normalized applicablePriorities: ${JSON.stringify(applicablePriorities)} → ${JSON.stringify(normalizedPriorities)}`,
      );
      matrix.applicablePriorities = normalizedPriorities;
    }

    matrix.updatedBy = userId;

    // Debug: Log values before save
    console.log("📤 [UPDATE] Escalation Matrix - Values before save:", {
      name: matrix.name,
      escalationMode: matrix.escalationMode,
      allowSkipLevel: matrix.allowSkipLevel,
      allowBackward: matrix.allowBackward,
      autoEscalate: matrix.autoEscalate,
      scopeMode: (matrix as any).scopeMode,
      categoryIds: (matrix as any).categoryIds,
      categoryIdsCount: ((matrix as any).categoryIds as any[])?.length,
    });

    await matrix.save();

    console.log("✅ [UPDATE] Escalation Matrix saved successfully");

    // Log activity
    await logActivity({
      action: "UPDATE",
      entityType: "EscalationMatrix",
      entityId: matrix._id.toString(),
      userId,
      description: `Updated escalation matrix: ${matrix.name}`,
    });

    console.log(`✅ Updated escalation matrix: ${matrix.name} (${matrix._id})`);

    res.status(200).json({
      success: true,
      message: "Escalation matrix updated successfully",
      data: matrix,
    });
  } catch (error: any) {
    console.error("Error updating escalation matrix:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update escalation matrix",
      error: error.message,
    });
  }
};

/**
 * Delete escalation matrix
 * DELETE /api/escalation-matrix/:id
 */
export const deleteEscalationMatrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const matrix = await EscalationMatrix.findById(id);
    if (!matrix) {
      res.status(404).json({
        success: false,
        message: "Escalation matrix not found",
      });
      return;
    }

    // Check if matrix is in use by active tickets
    const ticketsUsingMatrix = await Ticket.countDocuments({
      escalationMatrixId: id,
      status: { $nin: [4, 5] }, // Not resolved or closed
    });

    if (ticketsUsingMatrix > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete matrix while ${ticketsUsingMatrix} active tickets are using it. Please reassign tickets first.`,
      });
      return;
    }

    await EscalationMatrix.findByIdAndDelete(id);

    // Log activity
    await logActivity({
      action: "DELETE",
      entityType: "EscalationMatrix",
      entityId: id,
      userId,
      description: `Deleted escalation matrix: ${matrix.name}`,
    });

    console.log(`✅ Deleted escalation matrix: ${matrix.name} (${id})`);

    res.status(200).json({
      success: true,
      message: "Escalation matrix deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting escalation matrix:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete escalation matrix",
      error: error.message,
    });
  }
};

/**
 * Toggle escalation matrix status
 * PATCH /api/escalation-matrix/:id/toggle-status
 */
export const toggleEscalationMatrixStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const matrix = await EscalationMatrix.findById(id);
    if (!matrix) {
      res.status(404).json({
        success: false,
        message: "Escalation matrix not found",
      });
      return;
    }

    matrix.isActive = !matrix.isActive;
    matrix.updatedBy = userId;
    await matrix.save();

    // Log activity
    await logActivity({
      action: "UPDATE",
      entityType: "EscalationMatrix",
      entityId: id,
      userId,
      description: `${matrix.isActive ? "Activated" : "Deactivated"} escalation matrix: ${matrix.name}`,
    });

    res.status(200).json({
      success: true,
      message: `Escalation matrix ${matrix.isActive ? "activated" : "deactivated"} successfully`,
      data: matrix,
    });
  } catch (error: any) {
    console.error("Error toggling escalation matrix status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle escalation matrix status",
      error: error.message,
    });
  }
};

/**
 * Get allowed escalation levels for a ticket
 * GET /api/tickets/:id/allowed-escalations
 *
 * For de-escalation (backward), shows ONLY the previous handler at that level,
 * not all users with that role.
 *
 * For offline tickets, filters users to only show those in the same center.
 */
export const getAllowedEscalations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const currentUserId = (req as any).user?.userId;

    const allowedLevels =
      await escalationMatrixService.getAllowedEscalationLevels(id);

    // Get the ticket with escalation history to find previous handlers
    const ticket = await Ticket.findById(id)
      .populate("escalationHistory.escalatedBy", "firstName lastName email")
      .populate(
        "escalationHistory.previousAssignee",
        "firstName lastName email",
      )
      .lean();

    // Determine if center filtering is needed (offline tickets have centerId)
    // Note: centerId of "online" is a sentinel string for online tickets, not a real ObjectId
    const ticketCenterId = (ticket as any)?.metadata?.centerId;
    const isValidCenterId = ticketCenterId && ticketCenterId !== "online";
    const isOfflineTicket =
      ticket?.submissionSource === "offline" || !!isValidCenterId;

    // Get current user's centers for filtering if no ticket center
    let filterCenters: any[] = [];
    if (isOfflineTicket) {
      if (isValidCenterId) {
        filterCenters = [ticketCenterId];
        console.log(`📍 Offline ticket center filter: ${ticketCenterId}`);
      } else if (currentUserId) {
        // Fall back to current user's centers
        const currentUser = await User.findById(currentUserId)
          .select("centers")
          .lean();
        filterCenters = currentUser?.centers || [];
        console.log(
          `📍 Using current user's centers for filter: ${filterCenters.length} centers`,
        );
      }
    }

    // Fetch users and user counts for each level
    const levelsWithUsers = await Promise.all(
      allowedLevels.map(async (level) => {
        // For de-escalation levels, find the previous handler from escalation history
        if (
          level.isDeEscalation &&
          ticket?.escalationHistory &&
          ticket.escalationHistory.length > 0
        ) {
          let previousHandler: any = null;

          // Strategy 1: Look for escalation record with fromLevelNumber matching target level (new format)
          const relevantEscalation = [...ticket.escalationHistory]
            .reverse()
            .find(
              (record: any) => record.fromLevelNumber === level.levelNumber,
            );

          if (relevantEscalation?.previousAssignee) {
            previousHandler = relevantEscalation.previousAssignee;
          }

          // Strategy 2: Check escalatedBy from records with fromLevelNumber (new format)
          if (!previousHandler && relevantEscalation?.escalatedBy) {
            previousHandler = relevantEscalation.escalatedBy;
          }

          // Strategy 3: For Level 1 de-escalation without new format data,
          // look for the first escalation record's escalatedBy (who was the original Level 1 handler)
          if (!previousHandler && level.levelNumber === 1) {
            // Find the earliest escalation (first time ticket was moved from L1)
            const firstEscalation = ticket.escalationHistory[0] as any;
            if (firstEscalation?.escalatedBy) {
              previousHandler = firstEscalation.escalatedBy;
            }
          }

          // Strategy 4: For other levels, find escalatedBy from any relevant escalation history
          if (!previousHandler) {
            // Find any escalation where someone at the target level's role escalated the ticket
            for (const record of [...ticket.escalationHistory].reverse()) {
              const rec = record as any;
              if (rec.escalatedBy) {
                // Check if this user has the target level's role
                const escalator = await User.findById(
                  rec.escalatedBy._id || rec.escalatedBy,
                )
                  .select("firstName lastName email role")
                  .lean();
                if (
                  escalator &&
                  escalator.role?.toString() === level.roleId?.toString()
                ) {
                  previousHandler = escalator;
                  break;
                }
              }
            }
          }

          // If we found a previous handler, return only that user
          if (previousHandler) {
            const prevName =
              `${previousHandler.firstName || ""} ${previousHandler.lastName || ""}`.trim();

            console.log(
              `📥 De-escalation to Level ${level.levelNumber}: Found previous handler - ${prevName}`,
            );

            return {
              ...level,
              userCount: 1,
              users: [
                {
                  _id: previousHandler._id,
                  name: prevName,
                  email: previousHandler.email,
                },
              ],
              userNames: [prevName],
              previousHandlerId: previousHandler._id?.toString(),
              previousHandlerName: prevName,
              previousHandlerEmail: previousHandler.email,
            };
          }

          console.log(
            `⚠️ De-escalation to Level ${level.levelNumber}: No previous handler found, showing all users`,
          );
        }

        // Build user query - filter by center for offline tickets
        const userQuery: any = {
          role: level.roleId,
          isActive: true,
        };

        // Add center filtering for offline tickets
        if (isOfflineTicket && filterCenters.length > 0) {
          userQuery.centers = { $in: filterCenters };
          console.log(
            `📍 Filtering Level ${level.levelNumber} users by centers:`,
            filterCenters,
          );
        }

        // For forward escalation or if no previous handler found, show all users with the role
        // For offline tickets, also filter by center
        const users = await User.find(userQuery)
          .select("firstName lastName email centers")
          .lean();

        const userCount = users.length;

        // Log found users for debugging
        console.log(
          `📋 Level ${level.levelNumber} (${level.roleId}): Found ${userCount} user(s)${isOfflineTicket ? " in matching center(s)" : ""}`,
        );
        users.forEach((u) =>
          console.log(`   - ${u.firstName} ${u.lastName} (${u.email})`),
        );

        // Format user names for display - show all users separately
        const userNames = users
          .map((u) => `${u.firstName || ""} ${u.lastName || ""}`.trim())
          .filter((n) => n);

        return {
          ...level,
          userCount,
          users: users.map((u) => ({
            _id: u._id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
            email: u.email,
          })),
          userNames: userNames, // Show all user names (no slicing)
        };
      }),
    );

    res.status(200).json({
      success: true,
      data: levelsWithUsers,
    });
  } catch (error: any) {
    console.error("Error getting allowed escalations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get allowed escalations",
      error: error.message,
    });
  }
};

/**
 * Escalate ticket using matrix rules
 * POST /api/tickets/:id/matrix-escalate
 */
export const escalateTicketWithMatrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { targetLevelId, reason, targetUserId } = req.body;
    const userId = (req as any).user?.userId;

    if (!targetLevelId) {
      res.status(400).json({
        success: false,
        message: "Target level ID is required",
      });
      return;
    }

    if (!reason) {
      res.status(400).json({
        success: false,
        message: "Escalation reason is required",
      });
      return;
    }

    // Execute escalation with validation
    // Pass targetUserId if provided (for specific user assignment)
    const result = await escalationMatrixService.executeEscalation(
      id,
      targetLevelId,
      userId,
      reason,
      targetUserId, // Optional: specific user to assign to
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
      });
      return;
    }

    // Log activity
    await logActivity({
      action: "ESCALATE",
      entityType: "Ticket",
      entityId: id,
      userId,
      description: result.message,
      metadata: {
        targetLevelId,
        targetUserId,
        reason,
        assignedTo: result.assignedUser?._id?.toString(),
      },
    });

    // Push notification to the newly assigned agent after escalation
    if (result.assignedUser?._id) {
      (async () => {
        try {
          const {
            createNotification,
          } = require("../../controllers/notificationController");
          const ticketDoc = result.ticket as any;
          const projId =
            ticketDoc?.metadata?.projectId?._id?.toString() ||
            ticketDoc?.metadata?.projectId?.toString() ||
            ticketDoc?.project?.toString();
          if (projId) {
            const isProduction = process.env.NODE_ENV === "production";
            const frontendUrl = isProduction
              ? process.env.PRODUCTION_FRONTEND_URL ||
                "https://helpdesk.hubblehox.ai"
              : process.env.FRONTEND_URL || "http://localhost:3001";
            await createNotification({
              userId: new mongoose.Types.ObjectId(
                result.assignedUser._id.toString(),
              ),
              projectId: new mongoose.Types.ObjectId(projId),
              type: "info" as const,
              title: `Ticket Escalated to You: ${ticketDoc.ticketNumber}`,
              message: ticketDoc.subject || "Ticket escalated",
              ticketId: ticketDoc._id,
              link: `${frontendUrl}/tickets/${ticketDoc._id}`,
            });
          }
        } catch (notifErr) {
          console.error(
            "⚠️ Failed to send escalation push notification:",
            notifErr,
          );
        }
      })();
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        ticket: result.ticket,
        assignedUser: result.assignedUser,
      },
    });
  } catch (error: any) {
    console.error("Error escalating ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to escalate ticket",
      error: error.message,
    });
  }
};

/**
 * Assign escalation matrix to ticket
 * POST /api/tickets/:id/assign-matrix
 */
export const assignMatrixToTicket = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { matrixId, startAtLevel } = req.body;
    const userId = (req as any).user?.userId;

    if (!matrixId) {
      res.status(400).json({
        success: false,
        message: "Matrix ID is required",
      });
      return;
    }

    const result = await escalationMatrixService.assignMatrixToTicket(
      id,
      matrixId,
      startAtLevel,
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    // Log activity
    await logActivity({
      action: "UPDATE",
      entityType: "Ticket",
      entityId: id,
      userId,
      description: result.message,
    });

    res.status(200).json(result);
  } catch (error: any) {
    console.error("Error assigning matrix to ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign matrix to ticket",
      error: error.message,
    });
  }
};

/**
 * Get users for a specific escalation level
 * GET /api/escalation-matrix/:matrixId/levels/:levelId/users
 */
export const getUsersForLevel = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { matrixId, levelId } = req.params;
    const { projectId } = req.query;

    const users = await escalationMatrixService.getUsersForLevel(
      matrixId,
      levelId,
      projectId as string | undefined,
    );

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    console.error("Error getting users for level:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users for level",
      error: error.message,
    });
  }
};

/**
 * Process auto-escalation for SLA breached tickets
 * POST /api/escalation-matrix/auto-escalate/process
 * Only Super Admin can manually trigger this
 */
export const processAutoEscalation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    console.log("🔄 Processing auto-escalation...");

    const result = await escalationMatrixService.processAutoEscalation();

    console.log(
      `✅ Auto-escalation complete: ${result.escalated}/${result.processed} tickets escalated`,
    );

    // Log activity
    logActivity({
      type: "SYSTEM",
      action: "auto_escalation_processed",
      description: `Auto-escalation processed: ${result.escalated} tickets escalated`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: result,
    });

    res.status(200).json({
      success: true,
      message: `Processed ${result.processed} tickets, escalated ${result.escalated}`,
      data: result,
    });
  } catch (error: any) {
    console.error("Error processing auto-escalation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process auto-escalation",
      error: error.message,
    });
  }
};

/**
 * Get tickets that are candidates for auto-escalation (SLA breached)
 * GET /api/escalation-matrix/auto-escalate/candidates
 */
export const getAutoEscalationCandidates = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const candidates =
      await escalationMatrixService.getAutoEscalationCandidates();

    res.status(200).json({
      success: true,
      data: candidates,
      count: candidates.length,
    });
  } catch (error: any) {
    console.error("Error getting auto-escalation candidates:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get auto-escalation candidates",
      error: error.message,
    });
  }
};

/**
 * Get recent auto-escalation job log entries (US-ESC-012)
 * GET /api/escalation-matrix/auto-escalate/job-log
 */
export const getAutoEscalationJobLog = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const logs = await JobLog.find({ jobType: "auto-escalation" })
      .sort({ ranAt: -1 })
      .limit(limit)
      .lean();
    res.status(200).json({ success: true, data: logs });
  } catch (error: any) {
    console.error("Error fetching auto-escalation job log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch job log",
      error: error.message,
    });
  }
};

/**
 * Validate escalation matrix configuration against priority SLA
 * POST /api/escalation-matrix/validate
 */
export const validateEscalationMatrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { priorityMode, levels, priorityConfigs, projectId } = req.body;

    if (!projectId) {
      res.status(400).json({
        success: false,
        message: "Project ID is required for validation",
      });
      return;
    }

    const results: any = {
      success: true,
      validations: [],
    };

    // Validate based on priority mode
    if (priorityMode === "SAME_FOR_ALL") {
      // For SAME_FOR_ALL mode, we don't validate against specific priorities
      // since the same levels apply to all priorities
      results.message = "Same levels will be used for all priorities";
      results.validations.push({
        mode: "SAME_FOR_ALL",
        note: "No priority-specific validation needed",
      });
    } else if (priorityMode === "PER_PRIORITY") {
      if (
        !priorityConfigs ||
        !Array.isArray(priorityConfigs) ||
        priorityConfigs.length === 0
      ) {
        res.status(400).json({
          success: false,
          message:
            "Priority configurations are required when priority mode is PER_PRIORITY",
        });
        return;
      }

      // Validate each priority configuration
      for (const config of priorityConfigs) {
        const validation =
          await slaService.validateEscalationLevelsAgainstPriority(
            config.priorityCode,
            config.levels,
            projectId,
          );

        results.validations.push({
          priorityCode: config.priorityCode,
          ...validation,
        });

        if (!validation.valid) {
          results.success = false;
        }
      }
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid priority mode. Must be SAME_FOR_ALL or PER_PRIORITY",
      });
      return;
    }

    res.status(200).json(results);
  } catch (error: any) {
    console.error("Error validating escalation matrix:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate escalation matrix",
      error: error.message,
    });
  }
};

/**
 * US-ESC-011: Escalation Matrix Coverage Report
 * Returns per-project stats: open tickets, how many have a matrix, coverage %
 */
export const getEscalationCoverage = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    // Build base match for open tickets
    const baseMatch: any = {
      status: { $nin: ["resolved", "closed"] },
    };
    if (projectId) {
      baseMatch["metadata.projectId"] = new mongoose.Types.ObjectId(
        projectId as string,
      );
    }

    // Aggregate open tickets grouped by project
    const rows = await Ticket.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$metadata.projectId",
          openTickets: { $sum: 1 },
          withMatrix: {
            $sum: {
              $cond: [{ $ifNull: ["$escalationMatrixId", false] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      {
        $project: {
          projectId: "$_id",
          projectName: {
            $ifNull: [
              { $arrayElemAt: ["$project.name", 0] },
              "Unknown Project",
            ],
          },
          openTickets: 1,
          withMatrix: 1,
          withoutMatrix: { $subtract: ["$openTickets", "$withMatrix"] },
          coveragePct: {
            $cond: [
              { $eq: ["$openTickets", 0] },
              100,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$withMatrix", "$openTickets"] },
                      100,
                    ],
                  },
                  1,
                ],
              },
            ],
          },
        },
      },
      { $sort: { coveragePct: 1 } }, // Show lowest coverage first
    ]);

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error("getEscalationCoverage error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch escalation coverage report",
      error: error.message,
    });
  }
};

export default {
  getAllEscalationMatrices,
  getEscalationMatrixById,
  createEscalationMatrix,
  updateEscalationMatrix,
  deleteEscalationMatrix,
  toggleEscalationMatrixStatus,
  getAllowedEscalations,
  escalateTicketWithMatrix,
  assignMatrixToTicket,
  getUsersForLevel,
  processAutoEscalation,
  getAutoEscalationCandidates,
  getAutoEscalationJobLog,
  validateEscalationMatrix,
  getEscalationCoverage,
};
