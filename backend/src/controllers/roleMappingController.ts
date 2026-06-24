/**
 * RoleMappingRule CRUD. Phase 6 — onboarding role mapping.
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { RoleMappingRule } from "../models/RoleMappingRule";

export const listRules = async (req: AuthRequest, res: Response) => {
  try {
    const q: any = {};
    if (req.query.projectId) q.projectId = String(req.query.projectId);
    const rules = await RoleMappingRule.find(q)
      .populate("roleId", "name code")
      .sort({ priority: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, data: rules });
  } catch (err) {
    console.error("[roleMapping] list error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createRule = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, matchType, matchValue, roleId } = req.body;
    if (!projectId || !matchType || !matchValue || !roleId) {
      res.status(400).json({
        success: false,
        message: "projectId, matchType, matchValue and roleId are required",
      });
      return;
    }
    const rule = await RoleMappingRule.create({
      ...req.body,
      createdBy: req.user?.userId,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    console.error("[roleMapping] create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateRule = async (req: AuthRequest, res: Response) => {
  try {
    const rule = await RoleMappingRule.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?.userId },
      { new: true, runValidators: true },
    );
    if (!rule) {
      res.status(404).json({ success: false, message: "Rule not found" });
      return;
    }
    res.json({ success: true, data: rule });
  } catch (err) {
    console.error("[roleMapping] update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteRule = async (req: AuthRequest, res: Response) => {
  try {
    const rule = await RoleMappingRule.findByIdAndDelete(req.params.id);
    if (!rule) {
      res.status(404).json({ success: false, message: "Rule not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[roleMapping] delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
