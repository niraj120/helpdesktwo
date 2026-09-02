import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { requireProjectAccess } from '../middleware/requireProjectAccess';
import {
  registerStudent,
  createOfflineTicket,
  getOfflineModuleSettings,
  viewStudentRecords,
  editStudentRecord,
  getCenters
} from '../controllers/offlineModuleController';
import { PERMISSION_CODES } from '../constants/permissions';

const router = Router();

// All routes are project-scoped walk-in operations. Require authentication AND
// access to the project in the URL (an agent must not register students or
// raise tickets under a project they aren't assigned to).
router.use(authMiddleware);
const ownsProject = requireProjectAccess('projectId');

/**
 * @route   GET /api/offline-module/:projectId/settings
 * @desc    Get offline module settings for a project
 * @access  Agents with OFFLINE_MODULE_ACCESS permission
 */
router.get(
  '/:projectId/settings',
  requirePermission(PERMISSION_CODES.OFFLINE_MODULE_ACCESS),
  ownsProject,
  getOfflineModuleSettings
);

/**
 * @route   POST /api/offline-module/:projectId/register-student
 * @desc    Register a student on their behalf when they walk in
 * @access  Agents with OFFLINE_STUDENT_REGISTER permission
 */
router.post(
  '/:projectId/register-student',
  requirePermission(PERMISSION_CODES.OFFLINE_STUDENT_REGISTER),
  ownsProject,
  registerStudent
);

/**
 * @route   POST /api/offline-module/:projectId/create-ticket
 * @desc    Create ticket on behalf of student during walk-in
 * @access  Agents with OFFLINE_TICKET_CREATE permission
 */
router.post(
  '/:projectId/create-ticket',
  requirePermission(PERMISSION_CODES.OFFLINE_TICKET_CREATE),
  ownsProject,
  createOfflineTicket
);

/**
 * @route   GET /api/offline-module/:projectId/students
 * @desc    View registered student records
 * @access  Agents with OFFLINE_STUDENT_VIEW permission
 */
router.get(
  '/:projectId/students',
  requirePermission(PERMISSION_CODES.OFFLINE_STUDENT_VIEW),
  ownsProject,
  viewStudentRecords
);

/**
 * @route   PUT /api/offline-module/:projectId/students/:studentId
 * @desc    Edit student record
 * @access  Agents with OFFLINE_STUDENT_EDIT permission
 */
router.put(
  '/:projectId/students/:studentId',
  requirePermission(PERMISSION_CODES.OFFLINE_STUDENT_EDIT),
  ownsProject,
  editStudentRecord
);

/**
 * @route   GET /api/offline-module/:projectId/centers
 * @desc    Get all centers for a project from Center master table
 * @access  Authenticated users
 */
router.get(
  '/:projectId/centers',
  ownsProject,
  getCenters
);

export default router;
