import { Request, Response } from "express";
import { Company } from "../../models/master-data/Company";

// Get all companies
export const getCompanies = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;
    const filter: any = {};
    if (includeInactive !== "true") {
      filter.isActive = true;
    }
    const companies = await Company.find(filter).sort({ name: 1 });
    return res.json({
      success: true,
      data: companies.map((c) => ({
        _id: c._id,
        name: c.name,
        value: c.name,
        isActive: c.isActive,
      })),
    });
  } catch (error) {
    console.error("Get companies error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Create company
export const createCompany = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Company name is required" });
    }
    const existing = await Company.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" },
    });
    if (existing) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Company with this name already exists",
        });
    }
    const company = new Company({ name: name.trim(), isActive: true });
    await company.save();
    return res.status(201).json({ success: true, data: company });
  } catch (error: any) {
    console.error("Create company error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Internal server error",
      });
  }
};

// Update company
export const updateCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const company = await Company.findById(id);
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }
    if (name !== undefined) company.name = name.trim();
    if (isActive !== undefined) company.isActive = isActive;
    await company.save();
    return res.json({ success: true, data: company });
  } catch (error: any) {
    console.error("Update company error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Internal server error",
      });
  }
};

// Delete company
export const deleteCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }
    await company.deleteOne();
    return res.json({ success: true, message: "Company deleted" });
  } catch (error: any) {
    console.error("Delete company error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Internal server error",
      });
  }
};
