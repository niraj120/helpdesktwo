import { Request, Response } from 'express';
import { Permission } from '../models/Permission';

export const getApprovalMasters = async (req: Request, res: Response) => {
  try {
    // Fetch all active permissions as categories
    const permissions = await Permission.find({ isActive: true })
      .sort({ category: 1, module: 1, name: 1 });

    // Map permissions directly as categories (each permission is a category option)
    const categories = permissions.map((perm) => ({
      _id: perm._id.toString(),
      key: perm.code,
      name: perm.name,
      description: perm.description,
      module: perm.module,
      category: perm.category,
    }));

    res.json({
      success: true,
      data: {
        categories,
      },
    });
  } catch (error) {
    console.error('Approval master fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load approval masters' });
  }
};
