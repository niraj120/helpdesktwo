import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { CenterAssetMapping } from "../models/CenterAssetMapping";
import { Asset } from "../models/Asset";
import { Project } from "../models/Project";
import { Center } from "../models/Center";

// Configure multer for asset photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads/asset-photos");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "asset-" + uniqueSuffix + path.extname(file.originalname));
  },
});

export const uploadAssetPhotos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
}).array("photos", 10); // Max 10 photos

// @desc    Map assets to centers (bulk)
// @route   POST /api/center-assets/bulk-map
// @access  Private (Super Admin)
export const bulkMapAssets = async (req: Request, res: Response) => {
  try {
    const {
      assetIds,
      centerIds, // NEW: Direct center IDs
      projectIds, // LEGACY: Will be converted to center IDs
      projectId, // Single project reference
      applyToAllCenters,
      quantities,
      lastAuditDate,
      auditFrequencyMonths,
      nextAuditDate,
    } = req.body;
    const userId = (req as any).user.userId;

    console.log("📥 Bulk map request received:", {
      assetIds,
      centerIds,
      projectIds,
      projectId,
      quantities,
      lastAuditDate,
      auditFrequencyMonths,
    });

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Asset IDs are required",
      });
    }

    // Determine target centers
    let targetCenterIds: string[] = [];

    if (centerIds && Array.isArray(centerIds) && centerIds.length > 0) {
      // NEW: Direct center IDs provided
      targetCenterIds = centerIds;
    } else if (
      projectIds &&
      Array.isArray(projectIds) &&
      projectIds.length > 0
    ) {
      // LEGACY: Get all centers for the given projects
      const centers = await Center.find(
        { projectId: { $in: projectIds } },
        "_id",
      );
      targetCenterIds = centers.map((c) => c._id.toString());
    } else if (applyToAllCenters) {
      // Get all centers from active projects
      const allProjects = await Project.find({ isActive: true }, "_id");
      const centers = await Center.find(
        { projectId: { $in: allProjects.map((p) => p._id) } },
        "_id",
      );
      targetCenterIds = centers.map((c) => c._id.toString());
    }

    if (targetCenterIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Center IDs or Project IDs are required",
      });
    }

    const mappings = [];
    const errors = [];

    // Batch fetch all data upfront
    const [assets, centers, existingMappings] = await Promise.all([
      Asset.find({ _id: { $in: assetIds } }).lean(),
      Center.find({ _id: { $in: targetCenterIds } }).lean(),
      CenterAssetMapping.find({
        assetId: { $in: assetIds },
        centerId: { $in: targetCenterIds },
      }),
    ]);

    // Create lookup maps
    const assetMap = new Map(assets.map((a) => [a._id.toString(), a]));
    const centerMap = new Map(centers.map((c) => [c._id.toString(), c]));
    // Key by centerId-assetId for per-center lookups
    const mappingLookup = new Map(
      existingMappings.map((m) => [
        `${m.centerId?.toString()}-${m.assetId.toString()}`,
        m,
      ]),
    );

    for (const assetId of assetIds) {
      const asset = assetMap.get(assetId.toString());
      if (!asset) {
        errors.push(`Asset ${assetId} not found`);
        continue;
      }

      for (const centerId of targetCenterIds) {
        try {
          const center = centerMap.get(centerId);
          if (!center) {
            errors.push(`Center ${centerId} not found`);
            continue;
          }

          // Get quantity for this center (or use predefined count)
          const quantity =
            quantities && quantities[centerId] !== undefined
              ? quantities[centerId]
              : (asset as any).predefinedCount || 1;

          // Check if mapping already exists for this center+asset
          const existingMapping = mappingLookup.get(`${centerId}-${assetId}`);

          if (existingMapping) {
            // Update existing mapping
            existingMapping.totalAssigned = quantity;
            existingMapping.assetNotUsed = quantity;
            existingMapping.lastUpdatedBy = userId;

            if (lastAuditDate) {
              existingMapping.lastAuditDate = new Date(lastAuditDate);
            }
            if (auditFrequencyMonths !== undefined) {
              existingMapping.auditFrequencyMonths = auditFrequencyMonths;
            }
            // Save explicit nextAuditDate if provided; otherwise calculate from lastAuditDate + frequency
            if (nextAuditDate) {
              existingMapping.nextAuditDate = new Date(nextAuditDate);
            } else if (lastAuditDate && auditFrequencyMonths) {
              const calculated = new Date(lastAuditDate);
              calculated.setMonth(calculated.getMonth() + auditFrequencyMonths);
              existingMapping.nextAuditDate = calculated;
            }

            await existingMapping.save();
            console.log("✅ Updated CENTER mapping:", {
              centerId,
              centerName: (center as any).centerName,
              assetId,
              quantity,
            });
            mappings.push(existingMapping);
          } else {
            // Create new mapping with centerId
            const mappingData: any = {
              projectId: (center as any).projectId,
              centerId, // Store center ID
              assetId,
              totalAssigned: quantity,
              assetUsed: 0,
              assetNotUsed: quantity,
              workingAsset: 0,
              notWorkingAsset: 0,
              photos: [],
              lastUpdatedBy: userId,
            };

            if (lastAuditDate) {
              mappingData.lastAuditDate = new Date(lastAuditDate);
            }
            if (auditFrequencyMonths !== undefined) {
              mappingData.auditFrequencyMonths = auditFrequencyMonths;
            }
            // Save explicit nextAuditDate if provided; otherwise calculate from lastAuditDate + frequency
            if (nextAuditDate) {
              mappingData.nextAuditDate = new Date(nextAuditDate);
            } else if (lastAuditDate && auditFrequencyMonths) {
              const calculated = new Date(lastAuditDate);
              calculated.setMonth(calculated.getMonth() + auditFrequencyMonths);
              mappingData.nextAuditDate = calculated;
            }

            const newMapping = await CenterAssetMapping.create(mappingData);
            console.log("✅ Created CENTER mapping:", {
              centerId,
              centerName: (center as any).centerName,
              assetId,
              quantity,
            });
            mappings.push(newMapping);
          }
        } catch (error: any) {
          console.error("❌ Error mapping asset:", error);
          errors.push(
            `Error mapping asset ${assetId} to center ${centerId}: ${error.message}`,
          );
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: `Successfully mapped ${mappings.length} asset(s) to center(s)`,
      data: {
        mappings,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error: any) {
    console.error("Error bulk mapping assets:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to map assets",
      error: error.message,
    });
  }
};

// @desc    Get center asset mappings
// @route   GET /api/center-assets
// @access  Private
export const getCenterAssetMappings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const user = (req as any).user;

    const filter: any = {};

    // If projectId is provided, filter by it
    if (projectId) {
      filter.projectId = projectId;
    } else if (user.projectId) {
      // If user has projectId, filter by their project
      filter.projectId = user.projectId;
    }

    const mappings = await CenterAssetMapping.find(filter)
      .populate("projectId", "name customUrlPath")
      .populate("assetId", "name description category unit predefinedCount")
      .populate("lastUpdatedBy", "firstName lastName email")
      .sort({ updatedAt: -1 });

    // Filter out mappings where referenced docs were deleted (null after populate)
    const validMappings = mappings.filter(
      (m) => m.assetId != null && m.projectId != null,
    );

    return res.status(200).json({
      success: true,
      data: validMappings,
    });
  } catch (error: any) {
    console.error("Error fetching center asset mappings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch mappings",
      error: error.message,
    });
  }
};

