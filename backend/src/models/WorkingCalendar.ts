import mongoose, { Document, Schema } from 'mongoose';
import { getDatePartsInTimezone, isTimeInRange, DEFAULT_TIMEZONE } from '../utils/timezoneUtils';

/**
 * Working Hours Interface
 * Defines working hours for each day of the week
 */
export interface IWorkingHours {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isWorkingDay: boolean;
  startTime: string; // HH:MM format (e.g., "09:00")
  endTime: string; // HH:MM format (e.g., "18:00")
  breakStartTime?: string; // Optional lunch break start
  breakEndTime?: string; // Optional lunch break end
}

/**
 * Holiday Interface
 * Defines holidays/non-working days
 */
export interface IHoliday {
  date: Date;
  name: string;
  description?: string;
  isRecurring: boolean; // If true, repeats every year on same date
}

/**
 * Working Calendar Interface
 * Manages working hours, holidays, and SLA calculations
 */
export interface IWorkingCalendar extends Document {
  name: string;
  description?: string;
  projectId: mongoose.Types.ObjectId;
  timezone: string; // IANA timezone (e.g., "Asia/Kolkata", "America/New_York")
  workingHours: IWorkingHours[];
  holidays: IHoliday[];
  isActive: boolean;
  isDefault: boolean; // One default calendar per project
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isWorkingTime(date: Date): boolean;
  getNextWorkingTime(date: Date): Date;
  calculateWorkingMinutes(startDate: Date, endDate: Date): number;
}

