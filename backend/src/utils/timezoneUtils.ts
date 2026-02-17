/**
 * Timezone Utility Functions
 * 
 * Centralized utilities for timezone-aware date/time operations.
 * All SLA and working calendar calculations should use these functions.
 * 
 * Key Principle: Store dates in UTC, display and compare in target timezone
 * 
 * Usage:
 *   import { getDateInTimezone, getTimeStringInTimezone, getDayOfWeekInTimezone } from '../utils/timezoneUtils';
 *   
 *   // Get time string in specific timezone
 *   const timeStr = getTimeStringInTimezone(new Date(), 'Asia/Kolkata'); // "10:30"
 *   
 *   // Get day of week (0=Sunday, 6=Saturday) in timezone
 *   const dayOfWeek = getDayOfWeekInTimezone(new Date(), 'Asia/Kolkata'); // 1 (Monday)
 */

// Default timezone for the application
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// Day name to number mapping
export const DAY_MAP: Record<string, number> = {
  'Sun': 0, 'Sunday': 0,
  'Mon': 1, 'Monday': 1,
  'Tue': 2, 'Tuesday': 2,
  'Wed': 3, 'Wednesday': 3,
  'Thu': 4, 'Thursday': 4,
  'Fri': 5, 'Friday': 5,
  'Sat': 6, 'Saturday': 6,
};

// Number to short day name
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DatePartsInTimezone {
  year: number;
  month: number;       // 1-12
  day: number;         // 1-31
  dayOfWeek: number;   // 0-6 (Sunday=0)
  dayName: string;     // "Mon", "Tue", etc.
  hour: number;        // 0-23
  minute: number;      // 0-59
  second: number;      // 0-59
  timeString: string;  // "HH:MM"
  dateString: string;  // "YYYY-MM-DD"
}

/**
 * Get all date/time parts in a specific timezone
 * This is the core function - use this for all timezone-aware operations
 * 
 * @param date - UTC Date to convert
 * @param timezone - IANA timezone (e.g., 'Asia/Kolkata', 'America/New_York')
 * @returns Object with all date parts in the target timezone
 */
export function getDatePartsInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): DatePartsInTimezone {
  try {
    // Create formatter for each component type
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    parts.forEach(p => {
      partMap[p.type] = p.value;
    });
    
    const year = parseInt(partMap.year || '2000', 10);
    const month = parseInt(partMap.month || '1', 10);
    const day = parseInt(partMap.day || '1', 10);
    const weekdayShort = partMap.weekday || 'Mon';
    const hour = parseInt(partMap.hour || '0', 10);
    const minute = parseInt(partMap.minute || '0', 10);
    const second = parseInt(partMap.second || '0', 10);
    
    const dayOfWeek = DAY_MAP[weekdayShort] ?? 1;
    
    return {
      year,
      month,
      day,
      dayOfWeek,
      dayName: weekdayShort,
      hour,
      minute,
      second,
      timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      dateString: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    console.error(`Invalid timezone "${timezone}", falling back to UTC:`, error);
    return getDatePartsInTimezone(date, 'UTC');
  }
}

/**
 * Get time string (HH:MM) in a specific timezone
 * 
 * @param date - UTC Date
 * @param timezone - IANA timezone
 * @returns Time string "HH:MM"
 */
export function getTimeStringInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  return getDatePartsInTimezone(date, timezone).timeString;
}

/**
 * Get day of week in a specific timezone
 * 
 * @param date - UTC Date
 * @param timezone - IANA timezone
 * @returns Day of week (0=Sunday, 6=Saturday)
 */
export function getDayOfWeekInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): number {
  return getDatePartsInTimezone(date, timezone).dayOfWeek;
}

/**
 * Get hour (0-23) in a specific timezone
 */
export function getHourInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): number {
  return getDatePartsInTimezone(date, timezone).hour;
}

/**
 * Get date string (YYYY-MM-DD) in a specific timezone
 */
export function getDateStringInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  return getDatePartsInTimezone(date, timezone).dateString;
}