// @desc    Get center asset mapping by ID
// @route   GET /api/center-assets/:id
// @access  Private
export const getCenterAssetMappingById = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const mapping = await CenterAssetMapping.findById(id)
      .populate("projectId", "name customUrlPath")
      .populate("assetId", "name description category unit predefinedCount")
      .populate("lastUpdatedBy", "firstName lastName email");

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Asset mapping not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: mapping,
    });
  } catch (error: any) {
    console.error("Error fetching center asset mapping:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch mapping",
      error: error.message,
    });
  }
};

// @desc    Update center asset mapping
// @route   PUT /api/center-assets/:id
// @access  Private
export const updateCenterAssetMapping = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { totalAssigned, assetUsed, assetNotUsed, workingAsset } = req.body;
    const userId = (req as any).user.userId;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Asset mapping not found",
      });
    }

    // Update fields
    if (totalAssigned !== undefined) mapping.totalAssigned = totalAssigned;
    if (assetUsed !== undefined) mapping.assetUsed = assetUsed;
    if (assetNotUsed !== undefined) mapping.assetNotUsed = assetNotUsed;
    if (workingAsset !== undefined) mapping.workingAsset = workingAsset;

    mapping.lastUpdatedBy = userId;

    await mapping.save();

    const updatedMapping = await CenterAssetMapping.findById(id)
      .populate("projectId", "name customUrlPath")
      .populate("assetId", "name description category unit")
      .populate("lastUpdatedBy", "firstName lastName email");

    return res.status(200).json({
      success: true,
      message: "Asset mapping updated successfully",
      data: updatedMapping,
    });
  } catch (error: any) {
    console.error("Error updating center asset mapping:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update mapping",
      error: error.message,
    });
  }
};