const WorkingHoursSchema = new Schema<IWorkingHours>(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    isWorkingDay: {
      type: Boolean,
      required: true,
      default: true,
    },
    startTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    endTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    breakStartTime: {
      type: String,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    breakEndTime: {
      type: String,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
  },
  { _id: false }
);

const HolidaySchema = new Schema<IHoliday>(
  {
    date: {
      type: Date,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const WorkingCalendarSchema = new Schema<IWorkingCalendar>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    timezone: {
      type: String,
      required: true,
      default: 'Asia/Kolkata',
    },
    workingHours: {
      type: [WorkingHoursSchema],
      default: [
        // Monday to Friday: 9 AM - 6 PM
        { dayOfWeek: 1, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 2, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 3, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 4, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 5, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
        // Saturday and Sunday: Non-working
        { dayOfWeek: 6, isWorkingDay: false, startTime: '00:00', endTime: '00:00' },
        { dayOfWeek: 0, isWorkingDay: false, startTime: '00:00', endTime: '00:00' },
      ],
    },
    holidays: {
      type: [HolidaySchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying calendars by project
// Note: Not using unique constraint on isDefault as that would prevent multiple non-default calendars
WorkingCalendarSchema.index({ projectId: 1 });
WorkingCalendarSchema.index({ projectId: 1, isActive: 1 });

// Pre-save hook to ensure only one default per project
WorkingCalendarSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    // Remove default flag from other calendars in the same project
    await mongoose.model('WorkingCalendar').updateMany(
      { 
        projectId: this.projectId, 
        _id: { $ne: this._id },
        isDefault: true 
      },
      { $set: { isDefault: false } }
    );
  }
  next();
});

// Instance method: Check if a specific date/time is within working hours
// IMPORTANT: Uses calendar's timezone for all comparisons via centralized utility
WorkingCalendarSchema.methods.isWorkingTime = function(date: Date): boolean {
  // Get date parts in calendar's timezone using centralized utility
  const calendarTimezone = this.timezone || DEFAULT_TIMEZONE;
  const dateParts = getDatePartsInTimezone(date, calendarTimezone);
  
  const dayOfWeek = dateParts.dayOfWeek;
  const timeStr = dateParts.timeString;
  
  const workingDay = this.workingHours.find((wh: IWorkingHours) => wh.dayOfWeek === dayOfWeek);
  
  if (!workingDay || !workingDay.isWorkingDay) {
    return false;
  }
  
  // Check if it's a holiday
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isHoliday = this.holidays.some((holiday: IHoliday) => {
    const holidayDate = new Date(holiday.date);
    if (holiday.isRecurring) {
      // Check month and day only
      return holidayDate.getMonth() === dateOnly.getMonth() && 
             holidayDate.getDate() === dateOnly.getDate();
    } else {
      // Check exact date
      return holidayDate.getFullYear() === dateOnly.getFullYear() &&
             holidayDate.getMonth() === dateOnly.getMonth() &&
             holidayDate.getDate() === dateOnly.getDate();
    }
  });
  
  if (isHoliday) {
    return false;
  }
  
  // Check time range (timeStr already calculated above using calendar timezone)
  const isWithinWorkHours = timeStr >= workingDay.startTime && timeStr <= workingDay.endTime;
  
  // Check if in break time
  if (workingDay.breakStartTime && workingDay.breakEndTime) {
    const isInBreak = timeStr >= workingDay.breakStartTime && timeStr <= workingDay.breakEndTime;
    if (isInBreak) {
      return false;
    }
  }
  
  return isWithinWorkHours;
};

// Instance method: Get next working time from a given date
// Returns the exact start of the next working period, not just any working time
WorkingCalendarSchema.methods.getNextWorkingTime = function(date: Date): Date {
  const calendarTimezone = this.timezone || DEFAULT_TIMEZONE;
  let checkDate = new Date(date);
  const maxIterations = 365 * 24; // Max iterations (hours in a year)
  let iterations = 0;
  
  // First, check if current time is already within working hours
  if (this.isWorkingTime(checkDate)) {
    return checkDate;
  }
  
  // Move forward to find the next working time
  // Use 1-minute increments for precision
  while (!this.isWorkingTime(checkDate) && iterations < maxIterations * 60) {
    checkDate = new Date(checkDate.getTime() + 60 * 1000); // 1 minute
    iterations++;
    
    // Optimization: If we've moved past current day's end time, 
    // jump to start of next day to avoid excessive iterations
    if (iterations > 0 && iterations % 60 === 0) {
      const parts = getDatePartsInTimezone(checkDate, calendarTimezone);
      const workingDay = this.workingHours.find((wh: IWorkingHours) => wh.dayOfWeek === parts.dayOfWeek);
      
      if (!workingDay || !workingDay.isWorkingDay) {
        // Skip non-working days entirely - jump to next day 00:00
        const nextDay = new Date(checkDate.getTime() + 24 * 60 * 60 * 1000);
        const nextParts = getDatePartsInTimezone(nextDay, calendarTimezone);
        // Reset to start of next day (00:00)
        checkDate = new Date(
          nextDay.getTime() - 
          (nextParts.hour * 60 + nextParts.minute) * 60 * 1000
        );
      } else if (parts.timeString > workingDay.endTime) {
        // Past today's working hours - jump to next day
        const nextDay = new Date(checkDate.getTime() + 24 * 60 * 60 * 1000);
        const nextParts = getDatePartsInTimezone(nextDay, calendarTimezone);
        checkDate = new Date(
          nextDay.getTime() - 
          (nextParts.hour * 60 + nextParts.minute) * 60 * 1000
        );
      }
    }
  }
  
  return checkDate;
};

// Instance method: Calculate working minutes between two dates
WorkingCalendarSchema.methods.calculateWorkingMinutes = function(startDate: Date, endDate: Date): number {
  let totalMinutes = 0;
  let currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    if (this.isWorkingTime(currentDate)) {
      totalMinutes++;
    }
    // Move forward by 1 minute
    currentDate = new Date(currentDate.getTime() + 60 * 1000);
  }
  
  return totalMinutes;
};

export const WorkingCalendar = mongoose.model<IWorkingCalendar>('WorkingCalendar', WorkingCalendarSchema);
export default WorkingCalendar;
