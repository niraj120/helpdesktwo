/**
 * Lead (admission enquiry) CRUD. Phase 4.
 */
import { Response } from "express";
import { AuthRequest } from "../../../middleware/auth";
import { Lead } from "../../../models/Lead";
import { applyProjectScope, getProjectScope } from "../../../utils/projectScope";
import { syncLeadToCrm } from "../services/leadCrmSync";

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
    if (req.query.crmSyncStatus && req.query.crmSyncStatus !== "all")
      q.crmSyncStatus = String(req.query.crmSyncStatus);
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
    const formData =
      req.body.formData && typeof req.body.formData === "object"
        ? req.body.formData
        : {};
    const name =
      req.body.name ||
      formData.name ||
      formData.parentName ||
      [formData.firstName || formData.parentFirstName, formData.lastName || formData.parentLastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    const contactNumber =
      req.body.contactNumber || formData.contactNumber || formData.mobile || formData.phone;
    const email = req.body.email || formData.email || formData.parentEmail;
    const studentName =
      req.body.studentName ||
      formData.studentName ||
      [formData.studentFirstName, formData.studentLastName].filter(Boolean).join(" ").trim();
    const grade = req.body.grade || formData.gradeLabel || formData.grade;
    const notes = req.body.notes || formData.notes || formData.enquiry || formData.query;

    if (!req.body.projectId || !name) {
      res.status(400).json({ success: false, message: "projectId and lead name are required" });
      return;
    }
    const shouldSyncCrm = req.body.syncCrm !== false;
    const lead = await Lead.create({
      ...req.body,
      name,
      contactNumber,
      email,
      studentName,
      grade,
      notes,
      formData,
      crmSyncStatus: shouldSyncCrm ? "pending" : req.body.crmSyncStatus || "not_required",
      createdBy: req.user?.userId,
    });

    if (!shouldSyncCrm) {
      res.status(201).json({ success: true, data: lead });
      return;
    }

    const syncedLead = await syncLeadToCrm(String(lead._id));
    res.status(201).json({ success: true, data: syncedLead || lead });
  } catch (err) {
    console.error("[lead] create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const retryLeadCrmSync = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead not found" });
      return;
    }
    lead.crmSyncStatus = "pending";
    lead.crmSyncReason = undefined;
    await lead.save();
    const syncedLead = await syncLeadToCrm(String(lead._id));
    res.json({ success: true, data: syncedLead || lead });
  } catch (err) {
    console.error("[lead] CRM retry error:", err);
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
