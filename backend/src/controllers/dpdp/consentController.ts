/**
 * DPDP Act 2023 Compliance: Consent Management Controller
 * 
 * Handles explicit user consent for personal data processing
 * Implements Section 6 requirements (free, specific, informed consent)
 */

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ConsentRecord, { ConsentPurpose, ConsentStatus } from '../../models/dpdp/ConsentRecord';

const CURRENT_POLICY_VERSION = '2024.1'; // Should match your privacy policy version

/**
 * @desc    Give consent for data processing
 * @route   POST /api/dpdp/consent
 * @access  Private
 */
export async function giveConsent(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { purposes, dataCategories, sharingAllowed, marketingAllowed } = req.body;
    
    if (!purposes || !Array.isArray(purposes) || purposes.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one purpose is required',
      });
      return;
    }

    const consents = [];
    for (const purpose of purposes) {
      const consent = await ConsentRecord.create({
        userId: req.user!.userId,
        purpose,
        policyVersion: CURRENT_POLICY_VERSION,
        consentedAt: new Date(),
        status: ConsentStatus.ACTIVE,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        consentText: `I consent to processing of my personal data for ${purpose}`,
        dataCategories: dataCategories || ['basic'],
        sharingAllowed: sharingAllowed || false,
        marketingAllowed: marketingAllowed || false,
      });
      consents.push(consent);
    }

    res.status(201).json({
      success: true,
      data: { consents },
      message: 'Consent recorded successfully',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Give consent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record consent',
      details: error.message,
    });
  }
}

/**
 * @desc    Give bulk consent (for registration)
 * @route   POST /api/dpdp/consent/bulk
 * @access  Private
 */
export async function bulkConsent(req: AuthRequest, res: Response): Promise<void> {
  try {
    // Default purposes for account creation
    const defaultPurposes = [
      ConsentPurpose.ACCOUNT_CREATION,
      ConsentPurpose.PROFILE_MANAGEMENT,
      ConsentPurpose.COMMUNICATION,
    ];

    const consents = await Promise.all(
      defaultPurposes.map(purpose =>
        ConsentRecord.create({
          userId: req.user!.userId,
          purpose,
          policyVersion: CURRENT_POLICY_VERSION,
          consentedAt: new Date(),
          status: ConsentStatus.ACTIVE,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          consentText: `I consent to processing of my personal data for ${purpose}`,
          dataCategories: ['basic', 'contact'],
          sharingAllowed: false,
          marketingAllowed: false,
        })
      )
    );

    res.status(201).json({
      success: true,
      data: { consents },
      message: 'Bulk consent recorded successfully',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Bulk consent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record bulk consent',
      details: error.message,
    });
  }
}

/**
 * @desc    Get my consent history
 * @route   GET /api/dpdp/consent
 * @access  Private
 */
export async function getMyConsents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const consents = await ConsentRecord.find({
      userId: req.user!.userId,
    })
      .sort({ consentedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: { consents },
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Get consents error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve consent history',
      details: error.message,
    });
  }
}

/**
 * @desc    Check consent status for specific purpose
 * @route   GET /api/dpdp/consent/status/:purpose
 * @access  Private
 */
export async function checkConsentStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { purpose } = req.params;

    if (!Object.values(ConsentPurpose).includes(purpose as ConsentPurpose)) {
      res.status(400).json({
        success: false,
        error: 'Invalid consent purpose',
      });
      return;
    }

    const consent = await ConsentRecord.findOne({
      userId: req.user!.userId,
      purpose: purpose as ConsentPurpose,
      status: ConsentStatus.ACTIVE,
    });

    res.json({
      success: true,
      data: {
        hasActiveConsent: !!consent,
        consent: consent || null,
      },
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Check consent status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check consent status',
      details: error.message,
    });
  }
}

/**
 * @desc    Withdraw consent for specific purpose
 * @route   POST /api/dpdp/consent/withdraw
 * @access  Private
 */
export async function withdrawConsent(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { purpose } = req.body;

    if (!purpose || !Object.values(ConsentPurpose).includes(purpose)) {
      res.status(400).json({
        success: false,
        error: 'Valid purpose is required',
      });
      return;
    }

    const consent = await ConsentRecord.findOne({
      userId: req.user!.userId,
      purpose,
      status: ConsentStatus.ACTIVE,
    });

    if (!consent) {
      res.status(404).json({
        success: false,
        error: 'No active consent found for this purpose',
      });
      return;
    }

    // Use instance method if available, otherwise update directly
    if (typeof consent.withdraw === 'function') {
      await consent.withdraw();
    } else {
      consent.status = ConsentStatus.WITHDRAWN;
      consent.withdrawnAt = new Date();
      await consent.save();
    }

    res.json({
      success: true,
      data: {
        purpose,
        withdrawnAt: consent.withdrawnAt,
      },
      message: 'Consent withdrawn successfully',
    });
  } catch (error: any) {
    console.error('❌ [DPDP] Withdraw consent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to withdraw consent',
      details: error.message,
    });
  }
}

export default {
  giveConsent,
  bulkConsent,
  getMyConsents,
  checkConsentStatus,
  withdrawConsent,
};
