import express from 'express';
import { authMiddleware } from '../middleware/auth';
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

// Get all working calendars (root path - also accessible via /all)
router.get('/', authMiddleware, getAllWorkingCalendars);

// Get all working calendars (Super Admin - no project filter)
router.get('/all', authMiddleware, getAllWorkingCalendars);

// Get all working calendars for a project
router.get('/project/:projectId', authMiddleware, getWorkingCalendarsByProject);

// Get default working calendar for a project
router.get('/project/:projectId/default', authMiddleware, getDefaultWorkingCalendar);

// Get working calendar by ID
router.get('/:id', authMiddleware, getWorkingCalendarById);

// Create new working calendar
router.post('/', authMiddleware, createWorkingCalendar);

// Update working calendar
router.put('/:id', authMiddleware, updateWorkingCalendar);

// Delete working calendar
router.delete('/:id', authMiddleware, deleteWorkingCalendar);

// Set calendar as default
router.put('/:id/set-default', authMiddleware, setDefaultCalendar);

// Add holiday to calendar
router.post('/:id/holidays', authMiddleware, addHoliday);

// Remove holiday from calendar
router.delete('/:id/holidays/:holidayId', authMiddleware, removeHoliday);

export default router;
