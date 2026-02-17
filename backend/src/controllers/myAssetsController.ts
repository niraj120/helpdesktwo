import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { CenterAssetMapping } from '../models/CenterAssetMapping';
import { AssetAuditLog } from '../models/AssetAuditLog';
import { User } from '../models/User';
import { Center } from '../models/Center';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: any;
  };
}

/**
 * @desc    Get assets for user's center(s)
 * @route   GET /api/my-assets
 * @access  Private (requires MY_ASSETS_VIEW permission)
 */
export const getMyAssets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    console.log('=== GET MY ASSETS ===');
    console.log('User ID:', userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Find user and get their center(s)
    const user = await User.findById(userId).populate('centers');
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.log('✅ User found:', user.email);
    console.log('Raw centers:', user.centers);

    // Get user's center IDs and convert to ObjectIds for MongoDB query
    let centerIds: mongoose.Types.ObjectId[] = [];
    if (Array.isArray(user.centers)) {
      // Filter out null/undefined centers
      centerIds = user.centers
        .filter((c: any) => c && c._id)
        .map((c: any) => new mongoose.Types.ObjectId(c._id));
    } else if (user.centers) {
      centerIds = [new mongoose.Types.ObjectId((user.centers as any)._id)];
    }

    console.log('Center IDs:', centerIds);

    if (centerIds.length === 0) {
      console.log('⚠️ No centers assigned');
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No centers assigned to user',
      });
    }

    // Get centers to find their project IDs
    const centers = await Center.find({ _id: { $in: centerIds } });
    const projectIds = [...new Set(
      centers
        .filter(c => c.projectId) // Filter out centers without projectId
        .map(c => new mongoose.Types.ObjectId(c.projectId))
    )];

    console.log('Centers found:', centers.length);
    console.log('Center details:', centers.map(c => ({ 
      _id: c._id.toString(), 
      centerName: c.centerName, 
      projectId: c.projectId?.toString() 
    })));
    console.log('Project IDs extracted:', projectIds.map(id => id.toString()));

    if (projectIds.length === 0) {
      console.log('⚠️ No valid project IDs found from user centers');
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No projects found for user centers',
      });
    }

    // Fetch asset mappings - prioritize centerId for new structure, fall back to projectId for legacy
    // New structure: Each center has its own mapping with centerId set
    // Legacy structure: Mappings are at project level (centerId is null)
    const query = {
      $or: [
        { centerId: { $in: centerIds } },  // New: per-center mappings
        { 
          projectId: { $in: projectIds },
          centerId: { $exists: false }     // Legacy: project-level mappings
        },
        { 
          projectId: { $in: projectIds },
          centerId: null                   // Legacy: project-level mappings with null centerId
        }
      ]
    };
    
    console.log('Query for asset mappings:', JSON.stringify(query, null, 2));
    console.log('Looking for mappings with centerIds:', centerIds.map(id => id.toString()));
    console.log('Or legacy mappings with projectIds:', projectIds.map(id => id.toString()));
    
    // Don't populate projectId - in old structure it contains center ID which will fail to populate from Project collection
    const mappings = await CenterAssetMapping.find(query)
      .populate({
        path: 'assetId',
        select: 'name category unit predefinedCount icon',
        populate: {
          path: 'category',
          select: 'name',
        },
      })
      .populate({
        path: 'lastUpdatedBy',
        select: 'firstName lastName email',
      })
      .populate({
        path: 'lastAuditSubmittedBy',
        select: 'firstName lastName email',
      })
      .populate({
        path: 'centerId',
        select: 'centerName',
      })
      .sort({ createdAt: -1 });

    console.log('📊 Mappings found:', mappings.length);

    if (mappings.length === 0) {
      console.log('⚠️ No asset mappings found for user projects');
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No assets assigned to your centers yet',
      });
    }

    // For project-level mappings, all centers in the same project should see the same assets
    // For center-level mappings (new), show only the specific center's data
    const formattedMappings: any[] = [];

    // Map center IDs to their names
    const centerMap = centers.reduce((acc, center) => {
      acc[center._id.toString()] = center.centerName;
      return acc;
    }, {} as Record<string, string>);

    console.log('Center map for user:', centerMap);

    for (const mapping of mappings) {
      // Check if this is a center-level mapping (new structure)
      const mappingCenterId = mapping.centerId;
      
      if (mappingCenterId) {
        // NEW: Center-specific mapping - just add it with its center info
        const centerDoc = (mapping as any).centerId;
        const centerName = typeof centerDoc === 'object' ? centerDoc.centerName : centerMap[mappingCenterId.toString()];
        
        // Check audit status
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let canEdit = false;
        
        if (mapping.lastAuditDate && mapping.auditFrequencyMonths) {
          const lastAudit = new Date(mapping.lastAuditDate);
          lastAudit.setHours(0, 0, 0, 0);
          
          const nextAudit = mapping.nextAuditDate ? new Date(mapping.nextAuditDate) : null;
          if (nextAudit) {
            nextAudit.setHours(0, 0, 0, 0);
          }
          
          const isAuditDue = nextAudit && today >= nextAudit;
          const isInitialAudit = !nextAudit && today >= lastAudit;
          
          if ((isAuditDue || isInitialAudit) && mapping.auditSubmitted) {
            mapping.auditSubmitted = false;
            await mapping.save();
            console.log(`✅ Reset auditSubmitted for mapping ${mapping._id} (new audit cycle started)`);
          }
          
          canEdit = (isAuditDue || isInitialAudit) && !mapping.auditSubmitted;
        }
        
        formattedMappings.push({
          ...mapping.toObject(),
          centerName: centerName || 'Unknown Center',
          centerId: mappingCenterId,
          canEdit,
        });
      } else {
        // LEGACY: Project-level mapping - replicate for each user center in that project
        const matchingCenters = centers.filter(c => c.projectId?.toString() === String(mapping.projectId));
        
        console.log(`Legacy mapping ${mapping._id} (project: ${mapping.projectId}) matches ${matchingCenters.length} user centers`);

        for (const center of matchingCenters) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          let canEdit = false;
          
          if (mapping.lastAuditDate && mapping.auditFrequencyMonths) {
            const lastAudit = new Date(mapping.lastAuditDate);
            lastAudit.setHours(0, 0, 0, 0);
            
            const nextAudit = mapping.nextAuditDate ? new Date(mapping.nextAuditDate) : null;
            if (nextAudit) {
              nextAudit.setHours(0, 0, 0, 0);
            }
            
            const isAuditDue = nextAudit && today >= nextAudit;
            const isInitialAudit = !nextAudit && today >= lastAudit;
            
            if ((isAuditDue || isInitialAudit) && mapping.auditSubmitted) {
              mapping.auditSubmitted = false;
              await mapping.save();
              console.log(`✅ Reset auditSubmitted for mapping ${mapping._id} (new audit cycle started)`);
            }
            
            canEdit = (isAuditDue || isInitialAudit) && !mapping.auditSubmitted;
          }
          
          formattedMappings.push({
            ...mapping.toObject(),
            centerName: center.centerName,
            centerId: center._id,
            canEdit,
          });
        }
      }
    }

    // TEMPORARILY DISABLED: Filter out orphaned assets with Unknown Center (deleted center/project references)
    // const validMappings = formattedMappings.filter(m => m.centerName !== 'Unknown Center');

    console.log('📊 Total mappings:', formattedMappings.length);
    // console.log('✅ Valid mappings (excluding orphaned):', validMappings.length);
    // if (formattedMappings.length !== validMappings.length) {
    //   console.log('⚠️  Filtered out', formattedMappings.length - validMappings.length, 'orphaned assets');
    // }

    return res.status(200).json({
      success: true,
      data: formattedMappings, // Return all for now to debug
    });
  } catch (error: any) {
    console.error('Error fetching my assets:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch assets',
      error: error.message,
    });
  }
};

