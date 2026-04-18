import { Request, Response } from "express";
import { WorkingCalendar } from "../models/WorkingCalendar";
import mongoose from "mongoose";

// Get all working calendars (scoped by caller's project access)
export const getAllWorkingCalendars = async (req: Request, res: Response) => {
  try {
    const filter: any = {};

    // Auto project scoping: non-super-admins see only their assigned projects
    const callerRole = (req as any).user?.role;
    const isSuperAdmin =
      callerRole?.code === "SUPER_ADMIN" || callerRole?.name === "Super Admin";
    if (!isSuperAdmin && callerRole?.projects?.length > 0) {
      const allowedIds = callerRole.projects.map(
        (p: any) => new mongoose.Types.ObjectId(p._id || p),
      );
      filter.projectId = { $in: allowedIds };
    }

    const calendars = await WorkingCalendar.find(filter)
      .populate("projectId", "name code")
      .sort({ projectId: 1, isDefault: -1, name: 1 });

    return res.json({
      success: true,
      data: calendars,
    });
  } catch (error) {
    console.error("Error fetching all working calendars:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch working calendars",
    });
  }
};

// Get all working calendars for a project
export const getWorkingCalendarsByProject = async (
  req: Request,
  res: Response,
) => {
  try {
    const { projectId } = req.params;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid project ID is required",
      });
    }

    const calendars = await WorkingCalendar.find({ projectId })
      .populate("projectId", "name code")
      .sort({ isDefault: -1, name: 1 });

    return res.json({
      success: true,
      data: calendars,
    });
  } catch (error) {
    console.error("Error fetching working calendars:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch working calendars",
    });
  }
};

// Get default working calendar for a project
export const getDefaultWorkingCalendar = async (
  req: Request,
  res: Response,
) => {
  try {
    const { projectId } = req.params;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid project ID is required",
      });
    }

    const calendar = await WorkingCalendar.findOne({
      projectId,
      isDefault: true,
    }).populate("projectId", "name code");

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "No default working calendar found for this project",
      });
    }

    return res.json({
      success: true,
      data: calendar,
    });
  } catch (error) {
    console.error("Error fetching default working calendar:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch default working calendar",
    });
  }
};

// Get working calendar by ID
export const getWorkingCalendarById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid calendar ID is required",
      });
    }

    const calendar = await WorkingCalendar.findById(id).populate(
      "projectId",
      "name code",
    );

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "Working calendar not found",
      });
    }

    return res.json({
      success: true,
      data: calendar,
    });
  } catch (error) {
    console.error("Error fetching working calendar:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch working calendar",
    });
  }
};

// Create a new working calendar
export const createWorkingCalendar = async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      name,
      description,
      workingHours,
      holidays,
      timezone,
      isDefault,
    } = req.body;
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid project ID is required",
      });
    }

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Calendar name is required",
      });
    }

    // If this is being set as default, unset any existing default
    if (isDefault) {
      await WorkingCalendar.updateMany(
        { projectId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    const calendar = new WorkingCalendar({
      projectId,
      name,
      description,
      workingHours,
      holidays,
      timezone,
      isDefault,
      createdBy: userId,
    });

    await calendar.save();

    const populatedCalendar = await WorkingCalendar.findById(
      calendar._id,
    ).populate("projectId", "name code");

    return res.status(201).json({
      success: true,
      message: "Working calendar created successfully",
      data: populatedCalendar,
    });
  } catch (error: any) {
    console.error("Error creating working calendar:", error);
    // Return more specific error message for debugging
    const errorMessage =
      error.code === 11000
        ? "A calendar with this configuration already exists (duplicate key error)"
        : error.message || "Failed to create working calendar";
    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
};

// Update working calendar
export const updateWorkingCalendar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, workingHours, holidays, timezone, isDefault } =
      req.body;
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid calendar ID is required",
      });
    }

    const calendar = await WorkingCalendar.findById(id);

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "Working calendar not found",
      });
    }

    // If this is being set as default, unset any existing default
    if (isDefault && !calendar.isDefault) {
      await WorkingCalendar.updateMany(
        { projectId: calendar.projectId, isDefault: true, _id: { $ne: id } },
        { $set: { isDefault: false } },
      );
    }

    // Update fields
    if (name !== undefined) calendar.name = name;
    if (description !== undefined) calendar.description = description;
    if (workingHours !== undefined) calendar.workingHours = workingHours;
    if (holidays !== undefined) calendar.holidays = holidays;
    if (timezone !== undefined) calendar.timezone = timezone;
    if (isDefault !== undefined) calendar.isDefault = isDefault;
    if (userId) calendar.updatedBy = userId;

    await calendar.save();

    const populatedCalendar = await WorkingCalendar.findById(
      calendar._id,
    ).populate("projectId", "name code");

    return res.json({
      success: true,
      message: "Working calendar updated successfully",
      data: populatedCalendar,
    });
  } catch (error) {
    console.error("Error updating working calendar:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update working calendar",
    });
  }
};

