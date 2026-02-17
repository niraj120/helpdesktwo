/**
 * SLA Calculation Utilities
 * Functions for calculating and formatting SLA time for display
 */

export interface SLATimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
  isBreached: boolean;
  breachInMinutes: number;
  isNotStarted?: boolean; // True if SLA hasn't started yet (outside working hours)
  startsInMinutes?: number; // Minutes until SLA starts
}

/**
 * Calculate remaining time until SLA breach
 * @param dueAt - Due date for the SLA
 * @param isPaused - Whether SLA is currently paused
 * @param pausedAt - When SLA was paused
 * @param pausedDuration - Total paused duration in milliseconds
 * @param startedAt - When SLA starts (for working calendar support)
 * @returns Object with remaining time breakdown
 */
export const calculateRemainingTime = (
  dueAt: string | Date,
  isPaused: boolean = false,
  pausedAt?: string | Date,
  pausedDuration: number = 0,
  startedAt?: string | Date
): SLATimeRemaining => {
  const now = new Date();
  const dueDate = new Date(dueAt);
  
  // Check if SLA hasn't started yet (startedAt is in the future)
  if (startedAt) {
    const startDate = new Date(startedAt);
    if (now < startDate) {
      // SLA hasn't started yet - calculate time until it starts
      const startsInMs = startDate.getTime() - now.getTime();
      const startsInMinutes = Math.ceil(startsInMs / (1000 * 60));
      
      // Calculate the actual SLA duration (dueAt - startedAt)
      const slaDurationMs = dueDate.getTime() - startDate.getTime();
      const slaDurationMinutes = Math.ceil(slaDurationMs / (1000 * 60));
      
      return {
        days: 0,
        hours: Math.floor(slaDurationMinutes / 60),
        minutes: slaDurationMinutes % 60,
        totalMinutes: slaDurationMinutes,
        isBreached: false,
        breachInMinutes: 0,
        isNotStarted: true,
        startsInMinutes: startsInMinutes,
      };
    }
  }
  
  // If paused, calculate time remaining from when it was paused
  let effectiveDueTime = dueDate.getTime();
  
  if (isPaused && pausedAt) {
    // SLA is paused - time is frozen
    const pausedAtTime = new Date(pausedAt).getTime();
    const elapsedBeforePause = pausedAtTime - (dueDate.getTime() - pausedDuration);
    const remainingAtPause = dueDate.getTime() - pausedAtTime;
    effectiveDueTime = now.getTime() + remainingAtPause;
  } else if (pausedDuration > 0) {
    // Account for previously paused time
    effectiveDueTime = dueDate.getTime() + pausedDuration;
  }
  
  const timeDiff = effectiveDueTime - now.getTime();
  const isBreached = timeDiff < 0;
  
  const absoluteDiff = Math.abs(timeDiff);
  const totalMinutes = Math.floor(absoluteDiff / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  
  return {
    days,
    hours,
    minutes,
    totalMinutes: isBreached ? -totalMinutes : totalMinutes,
    isBreached,
    breachInMinutes: isBreached ? totalMinutes : 0,
  };
};

/**
 * Format time remaining for display
 * @param remaining - SLATimeRemaining object
 * @param shortFormat - Use short format (e.g., "2d 5h" instead of "2 days, 5 hours")
 * @returns Formatted string
 */
export const formatTimeRemaining = (
  remaining: SLATimeRemaining,
  shortFormat: boolean = false
): string => {
  const { days, hours, minutes, isBreached } = remaining;
  
  if (shortFormat) {
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    
    const timeStr = parts.join(' ');
    return isBreached ? `-${timeStr}` : timeStr;
  } else {
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    
    const timeStr = parts.join(', ');
    return isBreached ? `Overdue by ${timeStr}` : timeStr;
  }
};

/**
 * Format time as HH:MM:SS for countdown display
 * @param totalMinutes - Total minutes remaining
 * @returns Formatted string
 */
export const formatCountdown = (totalMinutes: number): string => {
  const isNegative = totalMinutes < 0;
  const absoluteMinutes = Math.abs(totalMinutes);
  
  const days = Math.floor(absoluteMinutes / (24 * 60));
  const hours = Math.floor((absoluteMinutes % (24 * 60)) / 60);
  const minutes = absoluteMinutes % 60;
  
  if (days > 0) {
    return `${isNegative ? '-' : ''}${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  
  return `${isNegative ? '-' : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Get color class based on time remaining
 * @param remaining - SLATimeRemaining object
 * @param warningThresholdMinutes - Minutes before due to show warning (default: 60)
 * @returns Tailwind color classes
 */
export const getSLAColorClass = (
  remaining: SLATimeRemaining,
  warningThresholdMinutes: number = 60
): { bg: string; text: string; border: string } => {
  // SLA hasn't started yet (outside working hours) - show blue/info state
  if (remaining.isNotStarted) {
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-300',
    };
  }
  
  if (remaining.isBreached) {
    return {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-300',
    };
  }
  
  if (remaining.totalMinutes <= warningThresholdMinutes) {
    return {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-300',
    };
  }
  
  return {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-300',
  };
};

/**
 * Get urgency level for sorting/filtering
 * @param remaining - SLATimeRemaining object
 * @returns Urgency level: 'critical' | 'warning' | 'ok' | 'not-started'
 */
export const getSLAUrgency = (
  remaining: SLATimeRemaining
): 'critical' | 'warning' | 'ok' | 'not-started' => {
  if (remaining.isNotStarted) return 'not-started';
  if (remaining.isBreached) return 'critical';
  if (remaining.totalMinutes <= 60) return 'warning';
  return 'ok';
};

/**
 * Parse SLA status from API response
 * @param slaData - SLA data from API
 * @returns Parsed SLA time remaining
 */
export const parseSLAStatus = (slaData: any): SLATimeRemaining | null => {
  if (!slaData || !slaData.dueAt) return null;
  
  return calculateRemainingTime(
    slaData.dueAt,
    slaData.isPaused,
    slaData.pausedAt,
    slaData.pausedDuration
  );
};

/**
 * Get percentage of time elapsed
 * @param startedAt - Start time
 * @param dueAt - Due time
 * @param pausedDuration - Paused duration in ms
 * @returns Percentage (0-100)
 */
export const getSLAProgressPercentage = (
  startedAt: string | Date,
  dueAt: string | Date,
  pausedDuration: number = 0
): number => {
  const start = new Date(startedAt).getTime();
  const due = new Date(dueAt).getTime();
  const now = new Date().getTime();
  
  const totalDuration = due - start;
  const elapsed = now - start - pausedDuration;
  
  if (totalDuration <= 0) return 100;
  
  const percentage = (elapsed / totalDuration) * 100;
  return Math.min(Math.max(percentage, 0), 100);
};