/**
 * @desc    Update asset working/not working counts
 * @route   PUT /api/my-assets/:id
 * @access  Private (requires MY_ASSETS_VIEW permission)
 */
export const updateMyAssetCounts = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { workingAsset, notWorkingAsset, remarks, centerId: requestCenterId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Find the original mapping
    let mapping = await CenterAssetMapping.findById(id)
      .populate('projectId')
      .populate('assetId');

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found',
      });
    }

    // Verify user has access to this center's assets
    const user = await User.findById(userId).populate('centers');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get user's center IDs
    let centerIds: string[] = [];
    if (Array.isArray(user.centers)) {
      centerIds = user.centers.map((c: any) => c._id.toString());
    } else if (user.centers) {
      centerIds = [(user.centers as any)._id.toString()];
    }

    // Get centers and verify project access
    const centers = await Center.find({ _id: { $in: centerIds } });
    const userProjectIds = centers.map(c => c.projectId.toString());
    const mappingProjectId = typeof mapping.projectId === 'object'
      ? (mapping.projectId as any)._id.toString()
      : String(mapping.projectId);

    if (!userProjectIds.includes(mappingProjectId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to update this asset',
      });
    }

    // Check if this is a legacy project-level mapping (no centerId)
    // If so, create a center-specific copy for this user's center
    const targetCenterId = requestCenterId || centerIds[0];
    
    if (!mapping.centerId && targetCenterId) {
      console.log(`🔀 Legacy project-level mapping detected. Creating center-specific copy for center ${targetCenterId}`);
      
      // Check if a center-specific mapping already exists
      let centerMapping = await CenterAssetMapping.findOne({
        centerId: targetCenterId,
        assetId: mapping.assetId,
      });
      
      if (!centerMapping) {
        // Create new center-specific mapping by cloning the project-level one
        const mappingObj = mapping.toObject();
        delete (mappingObj as any)._id;
        (mappingObj as any).centerId = new mongoose.Types.ObjectId(targetCenterId);
        
        centerMapping = await CenterAssetMapping.create(mappingObj);
        console.log(`✅ Created new center-specific mapping: ${centerMapping._id}`);
      }
      
      // Use the center-specific mapping from now on
      mapping = centerMapping;
    }

    console.log('🔍 [UPDATE] Request body:', req.body);
    console.log('🔍 [UPDATE] workingAsset:', workingAsset);
    console.log('🔍 [UPDATE] notWorkingAsset:', notWorkingAsset);
    console.log('🔍 [UPDATE] Current mapping - totalAssigned:', mapping.totalAssigned, 'workingAsset:', mapping.workingAsset, 'notWorkingAsset:', mapping.notWorkingAsset);

    // Store previous values for audit
    const previousValues = {
      workingAsset: mapping.workingAsset,
      notWorkingAsset: mapping.notWorkingAsset,
    };

    // Simple calculation: notWorking = total - working
    if (workingAsset !== undefined) {
      console.log('📝 [CALC] Received workingAsset:', workingAsset);
      mapping.workingAsset = workingAsset;
      mapping.notWorkingAsset = mapping.totalAssigned - workingAsset;
      console.log('✅ [CALC] After calc - workingAsset:', mapping.workingAsset, 'notWorkingAsset:', mapping.notWorkingAsset);
    } else if (notWorkingAsset !== undefined) {
      console.log('📝 [CALC] Received notWorkingAsset:', notWorkingAsset);
      mapping.notWorkingAsset = notWorkingAsset;
      mapping.workingAsset = mapping.totalAssigned - notWorkingAsset;
      console.log('✅ [CALC] After calc - workingAsset:', mapping.workingAsset, 'notWorkingAsset:', mapping.notWorkingAsset);
    }
    
    // Determine what changed
    let changeType: 'working_asset' | 'not_working_asset' | 'both' = 'both';
    if (workingAsset !== undefined) {
      changeType = 'working_asset';
    } else if (notWorkingAsset !== undefined) {
      changeType = 'not_working_asset';
    }
    
    // Update remark if provided
    if (remarks !== undefined) {
      (mapping as any).remark = remarks;
    }
    
    // NOTE: Do NOT update lastUpdatedBy here - this is Edit → Save, not Audit Submit
    // lastUpdatedBy and updatedAt will still be updated by Mongoose timestamps
    // but "Last Updated" column in UI will show lastAuditSubmittedAt (only updated on Submit)
    
    console.log('💾 [SAVE] Before save - workingAsset:', mapping.workingAsset, 'notWorkingAsset:', mapping.notWorkingAsset, 'remark:', (mapping as any).remark);
    await mapping.save();
    console.log('✅ [SAVE] After save - workingAsset:', mapping.workingAsset, 'notWorkingAsset:', mapping.notWorkingAsset);

    // Create audit log entry - use targetCenterId for center-specific tracking
    await AssetAuditLog.create({
      centerAssetMappingId: mapping._id,
      userId: userId,
      centerId: targetCenterId,
      assetId: mapping.assetId,
      changeType,
      previousValues,
      newValues: {
        workingAsset: mapping.workingAsset,
        notWorkingAsset: mapping.notWorkingAsset,
      },
      changedAt: new Date(),
      remarks,
    });

    // Fetch updated mapping with populated fields (use mapping._id as it may be a new center-specific copy)
    const updatedMapping = await CenterAssetMapping.findById(mapping._id)
      .populate({
        path: 'projectId',
        select: 'name projectName',
      })
      .populate({
        path: 'assetId',
        select: 'name category unit predefinedCount icon',
        populate: {
          path: 'category',
          select: 'name',
        },
      })
      .populate({
        path: 'lastUpdatedBy',
        select: 'firstName lastName email',
      });

    return res.status(200).json({
      success: true,
      message: 'Asset counts updated successfully',
      data: updatedMapping,
    });
  } catch (error: any) {
    console.error('Error updating asset counts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update asset counts',
      error: error.message,
    });
  }
};

