/**
 * Utility functions and presets for cron expressions
 */

export interface CronPreset {
  label: string;
  value: string;
  description: string;
  recommendedFor?: string;
}

/**
 * Common cron interval presets for email polling
 */
export const CRON_PRESETS: CronPreset[] = [
  {
    label: 'Every 10 seconds',
    value: '*/10 * * * * *',
    description: 'Checks every 10 seconds',
    recommendedFor: 'High-priority, time-sensitive tickets'
  },
  {
    label: 'Every 30 seconds',
    value: '*/30 * * * * *',
    description: 'Checks every 30 seconds',
    recommendedFor: 'Balanced performance and responsiveness (recommended)'
  },
  {
    label: 'Every 1 minute',
    value: '*/1 * * * *',
    description: 'Checks every minute',
    recommendedFor: 'Normal load environments'
  },
  {
    label: 'Every 2 minutes',
    value: '*/2 * * * *',
    description: 'Checks every 2 minutes',
    recommendedFor: 'Lower priority tickets'
  },
  {
    label: 'Every 5 minutes',
    value: '*/5 * * * *',
    description: 'Checks every 5 minutes',
    recommendedFor: 'Low traffic environments'
  },
  {
    label: 'Every 10 minutes',
    value: '*/10 * * * *',
    description: 'Checks every 10 minutes',
    recommendedFor: 'Very low priority or resource-constrained systems'
  },
  {
    label: 'Every 15 minutes',
    value: '*/15 * * * *',
    description: 'Checks every 15 minutes',
    recommendedFor: 'Minimal polling for batch processing'
  },
  {
    label: 'Every 30 minutes',
    value: '*/30 * * * *',
    description: 'Checks every 30 minutes',
    recommendedFor: 'Very low frequency monitoring'
  },
];

/**
 * Validate a cron expression
 */
export const validateCronExpression = (expression: string): boolean => {
  const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))( (\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])))?$/;
  return cronRegex.test(expression);
};

/**
 * Get human-readable description of cron expression
 */
export const describeCronExpression = (expression: string): string => {
  const preset = CRON_PRESETS.find(p => p.value === expression);
  if (preset) {
    return preset.description;
  }

  // Basic parsing for common patterns
  const parts = expression.split(' ');
  
  if (parts.length === 6) {
    // Seconds included (e.g., "*/30 * * * * *")
    const seconds = parts[0];
    if (seconds.startsWith('*/')) {
      const interval = seconds.substring(2);
      return `Checks every ${interval} seconds`;
    }
  } else if (parts.length === 5) {
    // Standard cron (e.g., "*/5 * * * *")
    const minutes = parts[0];
    if (minutes.startsWith('*/')) {
      const interval = minutes.substring(2);
      return `Checks every ${interval} minutes`;
    }
  }

  return 'Custom interval';
};

/**
 * Convert milliseconds to cron expression (approximate for seconds/minutes)
 */
export const millisecondsToCron = (ms: number): string | null => {
  const seconds = ms / 1000;
  const minutes = seconds / 60;

  if (seconds < 60 && seconds >= 1 && Number.isInteger(seconds)) {
    return `*/${seconds} * * * * *`;
  } else if (minutes >= 1 && Number.isInteger(minutes)) {
    return `*/${minutes} * * * *`;
  }
  
  return null; // Can't convert to simple cron
};

/**
 * Estimate next execution time for a cron expression (simplified)
 */
export const estimateNextExecution = (expression: string): Date => {
  const now = new Date();
  const parts = expression.split(' ');

  if (parts.length === 6 && parts[0].startsWith('*/')) {
    // Seconds interval
    const seconds = parseInt(parts[0].substring(2));
    return new Date(now.getTime() + seconds * 1000);
  } else if (parts.length === 5 && parts[0].startsWith('*/')) {
    // Minutes interval
    const minutes = parseInt(parts[0].substring(2));
    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  // Default: add 1 minute
  return new Date(now.getTime() + 60000);
};