/**
 * Check if two dates are the same day in a specific timezone
 */
export function isSameDayInTimezone(date1: Date, date2: Date, timezone: string = DEFAULT_TIMEZONE): boolean {
  const parts1 = getDatePartsInTimezone(date1, timezone);
  const parts2 = getDatePartsInTimezone(date2, timezone);
  return parts1.year === parts2.year && 
         parts1.month === parts2.month && 
         parts1.day === parts2.day;
}

/**
 * Check if a time string is within a range
 * All strings should be in "HH:MM" format
 * 
 * @param timeStr - Time to check
 * @param startTime - Range start
 * @param endTime - Range end
 * @returns true if timeStr is within [startTime, endTime]
 */
export function isTimeInRange(timeStr: string, startTime: string, endTime: string): boolean {
  return timeStr >= startTime && timeStr <= endTime;
}

/**
 * Create a date in a specific timezone at a specific time
 * Useful for creating "start of working day" dates
 * 
 * @param dateInTimezone - Date parts (year, month, day) in target timezone
 * @param timeString - Time string "HH:MM" in target timezone
 * @param timezone - Target timezone
 * @returns UTC Date representing that moment
 */
export function createDateInTimezone(
  year: number,
  month: number,  // 1-12
  day: number,
  hour: number,
  minute: number,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  // Create ISO string for the target timezone
  // Then parse it back considering the offset
  const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  
  // Create a date using the target timezone offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Create a temporary date and adjust
  const targetDate = new Date(isoString);
  const targetParts = getDatePartsInTimezone(targetDate, timezone);
  
  // Calculate the offset (difference between what we want and what we got)
  const wantedMinutes = hour * 60 + minute;
  const gotMinutes = targetParts.hour * 60 + targetParts.minute;
  const offsetMinutes = wantedMinutes - gotMinutes;
  
  // Handle day crossing
  let dayDiff = 0;
  if (targetParts.day !== day) {
    dayDiff = day - targetParts.day;
    // Handle month boundaries
    if (Math.abs(dayDiff) > 15) {
      dayDiff = dayDiff > 0 ? dayDiff - 31 : dayDiff + 31;
    }
  }
  
  return new Date(targetDate.getTime() + (offsetMinutes + dayDiff * 24 * 60) * 60 * 1000);
}

/**
 * Get the start of a day in a specific timezone (00:00:00)
 */
export function getStartOfDayInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): Date {
  const parts = getDatePartsInTimezone(date, timezone);
  return createDateInTimezone(parts.year, parts.month, parts.day, 0, 0, timezone);
}

/**
 * Get the end of a day in a specific timezone (23:59:59)
 */
export function getEndOfDayInTimezone(date: Date, timezone: string = DEFAULT_TIMEZONE): Date {
  const parts = getDatePartsInTimezone(date, timezone);
  const endDate = createDateInTimezone(parts.year, parts.month, parts.day, 23, 59, timezone);
  return new Date(endDate.getTime() + 59 * 1000); // Add 59 seconds
}

/**
 * Format a date for display in a specific timezone
 * 
 * @param date - Date to format
 * @param timezone - Target timezone
 * @param options - Intl.DateTimeFormat options
 */
export function formatDateInTimezone(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true 
  }
): string {
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: timezone }).format(date);
}

/**
 * Get current date/time parts in default timezone
 */
export function getNowInDefaultTimezone(): DatePartsInTimezone {
  return getDatePartsInTimezone(new Date(), DEFAULT_TIMEZONE);
}

export default {
  DEFAULT_TIMEZONE,
  DAY_MAP,
  DAY_NAMES_SHORT,
  DAY_NAMES_FULL,
  getDatePartsInTimezone,
  getTimeStringInTimezone,
  getDayOfWeekInTimezone,
  getHourInTimezone,
  getDateStringInTimezone,
  isSameDayInTimezone,
  isTimeInRange,
  createDateInTimezone,
  getStartOfDayInTimezone,
  getEndOfDayInTimezone,
  formatDateInTimezone,
  getNowInDefaultTimezone,
};
