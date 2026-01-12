/**
 * DPDP Act 2023 Compliance: Routes
 * 
 * User Rights & Consent Management APIs
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth';
import consentController from '../controllers/dpdp/consentController';
import userRightsController from '../controllers/dpdp/userRightsController';

const router = express.Router();

// ==================== CONSENT MANAGEMENT ====================

/**
 * @route   POST /api/dpdp/consent
 * @desc    Give consent for data processing
 * @access  Private
 * @body    { purposes: ConsentPurpose[], dataCategories: string[], sharingAllowed?: boolean, marketingAllowed?: boolean }
 */
router.post('/consent', authMiddleware, consentController.giveConsent);

/**
 * @route   POST /api/dpdp/consent/bulk
 * @desc    Give bulk consent (for registration)
 * @access  Private
 */
router.post('/consent/bulk', authMiddleware, consentController.bulkConsent);

/**
 * @route   GET /api/dpdp/consent
 * @desc    Get my consent history
 * @access  Private
 */
router.get('/consent', authMiddleware, consentController.getMyConsents);

/**
 * @route   GET /api/dpdp/consent/status/:purpose
 * @desc    Check consent status for specific purpose
 * @access  Private
 */
router.get('/consent/status/:purpose', authMiddleware, consentController.checkConsentStatus);

/**
 * @route   POST /api/dpdp/consent/withdraw
 * @desc    Withdraw consent for specific purpose
 * @access  Private
 * @body    { purpose: ConsentPurpose }
 */
router.post('/consent/withdraw', authMiddleware, consentController.withdrawConsent);

// ==================== USER RIGHTS ====================

/**
 * @route   GET /api/dpdp/my-data
 * @desc    Get all my personal data (Right to Access - Section 11)
 * @access  Private
 */
router.get('/my-data', authMiddleware, userRightsController.getMyData);

/**
 * @route   PUT /api/dpdp/my-data
 * @desc    Update my personal data (Right to Correction - Section 12)
 * @access  Private
 * @body    { firstName?, lastName?, phone?, mobile?, parentMobile? }
 */
router.put('/my-data', authMiddleware, userRightsController.updateMyData);

/**
 * @route   POST /api/dpdp/my-data/delete
 * @desc    Request data deletion (Right to Erasure - Section 12)
 * @access  Private
 * @body    { scope?: 'FULL_ACCOUNT' | 'PARTIAL', dataCategories?: string[], reason?: string }
 */
router.post('/my-data/delete', authMiddleware, userRightsController.requestDeletion);

/**
 * @route   POST /api/dpdp/my-data/delete/verify
 * @desc    Verify deletion request with token
 * @access  Private
 * @body    { token: string }
 */
router.post('/my-data/delete/verify', authMiddleware, userRightsController.verifyDeletion);

/**
 * @route   GET /api/dpdp/my-data/delete/status
 * @desc    Get status of deletion requests
 * @access  Private
 */
router.get('/my-data/delete/status', authMiddleware, userRightsController.getDeletionStatus);

export default router;