// @desc    Upload photos for center asset mapping
// @route   POST /api/center-assets/:id/photos
// @access  Private
export const uploadCenterAssetPhotos = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Asset mapping not found",
      });
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No photos uploaded",
      });
    }

    // Add photos to mapping
    const photos = (req.files as Express.Multer.File[]).map((file) => ({
      filename: file.filename,
      path: `/uploads/asset-photos/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    }));

    mapping.photos.push(...photos);
    mapping.lastUpdatedBy = userId;
    await mapping.save();

    return res.status(200).json({
      success: true,
      message: "Photos uploaded successfully",
      data: photos,
    });
  } catch (error: any) {
    console.error("Error uploading photos:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload photos",
      error: error.message,
    });
  }
};

// @desc    Delete photo from center asset mapping
// @route   DELETE /api/center-assets/:id/photos/:photoIndex
// @access  Private
export const deleteCenterAssetPhoto = async (req: Request, res: Response) => {
  try {
    const { id, photoIndex } = req.params;
    const userId = (req as any).user.userId;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Asset mapping not found",
      });
    }

    const index = parseInt(photoIndex);
    if (isNaN(index) || index < 0 || index >= mapping.photos.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid photo index",
      });
    }

    // Delete physical file
    const photo = mapping.photos[index];
    const filePath = path.join(__dirname, "../../", photo.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from array
    mapping.photos.splice(index, 1);
    mapping.lastUpdatedBy = userId;
    await mapping.save();

    return res.status(200).json({
      success: true,
      message: "Photo deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting photo:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete photo",
      error: error.message,
    });
  }
};

// @desc    Delete center asset mapping
// @route   DELETE /api/center-assets/:id
// @access  Private (Super Admin)
export const deleteCenterAssetMapping = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Asset mapping not found",
      });
    }

    // Delete all physical photo files
    for (const photo of mapping.photos) {
      const filePath = path.join(__dirname, "../../", photo.path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Failed to delete file: ${filePath}`, error);
        }
      }
    }

    await CenterAssetMapping.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Asset mapping deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting center asset mapping:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete mapping",
      error: error.message,
    });
  }
};

// @desc    Remove specific asset mappings for a center (when user unchecks assets)
// @route   DELETE /api/center-assets/unmap
// @access  Private (Super Admin)
export const unmapCenterAssets = async (req: Request, res: Response) => {
  try {
    const { centerId, projectId, assetIds } = req.body;

    if (
      !centerId ||
      !assetIds ||
      !Array.isArray(assetIds) ||
      assetIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "centerId and assetIds array are required",
      });
    }

    // Delete both per-center mappings (centerId field) AND legacy project-level
    // mappings (no centerId, matched by projectId) for the given assets.
    const deleteFilter: any = {
      assetId: { $in: assetIds },
      $or: [
        { centerId: centerId },
        ...(projectId
          ? [
              { centerId: { $exists: false }, projectId: projectId },
              { centerId: null, projectId: projectId },
            ]
          : []),
      ],
    };

    const result = await CenterAssetMapping.deleteMany(deleteFilter);

    console.log(
      `🗑️ Unmapped ${result.deletedCount} asset(s) from center ${centerId}`,
    );

    return res.status(200).json({
      success: true,
      message: `Removed ${result.deletedCount} asset mapping(s)`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error: any) {
    console.error("Error unmapping center assets:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to unmap assets",
      error: error.message,
    });
  }
};

// @desc    Get asset mapping statistics
// @route   GET /api/center-assets/stats/summary
// @access  Private
export const getAssetMappingStats = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const user = (req as any).user;

    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    } else if (user.projectId) {
      filter.projectId = user.projectId;
    }

    const stats = await CenterAssetMapping.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAssignedSum: { $sum: "$totalAssigned" },
          assetUsedSum: { $sum: "$assetUsed" },
          assetNotUsedSum: { $sum: "$assetNotUsed" },
          workingAssetSum: { $sum: "$workingAsset" },
          notWorkingAssetSum: { $sum: "$notWorkingAsset" },
          totalMappings: { $sum: 1 },
        },
      },
    ]);

    const result = stats[0] || {
      totalAssignedSum: 0,
      assetUsedSum: 0,
      assetNotUsedSum: 0,
      workingAssetSum: 0,
      notWorkingAssetSum: 0,
      totalMappings: 0,
    };

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
};
