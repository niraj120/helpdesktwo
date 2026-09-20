/**
 * Lead (admission enquiry) CRUD. Phase 4.
 */
import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/auth";
import { Lead } from "../../../models/Lead";
import { applyProjectScope, getProjectScope } from "../../../utils/projectScope";
import { getSrConfigForProject } from "../srConfigAdmin";
import { fetchMdmOptions } from "../../../services/mdmService";
import { syncLeadToCrm } from "../services/leadCrmSync";
import { notifySrActivity } from "../srActivity";

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

/**
 * Search the project's enquiry MDM (SR Settings → Prospect lookup) before the
 * new-lead form is filled in. A hit carries the enquiry's own fields so the
 * form opens pre-filled, plus the Hubble lead it already maps to — so
 * re-submitting keeps that lead number instead of raising a second enquiry.
 */
export const lookupLeads = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || "");
    const q = String(req.query.q || "").trim();
    if (!projectId) {
      res.status(400).json({ success: false, message: "projectId is required" });
      return;
    }
    if (q.length < 3) {
      res.json({ success: true, data: [], configured: true });
      return;
    }
    const cfg: any = await getSrConfigForProject(projectId);
    const lookup = cfg?.psr?.intake?.leadLookup || {};
    if (!lookup.enabled || !lookup.mdmSourceId) {
      res.json({ success: true, data: [], configured: false });
      return;
    }

    const { data } = await fetchMdmOptions({
      sourceId: lookup.mdmSourceId,
      projectId,
      dataType: (lookup.dataType || "custom") as any,
      search: q,
      searchParam: lookup.searchParam || "search",
      limit: 25,
    });

    const enquiryField = lookup.enquiryNoField || "enquiry_no";
    const pick = (row: any, ...keys: string[]) => {
      for (const k of keys) {
        const hit = Object.keys(row || {}).find(
          (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, ""),
        );
        if (hit && row[hit]) return String(row[hit]);
      }
      return "";
    };

    const rows = data.map((d: any) => {
      const raw = d.raw || {};
      return {
        enquiryNo: pick(raw, enquiryField, "enquiry_no", "enquiryNumber", "lead_no"),
        name:
          pick(raw, "parent_name", "name", "father_name", "mother_name") ||
          [pick(raw, "first_name"), pick(raw, "last_name")].filter(Boolean).join(" ").trim(),
        email: pick(raw, "email", "parent_email", "email_id"),
        contactNumber: pick(raw, "mobile", "mobile_no", "contact", "phone"),
        studentName:
          pick(raw, "student_name", "child_name") ||
          [pick(raw, "student_first_name"), pick(raw, "student_last_name")]
            .filter(Boolean)
            .join(" ")
            .trim(),
        grade: pick(raw, "grade", "grade_name", "class", "standard"),
        raw,
      };
    });

    // Match each enquiry to the Hubble lead it already created, if any.
    const numbers = rows.map((r) => r.enquiryNo).filter(Boolean);
    const mobiles = rows.map((r) => r.contactNumber).filter(Boolean);
    const existing = await Lead.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      $or: [
        ...(numbers.length ? [{ enquiryNo: { $in: numbers } }] : []),
        ...(mobiles.length ? [{ contactNumber: { $in: mobiles } }] : []),
      ],
    })
      .select("_id enquiryNo contactNumber email name status createdAt")
      .lean();

    const data2 = rows.map((r) => {
      const lead = existing.find(
        (l: any) =>
          (r.enquiryNo && l.enquiryNo === r.enquiryNo) ||
          (r.contactNumber && l.contactNumber === r.contactNumber),
      );
      return {
        ...r,
        existingLead: lead
          ? {
              id: String(lead._id),
              enquiryNo: lead.enquiryNo,
              status: lead.status,
              createdAt: lead.createdAt,
            }
          : null,
      };
    });

    res.json({ success: true, data: data2, configured: true });
  } catch (err: any) {
    console.error("[lead] lookup error:", err);
    res.status(500).json({ success: false, message: err?.message || "Server error" });
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

    // A known enquiry (picked from the MDM lookup, or matched on its enquiry
    // number) updates the lead it already has — its Hubble number must not
    // change just because the parent enquired again.
    const existing = req.body.leadId
      ? await Lead.findOne({ _id: req.body.leadId, projectId: req.body.projectId })
      : req.body.enquiryNo
        ? await Lead.findOne({ enquiryNo: req.body.enquiryNo, projectId: req.body.projectId })
        : null;
    if (existing) {
      Object.assign(existing, {
        ...req.body,
        _id: existing._id,
        enquiryNo: existing.enquiryNo || req.body.enquiryNo,
        name,
        contactNumber,
        email,
        studentName,
        grade,
        notes,
        formData: { ...(existing.formData || {}), ...formData },
        updatedBy: req.user?.userId,
        crmSyncStatus: shouldSyncCrm ? "pending" : existing.crmSyncStatus,
      });
      await existing.save();
      notifySrActivity(req.body.projectId, "leads", existing.enquiryNo || existing.name);
      const synced = shouldSyncCrm ? await syncLeadToCrm(String(existing._id)) : null;
      res.status(200).json({ success: true, data: synced || existing, updated: true });
      return;
    }

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

    notifySrActivity(req.body.projectId, "leads", lead.enquiryNo || lead.name);

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