/**
 * @desc    Get audit logs for a specific asset mapping
 * @route   GET /api/my-assets/:id/audit-logs
 * @access  Private (requires MY_ASSETS_VIEW permission)
 */
export const getAssetAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Verify mapping exists and user has access
    const mapping = await CenterAssetMapping.findById(id);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found',
      });
    }

    // Verify user access
    const user = await User.findById(userId).populate('centers');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get user's center IDs
    let centerIds: string[] = [];
    if (Array.isArray(user.centers)) {
      centerIds = user.centers.map((c: any) => c._id.toString());
    } else if (user.centers) {
      centerIds = [(user.centers as any)._id.toString()];
    }

    // Get centers and verify project access
    const centers = await Center.find({ _id: { $in: centerIds } });
    const userProjectIds = centers.map(c => c.projectId.toString());
    const mappingProjectId = mapping.projectId.toString();

    if (!userProjectIds.includes(mappingProjectId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to view audit logs for this asset',
      });
    }

    // Fetch audit logs
    const auditLogs = await AssetAuditLog.find({
      centerAssetMappingId: id,
    })
      .populate({
        path: 'userId',
        select: 'firstName lastName email',
      })
      .populate({
        path: 'assetId',
        select: 'name',
      })
      .sort({ changedAt: -1 })
      .limit(50); // Limit to last 50 entries

    return res.status(200).json({
      success: true,
      data: auditLogs,
    });
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message,
    });
  }
};

