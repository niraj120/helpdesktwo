/**
 * Lead (admission enquiry) CRUD. Phase 4.
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { Lead } from "../models/Lead";
import { applyProjectScope, getProjectScope } from "../utils/projectScope";

export const listLeads = async (req: AuthRequest, res: Response) => {
  try {
    const q: any = {};
    applyProjectScope(
      q,
      "projectId",
      req.query.projectId ? String(req.query.projectId) : undefined,
      getProjectScope(req),
    );
    if (req.query.status && req.query.status !== "all")
      q.status = String(req.query.status);
    if (req.query.search) {
      const rx = new RegExp(
        String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      q.$or = [{ name: rx }, { email: rx }, { contactNumber: rx }, { enquiryNo: rx }];
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [items, total] = await Promise.all([
      Lead.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Lead.countDocuments(q),
    ]);
    res.json({ success: true, items, total, page, limit });
  } catch (err) {
    console.error("[lead] list error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createLead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.body.projectId || !req.body.name) {
      res.status(400).json({ success: false, message: "projectId and name are required" });
      return;
    }
    const lead = await Lead.create({ ...req.body, createdBy: req.user?.userId });
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    console.error("[lead] create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateLead = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?.userId },
      { new: true, runValidators: true },
    );
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead not found" });
      return;
    }
    res.json({ success: true, data: lead });
  } catch (err) {
    console.error("[lead] update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteLead = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[lead] delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
