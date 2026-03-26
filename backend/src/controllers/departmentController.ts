import { Request, Response } from 'express';
import Department from '../models/Department';
import mongoose from 'mongoose';

// GET /api/departments/project/:projectId
export const getDepartmentsByProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const includeInactive = req.query.includeInactive === 'true';

    const filter: any = { projectId };
    if (!includeInactive) filter.isActive = true;

    const departments = await Department.find(filter).sort({ name: 1 });

    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch departments' });
  }
};

// POST /api/departments/project/:projectId
export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { name, description, isActive } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, error: 'Department name is required' });
      return;
    }

    const existing = await Department.findOne({ projectId, name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing) {
      res.status(400).json({ success: false, error: 'A department with this name already exists in this project' });
      return;
    }

    const createdBy = (req as any).user?._id;

    const department = await Department.create({
      name: name.trim(),
      description: description?.trim(),
      projectId,
      isActive: isActive !== false,
      createdBy,
    });

    res.status(201).json({ success: true, data: department });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ success: false, error: 'Department name already exists in this project' });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create department' });
  }
};

// PUT /api/departments/:id
export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid department ID' });
      return;
    }

    const department = await Department.findById(id);
    if (!department) {
      res.status(404).json({ success: false, error: 'Department not found' });
      return;
    }

    const { name, description, isActive } = req.body;

    // Check uniqueness if name is being changed
    if (name && name.trim() !== department.name) {
      const existing = await Department.findOne({
        projectId: department.projectId,
        name: { $regex: `^${name.trim()}$`, $options: 'i' },
        _id: { $ne: id },
      });
      if (existing) {
        res.status(400).json({ success: false, error: 'A department with this name already exists in this project' });
        return;
      }
    }

    if (name !== undefined) department.name = name.trim();
    if (description !== undefined) department.description = description?.trim();
    if (isActive !== undefined) department.isActive = isActive;

    await department.save();

    res.json({ success: true, data: department });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update department' });
  }
};

// DELETE /api/departments/:id
export const deleteDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid department ID' });
      return;
    }

    const department = await Department.findByIdAndDelete(id);
    if (!department) {
      res.status(404).json({ success: false, error: 'Department not found' });
      return;
    }

    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete department' });
  }
};
