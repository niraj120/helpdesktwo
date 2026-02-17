import React, { useEffect, useState } from 'react';
import { Clock, Pause, AlertCircle, CheckCircle } from 'lucide-react';
import {
  calculateRemainingTime,
  formatCountdown,
  formatTimeRemaining,
  getSLAColorClass,
  getSLAUrgency,
  SLATimeRemaining,
} from '../../utils/slaCalculations';

interface SLATimerProps {
  dueAt: string | Date;
  startedAt?: string | Date;
  isPaused?: boolean;
  pausedAt?: string | Date;
  pausedDuration?: number;
  breachedAt?: string | Date;
  label: string;
  description?: string;
  variant: 'primary' | 'secondary';
  showProgressBar?: boolean;
  className?: string;
}

export const SLATimer: React.FC<SLATimerProps> = ({
  dueAt,
  startedAt,
  isPaused = false,
  pausedAt,
  pausedDuration = 0,
  breachedAt,
  label,
  description,
  variant,
  showProgressBar = false,
  className = '',
}) => {
  const [remaining, setRemaining] = useState<SLATimeRemaining | null>(null);
  const [progressPercentage, setProgressPercentage] = useState<number>(0);

  useEffect(() => {
    const updateTimer = () => {
      // Pass startedAt to handle working calendar - timer won't count down until SLA starts
      const timeRemaining = calculateRemainingTime(dueAt, isPaused, pausedAt, pausedDuration, startedAt);
      setRemaining(timeRemaining);

      // Calculate progress percentage if startedAt is provided
      if (startedAt && showProgressBar) {
        const start = new Date(startedAt).getTime();
        const due = new Date(dueAt).getTime();
        const now = new Date().getTime();
        const totalDuration = due - start;
        const elapsed = now - start - pausedDuration;
        const percentage = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
        setProgressPercentage(percentage);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [dueAt, isPaused, pausedAt, pausedDuration, startedAt, showProgressBar]);

  if (!remaining) return null;

  const colors = getSLAColorClass(remaining);
  const urgency = getSLAUrgency(remaining);
  const isPrimary = variant === 'primary';

  // Different styling for primary vs secondary
  const containerClasses = isPrimary
    ? `border-2 ${colors.border} ${colors.bg} rounded-lg p-4`
    : `border ${colors.border} ${colors.bg} rounded-md p-3`;

  return (
    <div className={`${containerClasses} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isPaused ? (
              <Pause className={`${colors.text} ${isPrimary ? 'w-5 h-5' : 'w-4 h-4'}`} />
            ) : remaining.isBreached ? (
              <AlertCircle className={`${colors.text} ${isPrimary ? 'w-5 h-5' : 'w-4 h-4'}`} />
            ) : (
              <Clock className={`${colors.text} ${isPrimary ? 'w-5 h-5' : 'w-4 h-4'}`} />
            )}
            <span className={`${isPrimary ? 'text-sm' : 'text-xs'} font-medium ${colors.text}`}>
              {label}
            </span>
          </div>
          {description && (
            <p className={`${isPrimary ? 'text-xs' : 'text-[11px]'} text-gray-600 mt-1 ml-7`}>
              {description}
            </p>
          )}
        </div>

        <div className="text-right">
          <div className={`${isPrimary ? 'text-2xl' : 'text-lg'} font-bold ${remaining.isNotStarted ? 'text-blue-600' : colors.text} font-mono`}>
            {remaining.isNotStarted 
              ? formatCountdown(remaining.totalMinutes) // Show SLA duration
              : formatCountdown(remaining.totalMinutes)}
          </div>
          <div className={`${isPrimary ? 'text-xs' : 'text-[11px]'} ${remaining.isNotStarted ? 'text-blue-600' : colors.text} mt-1`}>
            {isPaused ? 'Paused' : remaining.isNotStarted 
              ? `Starts in ${remaining.startsInMinutes}m`
              : formatTimeRemaining(remaining, true)}
          </div>
        </div>
      </div>

      {/* Status indicators */}
      <div className="mt-3 flex items-center gap-3 text-xs">
        {remaining.isNotStarted && !isPaused && (
          <div className="flex items-center gap-1 text-blue-600 font-medium">
            <Clock className="w-3 h-3" />
            <span>Waiting for working hours</span>
          </div>
        )}
        {isPaused && (
          <div className="flex items-center gap-1 text-gray-600">
            <Pause className="w-3 h-3" />
            <span>Timer Paused</span>
          </div>
        )}
        {remaining.isBreached && !isPaused && (
          <div className={`flex items-center gap-1 ${colors.text} font-medium`}>
            <AlertCircle className="w-3 h-3" />
            <span>SLA Breached</span>
          </div>
        )}
        {!remaining.isBreached && !isPaused && urgency === 'warning' && (
          <div className="flex items-center gap-1 text-yellow-700 font-medium">
            <AlertCircle className="w-3 h-3" />
            <span>Due Soon</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {showProgressBar && startedAt && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                remaining.isBreached
                  ? 'bg-red-500'
                  : urgency === 'warning'
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface DualSLATimerProps {
ticketId: string;
  ticketLevelSLA?: {
    startedAt: string;
    dueAt: string;
    isPaused?: boolean;
    pausedAt?: string;
    pausedDuration?: number;
    breachedAt?: string;
  };
  roleLevelSLA?: {
    startedAt: string;
    dueAt: string;
    isPaused?: boolean;
    pausedAt?: string;
    pausedDuration?: number;
    breachedAt?: string;
  };
  className?: string;
}

export const DualSLATimer: React.FC<DualSLATimerProps> = ({
  ticketId,
  ticketLevelSLA,
  roleLevelSLA,
  className = '',
}) => {
  if (!ticketLevelSLA && !roleLevelSLA) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Role-Level SLA (Primary) */}
      {roleLevelSLA && (
        <SLATimer
          dueAt={roleLevelSLA.dueAt}
          startedAt={roleLevelSLA.startedAt}
          isPaused={roleLevelSLA.isPaused}
          pausedAt={roleLevelSLA.pausedAt}
          pausedDuration={roleLevelSLA.pausedDuration}
          breachedAt={roleLevelSLA.breachedAt}
          label="Current Level SLA"
          description="Time remaining for current escalation level"
          variant="primary"
          showProgressBar={true}
        />
      )}

      {/* Ticket-Level SLA (Secondary) */}
      {ticketLevelSLA && (
        <SLATimer
          dueAt={ticketLevelSLA.dueAt}
          startedAt={ticketLevelSLA.startedAt}
          isPaused={ticketLevelSLA.isPaused}
          pausedAt={ticketLevelSLA.pausedAt}
          pausedDuration={ticketLevelSLA.pausedDuration}
          breachedAt={ticketLevelSLA.breachedAt}
          label="Overall Ticket SLA"
          description="Total time remaining since ticket creation"
          variant="secondary"
          showProgressBar={true}
        />
      )}
    </div>
  );
};

// Compact version for list views
interface CompactSLATimerProps {
  dueAt: string | Date;
  startedAt?: string | Date;
  isPaused?: boolean;
  pausedAt?: string | Date;
  pausedDuration?: number;
  breachedAt?: string | Date;
  className?: string;
}

export const CompactSLATimer: React.FC<CompactSLATimerProps> = ({
  dueAt,
  startedAt,
  isPaused = false,
  pausedAt,
  pausedDuration = 0,
  breachedAt,
  className = '',
}) => {
  const [remaining, setRemaining] = useState<SLATimeRemaining | null>(null);

  useEffect(() => {
    const updateTimer = () => {
      // Pass startedAt to handle working calendar - timer won't count down until SLA starts
      const timeRemaining = calculateRemainingTime(dueAt, isPaused, pausedAt, pausedDuration, startedAt);
      setRemaining(timeRemaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [dueAt, isPaused, pausedAt, pausedDuration, startedAt]);

  if (!remaining) return null;

  const colors = getSLAColorClass(remaining);

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${colors.bg} ${colors.text} ${className}`}
    >
      {isPaused ? (
        <Pause className="w-3 h-3" />
      ) : remaining.isBreached ? (
        <AlertCircle className="w-3 h-3" />
      ) : (
        <Clock className="w-3 h-3" />
      )}
      <span className="font-mono">
        {remaining.isNotStarted 
          ? `Starts in ${remaining.startsInMinutes}m`
          : formatCountdown(remaining.totalMinutes)}
      </span>
    </div>
  );
};
