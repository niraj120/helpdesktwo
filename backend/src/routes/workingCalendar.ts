import express from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  requireProjectAccess,
  requireResourceProject,
} from '../middleware/requireProjectAccess';
import { WorkingCalendar } from '../models/WorkingCalendar';
import {
  getAllWorkingCalendars,
  getWorkingCalendarsByProject,
  getDefaultWorkingCalendar,
  getWorkingCalendarById,
  createWorkingCalendar,
  updateWorkingCalendar,
  deleteWorkingCalendar,
  addHoliday,
  removeHoliday,
  setDefaultCalendar,
} from '../controllers/workingCalendarController';

const router = express.Router();
const ownsCalendar = requireResourceProject(WorkingCalendar, 'id');

// Get all working calendars (root path - also accessible via /all)
router.get('/', authMiddleware, getAllWorkingCalendars);

// Get all working calendars (Super Admin - no project filter)
router.get('/all', authMiddleware, getAllWorkingCalendars);

// Get all working calendars for a project
router.get('/project/:projectId', authMiddleware, requireProjectAccess('projectId'), getWorkingCalendarsByProject);

// Get default working calendar for a project
router.get('/project/:projectId/default', authMiddleware, requireProjectAccess('projectId'), getDefaultWorkingCalendar);

// Get working calendar by ID
router.get('/:id', authMiddleware, ownsCalendar, getWorkingCalendarById);

// Create new working calendar (projectId in body)
router.post('/', authMiddleware, requireProjectAccess('projectId'), createWorkingCalendar);

// Update working calendar
router.put('/:id', authMiddleware, ownsCalendar, updateWorkingCalendar);

// Delete working calendar
router.delete('/:id', authMiddleware, ownsCalendar, deleteWorkingCalendar);

// Set calendar as default
router.put('/:id/set-default', authMiddleware, ownsCalendar, setDefaultCalendar);

// Add holiday to calendar
router.post('/:id/holidays', authMiddleware, ownsCalendar, addHoliday);

// Remove holiday from calendar
router.delete('/:id/holidays/:holidayId', authMiddleware, ownsCalendar, removeHoliday);

export default router;
