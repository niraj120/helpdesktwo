/**
 * Cluster (school-group) CRUD. Phase 1 — Service Request master data.
 * Permission-gated on the routes (SR_CONFIG_MANAGE).
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { Cluster } from "../models/Cluster";

export const listClusters = async (_req: AuthRequest, res: Response) => {
  try {
    const clusters = await Cluster.find()
      .populate("projects", "name code")
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: clusters });
  } catch (err) {
    console.error("[cluster] list error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createCluster = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, projects = [] } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: "Name is required" });
      return;
    }
    const cluster = await Cluster.create({
      name,
      code,
      description,
      projects,
      createdBy: req.user?.userId,
    });
    res.status(201).json({ success: true, data: cluster });
  } catch (err: any) {
    if (err?.code === 11000) {
      res
        .status(400)
        .json({ success: false, message: "A cluster with this name exists" });
      return;
    }
    console.error("[cluster] create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateCluster = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, projects, isActive } = req.body;
    const update: any = { updatedBy: req.user?.userId };
    if (name !== undefined) update.name = name;
    if (code !== undefined) update.code = code;
    if (description !== undefined) update.description = description;
    if (projects !== undefined) update.projects = projects;
    if (isActive !== undefined) update.isActive = isActive;

    const cluster = await Cluster.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!cluster) {
      res.status(404).json({ success: false, message: "Cluster not found" });
      return;
    }
    res.json({ success: true, data: cluster });
  } catch (err) {
    console.error("[cluster] update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteCluster = async (req: AuthRequest, res: Response) => {
  try {
    const cluster = await Cluster.findByIdAndDelete(req.params.id);
    if (!cluster) {
      res.status(404).json({ success: false, message: "Cluster not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[cluster] delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
