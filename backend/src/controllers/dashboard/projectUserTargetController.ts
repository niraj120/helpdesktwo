/**
 * projectUserTargetController — Phase 4
 *
 * GET  /api/v1/admin/projects/:id/user-target  — read headcount target
 * PUT  /api/v1/admin/projects/:id/user-target  — set headcount target
 *
 * Stores in Project.userTarget.required (project-level total enrollment target).
 */

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Project } from "../../models/Project";

// ─── GET /api/v1/admin/projects/:id/user-target ───────────────────────────────

export async function getProjectUserTarget(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid project id" });
      return;
    }

    const project = await Project.findById(id)
      .select("name projectId userTarget")
      .populate("userTarget.requiredUpdatedBy", "name email")
      .lean();

    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        projectId: (project as any)._id,
        projectCode: (project as any).projectId,
        projectName: (project as any).name,
        userTarget: (project as any).userTarget ?? null,
      },
    });
  } catch (err) {
    console.error("[getProjectUserTarget]", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ─── PUT /api/v1/admin/projects/:id/user-target ───────────────────────────────

export async function updateProjectUserTarget(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid project id" });
      return;
    }

    const { required } = req.body as { required?: number | null };
    if (
      required !== null &&
      required !== undefined &&
      (typeof required !== "number" || required < 0)
    ) {
      res
        .status(400)
        .json({
          success: false,
          message: "required must be a non-negative number or null",
        });
      return;
    }

    const userId = (req as any).user?._id ?? (req as any).user?.id;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    // Merge into existing userTarget sub-document
    (project as any).userTarget = {
      required: required ?? null,
      requiredUpdatedBy: userId
        ? new mongoose.Types.ObjectId(userId)
        : undefined,
      requiredUpdatedAt: new Date(),
    };

    await project.save();

    res.json({
      success: true,
      message: "User target updated",
      data: {
        projectId: project._id,
        userTarget: (project as any).userTarget,
      },
    });
  } catch (err) {
    console.error("[updateProjectUserTarget]", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
