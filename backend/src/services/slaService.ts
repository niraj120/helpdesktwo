import mongoose from 'mongoose';
import { WorkingCalendar, IWorkingCalendar } from '../models/WorkingCalendar';
import { Priority, IPriority } from '../models/master-data/Priority';
import { EscalationMatrix, IEscalationMatrix, IEscalationLevel } from '../models/escalation-matrix/EscalationMatrix';

/**
 * SLA Service
 * Handles all SLA calculations with working calendar support
 */

/**
 * Convert time value and unit to hours
 */
export function convertToHours(value: number, unit: 'minutes' | 'hours' | 'days' | 'mins' | 'hrs'): number {
  switch (unit) {
    case 'minutes':
    case 'mins':
      return value / 60;
    case 'hours':
    case 'hrs':
      return value;
    case 'days':
      return value * 24;
    default:
      return value; // Default to hours
  }
}

/**
 * Convert hours to minutes
 */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/**
 * Calculate due date by adding working hours to start date
 * Takes into account working hours and holidays from the calendar
 */
export async function calculateDueDate(
  startDate: Date,
  durationHours: number,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<Date> {
  if (!workingCalendarId) {
    // No calendar specified - use simple date addition
    return new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
  }

  const calendar = await WorkingCalendar.findById(workingCalendarId);
  if (!calendar || !calendar.isActive) {
    // Calendar not found or inactive - use simple date addition
    return new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
  }

  let remainingMinutes = hoursToMinutes(durationHours);
  let currentDate = new Date(startDate);
  const maxIterations = 365 * 24 * 60; // Max 1 year worth of minutes
  let iterations = 0;

  while (remainingMinutes > 0 && iterations < maxIterations) {
    if (calendar.isWorkingTime(currentDate)) {
      remainingMinutes--;
    }
    // Move forward by 1 minute
    currentDate = new Date(currentDate.getTime() + 60 * 1000);
    iterations++;
  }

  return currentDate;
}

/**
 * Calculate working minutes between two dates
 */
export async function calculateWorkingMinutes(
  startDate: Date,
  endDate: Date,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<number> {
  if (!workingCalendarId) {
    // No calendar - calculate simple difference
    return Math.floor((endDate.getTime() - startDate.getTime()) / (60 * 1000));
  }

  const calendar = await WorkingCalendar.findById(workingCalendarId);
  if (!calendar || !calendar.isActive) {
    // Calendar not found or inactive - return simple difference
    return Math.floor((endDate.getTime() - startDate.getTime()) / (60 * 1000));
  }

  return calendar.calculateWorkingMinutes(startDate, endDate);
}

/**
 * Check if current time is within working hours
 */
export async function isWorkingTime(
  date: Date,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<boolean> {
  if (!workingCalendarId) {
    return true; // No calendar - always working
  }

  const calendar = await WorkingCalendar.findById(workingCalendarId);
  if (!calendar || !calendar.isActive) {
    return true; // Calendar not found - always working
  }

  return calendar.isWorkingTime(date);
}

/**
 * Get next working time from a given date
 */
export async function getNextWorkingTime(
  date: Date,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<Date> {
  if (!workingCalendarId) {
    return date; // No calendar - return same date
  }

  const calendar = await WorkingCalendar.findById(workingCalendarId);
  if (!calendar || !calendar.isActive) {
    return date; // Calendar not found - return same date
  }

  return calendar.getNextWorkingTime(date);
}

/**
 * Validate escalation levels against priority SLA
 * Ensures sum of all level durations doesn't exceed priority's resolution time
 */
export async function validateEscalationLevelsAgainstPriority(
  priorityCode: string,
  levels: IEscalationLevel[],
  projectId: mongoose.Types.ObjectId
): Promise<{ valid: boolean; reason?: string; totalHours?: number; priorityHours?: number }> {
  // Find priority — support both a raw ObjectId (_id) and a code string (e.g. "HIGH")
  // When looking up by _id, skip the projectId filter since _id is globally unique.
  let priority = null;
  if (mongoose.Types.ObjectId.isValid(priorityCode)) {
    priority = await Priority.findOne({
      _id: priorityCode,
      isActive: true,
    });
  }
  if (!priority) {
    priority = await Priority.findOne({
      code: priorityCode.toUpperCase(),
      projectId,
      isActive: true,
    });
  }

  if (!priority) {
    // Priority not found — skip validation rather than blocking matrix creation.
    // This can happen with custom project priorities whose ID format differs.
    console.warn(
      `[SLA] validateEscalationLevelsAgainstPriority: priority '${priorityCode}' not found — skipping time validation`,
    );
    return { valid: true };
  }

  // Calculate total escalation level duration — respecting slaUnit (mins/hrs/days)
  const totalLevelHours = levels.reduce((sum, level) => {
    const unit = (level as any).slaUnit ?? "hrs";
    return sum + convertToHours(level.slaHours, unit as any);
  }, 0);

  // Get priority resolution time in hours
  const priorityResolutionHours = convertToHours(
    priority.resolutionTime.value,
    priority.resolutionTime.unit
  );

  if (totalLevelHours > priorityResolutionHours) {
    return {
      valid: false,
      reason: `Total escalation time (${(totalLevelHours * 60).toFixed(0)} min) exceeds priority resolution time (${(priorityResolutionHours * 60).toFixed(0)} min)`,
      totalHours: totalLevelHours,
      priorityHours: priorityResolutionHours,
    };
  }

  return {
    valid: true,
    totalHours: totalLevelHours,
    priorityHours: priorityResolutionHours,
  };
}

/**
 * Validate entire escalation matrix against priorities
 * For PER_PRIORITY mode, validates each priority config separately
 */
export async function validateEscalationMatrix(
  matrix: IEscalationMatrix,
  projectId: mongoose.Types.ObjectId
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (matrix.priorityMode === 'SAME_FOR_ALL') {
    // For SAME_FOR_ALL mode, we can't validate without knowing which priorities exist
    // This validation should be done when assigning matrix to tickets
    return { valid: true, errors: [] };
  }

  // For PER_PRIORITY mode, validate each priority config
  for (const priorityConfig of matrix.priorityConfigs) {
    const validation = await validateEscalationLevelsAgainstPriority(
      priorityConfig.priorityCode,
      priorityConfig.levels,
      projectId
    );

    if (!validation.valid) {
      errors.push(`${priorityConfig.priorityCode}: ${validation.reason}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate ticket-level SLA (from creation to resolution based on priority)
 */
export async function calculateTicketLevelSLA(
  createdAt: Date,
  priorityCode: string,
  projectId: mongoose.Types.ObjectId,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<Date> {
  const priority = await Priority.findOne({
    code: priorityCode.toUpperCase(),
    projectId,
    isActive: true,
  });

  if (!priority) {
    // Default to 24 hours if priority not found
    return calculateDueDate(createdAt, 24, workingCalendarId);
  }

  const resolutionHours = convertToHours(
    priority.resolutionTime.value,
    priority.resolutionTime.unit
  );

  return calculateDueDate(createdAt, resolutionHours, workingCalendarId);
}

/**
 * Calculate role-level SLA (from escalation/assignment to next escalation)
 */
export async function calculateRoleLevelSLA(
  startedAt: Date,
  escalationMatrix: IEscalationMatrix,
  currentLevelNumber: number,
  priorityCode: string,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<Date> {
  // Get levels for this priority
  const levels = escalationMatrix.getLevelsForPriority(priorityCode);
  const currentLevel = levels.find(l => l.levelNumber === currentLevelNumber);

  if (!currentLevel) {
    // Default to 24 hours if level not found
    return calculateDueDate(startedAt, 24, workingCalendarId);
  }

  // Convert slaHours to actual hours based on slaUnit (mins, hrs, days)
  const slaUnit = currentLevel.slaUnit || 'hrs';
  const actualHours = convertToHours(currentLevel.slaHours, slaUnit as 'minutes' | 'hours' | 'days' | 'mins' | 'hrs');
  console.log(`📊 Level ${currentLevelNumber} SLA: ${currentLevel.slaHours} ${slaUnit} = ${actualHours} hours`);
  
  return calculateDueDate(startedAt, actualHours, workingCalendarId);
}

/**
 * Get default working calendar for a project
 */
export async function getDefaultWorkingCalendar(
  projectId: mongoose.Types.ObjectId
): Promise<IWorkingCalendar | null> {
  return await WorkingCalendar.findOne({
    projectId,
    isDefault: true,
    isActive: true,
  });
}

/**
 * Calculate remaining time (in minutes) until SLA breach
 * Returns negative value if already breached
 */
export async function calculateRemainingTime(
  dueAt: Date,
  pausedAt?: Date,
  pausedDuration: number = 0,
  workingCalendarId?: mongoose.Types.ObjectId
): Promise<number> {
  const now = new Date();
  
  // If currently paused, don't count time since pause
  if (pausedAt) {
    const workingMinutes = await calculateWorkingMinutes(pausedAt, dueAt, workingCalendarId);
    return workingMinutes + pausedDuration;
  }

  // Calculate working minutes from now to due date
  const workingMinutes = await calculateWorkingMinutes(now, dueAt, workingCalendarId);
  
  // Add back any paused duration
  return workingMinutes + pausedDuration;
}

export default {
  convertToHours,
  hoursToMinutes,
  calculateDueDate,
  calculateWorkingMinutes,
  isWorkingTime,
  getNextWorkingTime,
  validateEscalationLevelsAgainstPriority,
  validateEscalationMatrix,
  calculateTicketLevelSLA,
  calculateRoleLevelSLA,
  getDefaultWorkingCalendar,
  calculateRemainingTime,
};