// Delete working calendar
export const deleteWorkingCalendar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid calendar ID is required",
      });
    }

    const calendar = await WorkingCalendar.findById(id);

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "Working calendar not found",
      });
    }

    // Check if it's the default calendar
    if (calendar.isDefault) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete the default working calendar. Please set another calendar as default first.",
      });
    }

    await WorkingCalendar.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Working calendar deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting working calendar:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete working calendar",
    });
  }
};

// Add holiday to working calendar
export const addHoliday = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, name, description, isRecurring } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid calendar ID is required",
      });
    }

    if (!date || !name) {
      return res.status(400).json({
        success: false,
        message: "Date and name are required for holiday",
      });
    }

    const calendar = await WorkingCalendar.findById(id);

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "Working calendar not found",
      });
    }

    // Add holiday
    calendar.holidays.push({
      date: new Date(date),
      name,
      description,
      isRecurring: isRecurring || false,
    });

    await calendar.save();

    const populatedCalendar = await WorkingCalendar.findById(
      calendar._id,
    ).populate("projectId", "name code");

    return res.json({
      success: true,
      message: "Holiday added successfully",
      data: populatedCalendar,
    });
  } catch (error) {
    console.error("Error adding holiday:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add holiday",
    });
  }
};

// Remove holiday from working calendar
export const removeHoliday = async (req: Request, res: Response) => {
  try {
    const { id, holidayId } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid calendar ID is required",
      });
    }

    if (!holidayId || !mongoose.Types.ObjectId.isValid(holidayId)) {
      return res.status(400).json({
        success: false,
        message: "Valid holiday ID is required",
      });
    }

    const calendar = await WorkingCalendar.findById(id);

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "Working calendar not found",
      });
    }

    // Remove holiday
    calendar.holidays = calendar.holidays.filter(
      (h: any) => h._id.toString() !== holidayId,
    );

    await calendar.save();

    const populatedCalendar = await WorkingCalendar.findById(
      calendar._id,
    ).populate("projectId", "name code");

    return res.json({
      success: true,
      message: "Holiday removed successfully",
      data: populatedCalendar,
    });
  } catch (error) {
    console.error("Error removing holiday:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove holiday",
    });
  }
};

// Set calendar as default
export const setDefaultCalendar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid calendar ID is required",
      });
    }

    const calendar = await WorkingCalendar.findById(id);

    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: "Working calendar not found",
      });
    }

    // Unset all other defaults for this project
    await WorkingCalendar.updateMany(
      { projectId: calendar.projectId, isDefault: true },
      { $set: { isDefault: false } },
    );

    // Set this calendar as default
    calendar.isDefault = true;
    await calendar.save();

    const populatedCalendar = await WorkingCalendar.findById(
      calendar._id,
    ).populate("projectId", "name code");

    return res.json({
      success: true,
      message: "Calendar set as default successfully",
      data: populatedCalendar,
    });
  } catch (error) {
    console.error("Error setting default calendar:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to set default calendar",
    });
  }
};