/**
 * @desc    Submit audit (locks editing until next audit date)
 * @route   POST /api/my-assets/:id/submit-audit
 * @access  Private
 */
export const submitAudit = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { centerId } = req.body; // Extract centerId for center-specific submissions
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Find the asset mapping
    let mapping = await CenterAssetMapping.findById(id);
    
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found',
      });
    }

    // Check if user has access to this asset's project
    const user = await User.findById(userId).populate('centers');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get user's center projects
    const userCenters = Array.isArray(user.centers) ? user.centers : user.centers ? [user.centers] : [];
    const userProjectIds = userCenters.map((c: any) => (c.projectId || c._id).toString());
    
    const mappingProjectId = mapping.projectId.toString();
    if (!userProjectIds.includes(mappingProjectId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this asset',
      });
    }

    // Determine target centerId - use provided centerId or mapping's existing centerId
    const targetCenterId = centerId || mapping.centerId;

    // Handle legacy mappings: If this mapping has no centerId but a centerId was provided,
    // we need to create a center-specific copy for this center
    if (!mapping.centerId && targetCenterId) {
      console.log('📋 submitAudit: Legacy mapping detected, creating center-specific copy for centerId:', targetCenterId);
      
      // Check if a center-specific mapping already exists
      const existingCenterMapping = await CenterAssetMapping.findOne({
        centerId: targetCenterId,
        assetId: mapping.assetId,
      });

      if (existingCenterMapping) {
        // Use the existing center-specific mapping
        mapping = existingCenterMapping;
        console.log('📋 submitAudit: Using existing center-specific mapping:', mapping._id);
      } else {
        // Create a new center-specific mapping as a copy
        const newMapping = new CenterAssetMapping({
          centerId: targetCenterId,
          projectId: mapping.projectId,
          assetId: mapping.assetId,
          totalAssigned: mapping.totalAssigned,
          workingAsset: mapping.workingAsset,
          notWorkingAsset: mapping.notWorkingAsset,
          remark: mapping.remark,
          auditFrequencyMonths: mapping.auditFrequencyMonths,
          lastUpdatedBy: userId,
          // Don't copy lastAuditDate or nextAuditDate yet - will set them below on submission
        });
        
        await newMapping.save();
        mapping = newMapping;
        console.log('📋 submitAudit: Created new center-specific mapping:', mapping._id);
      }
    }

    // Mark audit as submitted
    mapping.auditSubmitted = true;
    
    // Update lastAuditDate to today (when audit was submitted)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    mapping.lastAuditDate = today;
    
    // Set lastAuditSubmittedAt and lastAuditSubmittedBy (for "Last Updated" column)
    (mapping as any).lastAuditSubmittedAt = new Date(); // Full timestamp with time
    (mapping as any).lastAuditSubmittedBy = userId;
    
    // Calculate next audit date based on frequency from TODAY
    if (mapping.auditFrequencyMonths && mapping.auditFrequencyMonths > 0) {
      const nextDate = new Date(today);
      nextDate.setMonth(nextDate.getMonth() + mapping.auditFrequencyMonths);
      
      // Set the next audit date at start of day for consistency
      nextDate.setHours(0, 0, 0, 0);
      
      mapping.nextAuditDate = nextDate;
      
      console.log('✅ Audit submitted. lastAuditDate:', today, 'Next audit date:', nextDate);
    }
    
    mapping.lastUpdatedBy = userId as any;
    await mapping.save();

    // Create audit log for the submission
    try {
      await AssetAuditLog.create({
        centerAssetMappingId: mapping._id,
        userId: userId,
        centerId: targetCenterId,
        assetId: mapping.assetId,
        changeType: 'audit_submitted',
        previousValues: { auditSubmitted: false },
        newValues: { 
          auditSubmitted: true,
          lastAuditDate: today,
          nextAuditDate: mapping.nextAuditDate,
        },
        changedAt: new Date(),
        remarks: 'Audit submitted',
      });
    } catch (logError) {
      console.error('Failed to create audit log:', logError);
      // Don't fail the request if audit log fails
    }

    return res.status(200).json({
      success: true,
      message: 'Audit submitted successfully',
      data: mapping,
    });
  } catch (error: any) {
    console.error('Error submitting audit:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit audit',
      error: error.message,
    });
  }
};
