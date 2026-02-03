/**
 * UI Components Index
 * 
 * PERFORMANCE OPTIMIZATION:
 * Central export for all memoized UI components.
 * Import from here for consistent usage across the app.
 * 
 * Usage:
 * import { StatCard, Badge, LoadingSpinner, StatusBadge, PriorityBadge } from '@/components/ui';
 */

export { default as StatCard } from './StatCard';
export { default as Badge, StatusBadge, PriorityBadge } from './Badge';
export { default as LoadingSpinner } from './LoadingSpinner';
