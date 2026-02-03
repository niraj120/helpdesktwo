import React, { memo } from 'react';

/**
 * Badge - Memoized status/priority badge component
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Wrapped in React.memo to prevent re-renders when parent updates
 * - Commonly used in lists where many instances exist
 */

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'primary';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800 border-green-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  primary: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  default: 'bg-gray-100 text-gray-800 border-gray-200',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-0.5',
  lg: 'text-base px-3 py-1',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  primary: 'bg-indigo-500',
  default: 'bg-gray-500',
};

const Badge = memo<BadgeProps>(({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  dot = false,
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';

export default Badge;

/**
 * StatusBadge - Pre-configured badge for ticket statuses
 */
interface StatusBadgeProps {
  status: string;
  size?: BadgeSize;
  className?: string;
}

const statusVariantMap: Record<string, BadgeVariant> = {
  'open': 'info',
  'pending': 'warning',
  'in-progress': 'primary',
  'resolved': 'success',
  'closed': 'default',
  'escalated': 'error',
};

export const StatusBadge = memo<StatusBadgeProps>(({
  status,
  size = 'sm',
  className = '',
}) => {
  const normalizedStatus = status.toLowerCase();
  const variant = statusVariantMap[normalizedStatus] || 'default';
  
  return (
    <Badge variant={variant} size={size} dot className={className}>
      {status}
    </Badge>
  );
});

StatusBadge.displayName = 'StatusBadge';

/**
 * PriorityBadge - Pre-configured badge for ticket priorities
 */
interface PriorityBadgeProps {
  priority: string;
  size?: BadgeSize;
  className?: string;
}

const priorityVariantMap: Record<string, BadgeVariant> = {
  'high': 'error',
  'critical': 'error',
  'medium': 'warning',
  'low': 'success',
  'normal': 'info',
};

export const PriorityBadge = memo<PriorityBadgeProps>(({
  priority,
  size = 'sm',
  className = '',
}) => {
  const normalizedPriority = priority.toLowerCase();
  const variant = priorityVariantMap[normalizedPriority] || 'default';
  
  return (
    <Badge variant={variant} size={size} className={className}>
      {priority}
    </Badge>
  );
});

PriorityBadge.displayName = 'PriorityBadge';
