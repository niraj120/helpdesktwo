import { Request, Response } from "express";
import { Status } from "../models/Status";
import { Project } from "../models/Project";
import { AuthRequest } from "../middleware/auth";

// Get all statuses across all projects (for debugging/admin)
export const getAllStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const { includeInactive } = req.query;

    const filter: any = {};
    if (includeInactive !== "true") {
      filter.isActive = true;
    }

    const statuses = await Status.find(filter)
      .populate("projectId", "name code projectId")
      .sort({ projectId: 1, displayOrder: 1, name: 1 });

    console.log(`Found ${statuses.length} total statuses across all projects`);

    return res.json({
      success: true,
      data: statuses,
      count: statuses.length,
    });
  } catch (error) {
    console.error("Get all statuses error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get all statuses for a project
export const getStatusesByProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { includeInactive } = req.query;

    console.log(
      `🏷️  Fetching statuses for project: ${projectId}, includeInactive: ${includeInactive}`,
    );

    const filter: any = { projectId };
    if (includeInactive !== "true") {
      filter.isActive = true;
    }

    const statuses = await Status.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .select(
        "name code color isDefault isClosed displayOrder description isActive projectId requireClosingRemark requireCommittedDate committedDateLabel",
      );

    console.log(
      `🏷️  Found ${statuses.length} statuses for project ${projectId}`,
    );

    // Also check if there are ANY statuses in the database
    const totalStatuses = await Status.countDocuments({});
    console.log(`🏷️  Total statuses in database: ${totalStatuses}`);

    if (totalStatuses > 0 && statuses.length === 0) {
      // Let's see what projectIds exist
      const allProjectIds = await Status.distinct("projectId");
      console.log(`🏷️  Statuses exist for these project IDs:`, allProjectIds);
    }

    return res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    console.error("Get statuses error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Create a new status
export const createStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      name,
      code,
      color,
      isDefault,
      isClosed,
      requireClosingRemark,
      requireCommittedDate,
      committedDateLabel,
      displayOrder,
      description,
    } = req.body;
    const userId = req.user?.userId;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "Status name and code are required",
      });
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if status code already exists for this project
    const existingStatus = await Status.findOne({
      code: Number(code),
      projectId,
    });
    if (existingStatus) {
      return res.status(400).json({
        success: false,
        message: "Status with this code already exists in this project",
      });
    }

    // If this is set as default, unset other default statuses
    if (isDefault) {
      await Status.updateMany(
        { projectId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    const status = new Status({
      name,
      code: Number(code),
      color: color || "#3b82f6",
      projectId,
      isDefault: isDefault || false,
      isClosed: isClosed || false,
      requireClosingRemark: requireClosingRemark || false,
      requireCommittedDate: requireCommittedDate || false,
      committedDateLabel: committedDateLabel || undefined,
      displayOrder: displayOrder || 0,
      description,
      createdBy: userId,
    });

    await status.save();


    return res.status(201).json({
      success: true,
      message: "Status created successfully",
      data: status,
    });
  } catch (error) {
    console.error("Create status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update a status
export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;
    const {
      name,
      code,
      color,
      isDefault,
      isClosed,
      requireClosingRemark,
      requireCommittedDate,
      committedDateLabel,
      displayOrder,
      description,
      isActive,
    } = req.body;
    const userId = req.user?.userId;

    // Load current doc to check isDefault and get projectId
    const existing = await Status.findById(statusId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      });
    }

    // If setting this as default, unset other default statuses first
    if (isDefault && !existing.isDefault) {
      await Status.updateMany(
        {
          projectId: existing.projectId,
          isDefault: true,
          _id: { $ne: statusId },
        },
        { $set: { isDefault: false } },
      );
    }

    // Build the $set payload — only include fields present in request body
    const $set: Record<string, any> = { updatedBy: userId };
    if (name !== undefined) $set.name = name;
    if (code !== undefined) $set.code = Number(code);
    if (color !== undefined) $set.color = color;
    if (isDefault !== undefined) $set.isDefault = isDefault;
    if (isClosed !== undefined) $set.isClosed = isClosed;
    if (requireClosingRemark !== undefined)
      $set.requireClosingRemark = requireClosingRemark;
    if (requireCommittedDate !== undefined)
      $set.requireCommittedDate = requireCommittedDate;
    if (committedDateLabel !== undefined)
      $set.committedDateLabel = committedDateLabel;
    if (displayOrder !== undefined) $set.displayOrder = displayOrder;
    if (description !== undefined) $set.description = description;
    if (isActive !== undefined) $set.isActive = isActive;

    // Use findByIdAndUpdate so ALL fields — including those absent from old docs — are written atomically
    const updated = await Status.findByIdAndUpdate(
      statusId,
      { $set },
      { new: true, runValidators: true },
    );


    return res.json({
      success: true,
      message: "Status updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Delete a status
export const deleteStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      });
    }

    // Prevent deletion of default status
    if (status.isDefault) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete the default status. Please set another status as default first.",
      });
    }

    // Soft delete - just mark as inactive
    const statusName = status.name;
    const statusCode = status.code;
    const projectId = status.projectId;

    status.isActive = false;
    await status.save();


    return res.json({
      success: true,
      message: "Status deleted successfully",
    });
  } catch (error) {
    console.error("Delete status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get a single status
export const getStatusById = async (req: Request, res: Response) => {
  try {
    const { statusId } = req.params;

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      });
    }

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("Get status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Reorder statuses
export const reorderStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { statusIds } = req.body; // Array of status IDs in the new order

    if (!Array.isArray(statusIds)) {
      return res.status(400).json({
        success: false,
        message: "statusIds must be an array",
      });
    }

    // Update display order for each status
    const updatePromises = statusIds.map((statusId, index) =>
      Status.findByIdAndUpdate(statusId, { displayOrder: index }),
    );

    await Promise.all(updatePromises);

    return res.json({
      success: true,
      message: "Statuses reordered successfully",
    });
  } catch (error) {
    console.error("Reorder statuses error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
