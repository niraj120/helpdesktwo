/**
 * DPDP Act 2023 Compliance: User Rights Controller
 * 
 * Implements Section 11 (Right to Access) and Section 12 (Right to Correction & Erasure)
 */

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { User } from '../../models/User';
import ConsentRecord from '../../models/dpdp/ConsentRecord';
import DataAccessLog from '../../models/dpdp/DataAccessLog';
import DeletionRequest, { DeletionScope, DeletionStatus } from '../../models/dpdp/DeletionRequest';
import crypto from 'crypto';

// Fields that cannot be updated once verified
const PROTECTED_FIELDS = ['email', 'mobileVerified', 'emailVerified'];

/**
 * @desc    Get all my personal data (Right to Access - Section 11)
 * @route   GET /api/dpdp/my-data
 * @access  Private
 */
export async function getMyData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    // Fetch all user-related data
    const [user, consents, dataAccessHistory] = await Promise.all([
      User.findById(userId).select('-password').lean(),
      ConsentRecord.find({ userId }).sort({ consentedAt: -1 }).lean(),
      DataAccessLog.find({ userId }).sort({ timestamp: -1 }).limit(100).lean(),
    ]);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // You can extend this to include tickets, feedback, etc.
    const response = {
      user,
      consents,
      dataAccessHistory,
      // tickets: [], // Add if needed
      // feedback: [], // Add if needed
    };

    res.json({
      success: true,
      data: response,
      message: 'Personal data retrieved successfully',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Get my data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve personal data',
      details: error.message,
    });
  }
}

/**
 * @desc    Update my personal data (Right to Correction - Section 12)
 * @route   PUT /api/dpdp/my-data
 * @access  Private
 */
export async function updateMyData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const updates = req.body;

    // Check for protected field updates
    const protectedFieldsInRequest = Object.keys(updates).filter(field =>
      PROTECTED_FIELDS.includes(field)
    );

    if (protectedFieldsInRequest.length > 0) {
      res.status(403).json({
        success: false,
        error: 'Cannot update verified fields',
        protectedFields: protectedFieldsInRequest,
      });
      return;
    }

    // Allowed fields for update
    const allowedUpdates: any = {};
    const allowedFields = ['firstName', 'lastName', 'phone', 'mobile', 'parentMobile'];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        allowedUpdates[field] = updates[field];
      }
    });

    if (Object.keys(allowedUpdates).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: updatedUser,
      message: 'Personal data updated successfully',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Update my data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update personal data',
      details: error.message,
    });
  }
}

/**
 * @desc    Request data deletion (Right to Erasure - Section 12)
 * @route   POST /api/dpdp/my-data/delete
 * @access  Private
 */
export async function requestDeletion(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { scope, dataCategories, reason } = req.body;

    // Check for pending deletion request
    const existingRequest = await DeletionRequest.findOne({
      userId,
      status: { $in: [DeletionStatus.PENDING, DeletionStatus.IN_PROGRESS] },
    });

    if (existingRequest) {
      res.status(409).json({
        success: false,
        error: 'A deletion request is already pending',
        existingRequest,
      });
      return;
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const deletionRequest = await DeletionRequest.create({
      userId,
      scope: scope || DeletionScope.FULL_ACCOUNT,
      dataCategories: dataCategories || [],
      reason: reason || 'User requested deletion',
      status: DeletionStatus.PENDING,
      verificationToken,
      tokenExpiry,
      requestedAt: new Date(),
    });

    // TODO: Send verification email/SMS with token
    console.log(`🔐 [DPDP] Deletion verification token: ${verificationToken}`);

    res.status(201).json({
      success: true,
      data: {
        requestId: deletionRequest._id,
        status: deletionRequest.status,
        verificationRequired: true,
        expiresAt: tokenExpiry,
      },
      message: 'Deletion request created. Please verify via email/SMS.',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Request deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create deletion request',
      details: error.message,
    });
  }
}

/**
 * @desc    Verify deletion request with token
 * @route   POST /api/dpdp/my-data/delete/verify
 * @access  Private
 */
export async function verifyDeletion(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        error: 'Verification token is required',
      });
      return;
    }

    const deletionRequest = await DeletionRequest.findOne({
      userId,
      verificationToken: token,
      status: DeletionStatus.PENDING,
      tokenExpiry: { $gt: new Date() },
    });

    if (!deletionRequest) {
      res.status(404).json({
        success: false,
        error: 'Invalid or expired verification token',
      });
      return;
    }

    deletionRequest.status = DeletionStatus.IN_PROGRESS;
    deletionRequest.verifiedAt = new Date();
    await deletionRequest.save();

    // In a real system, trigger the deletion workflow here
    console.log(`✅ [DPDP] Deletion request verified for user: ${userId}`);

    res.json({
      success: true,
      data: {
        requestId: deletionRequest._id,
        status: deletionRequest.status,
      },
      message: 'Deletion request verified. Processing will begin shortly.',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Verify deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify deletion request',
      details: error.message,
    });
  }
}

/**
 * @desc    Get status of deletion requests
 * @route   GET /api/dpdp/my-data/delete/status
 * @access  Private
 */
export async function getDeletionStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const deletionRequests = await DeletionRequest.find({ userId })
      .sort({ requestedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: deletionRequests,
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Get deletion status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve deletion status',
      details: error.message,
    });
  }
}

export default {
  getMyData,
  updateMyData,
  requestDeletion,
  verifyDeletion,
  getDeletionStatus,
};



