import express from 'express';
import {
    getSMSConfig,
    updateSMSSettings,
    updateSMSTrigger,
    testSMSTrigger
} from '../controllers/smsConfigController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all routes if required, or specific ones
// router.use(authenticate);

/**
 * @route   GET /api/sms-config/:projectId
 * @desc    Get SMS configuration for a project
 * @access  Private
 */
router.get('/:projectId', getSMSConfig);

/**
 * @route   PUT /api/sms-config/:projectId/settings
 * @desc    Update SMS API settings (User ID, Password, Master Toggle)
 * @access  Private
 */
router.put('/:projectId/settings', updateSMSSettings);

/**
 * @route   PUT /api/sms-config/:projectId/triggers/:triggerName
 * @desc    Update a specific SMS trigger
 * @access  Private
 */
router.put('/:projectId/triggers/:triggerName', updateSMSTrigger);

/**
 * @route   POST /api/sms-config/:projectId/triggers/:triggerName/test
 * @desc    Test a specific SMS trigger
 * @access  Private
 */
router.post('/:projectId/triggers/:triggerName/test', testSMSTrigger);

export default router;
