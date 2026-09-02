import express from 'express';
import {
    getSMSConfig,
    updateSMSSettings,
    updateSMSTrigger,
    testSMSTrigger,
    testStudentOTPStaticContent,
} from '../controllers/smsConfigController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { requireProjectAccess } from '../middleware/requireProjectAccess';

const router = express.Router();

// Every route here reads or writes SMS API credentials for a project. They were
// previously unauthenticated with a browser-supplied :projectId — anyone could
// read/write another project's SMS provider password. Gate all of them:
//   authenticate → has settings permission → owns THIS project.
// SMS config lives under project settings, so PROJECT_MANAGE_SETTINGS gates both
// read and write (the stored credentials must not leak to a non-admin).
router.use(authMiddleware);
router.use(checkPermission('PROJECT_MANAGE_SETTINGS'));

/**
 * @route   GET /api/sms-config/:projectId
 * @desc    Get SMS configuration for a project
 * @access  PROJECT_MANAGE_SETTINGS + project access
 */
router.get('/:projectId', requireProjectAccess('projectId'), getSMSConfig);

/**
 * @route   PUT /api/sms-config/:projectId/settings
 * @desc    Update SMS API settings (User ID, Password, Master Toggle)
 * @access  PROJECT_MANAGE_SETTINGS + project access
 */
router.put(
    '/:projectId/settings',
    requireProjectAccess('projectId'),
    updateSMSSettings,
);

/**
 * @route   PUT /api/sms-config/:projectId/triggers/:triggerName
 * @desc    Update a specific SMS trigger
 * @access  PROJECT_MANAGE_SETTINGS + project access
 */
router.put(
    '/:projectId/triggers/:triggerName',
    requireProjectAccess('projectId'),
    updateSMSTrigger,
);

/**
 * @route   POST /api/sms-config/:projectId/triggers/:triggerName/test
 * @desc    Test a specific SMS trigger
 * @access  PROJECT_MANAGE_SETTINGS + project access
 */
router.post(
    '/:projectId/triggers/:triggerName/test',
    requireProjectAccess('projectId'),
    testSMSTrigger,
);

/**
 * @route   POST /api/sms-config/:projectId/student-otp/test-static
 * @desc    Send static OTP SMS content (without variable replacement)
 * @access  PROJECT_MANAGE_SETTINGS + project access
 */
router.post(
    '/:projectId/student-otp/test-static',
    requireProjectAccess('projectId'),
    testStudentOTPStaticContent,
);

export default router;
