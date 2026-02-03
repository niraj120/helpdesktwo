/**
 * Status Styles - Performance Optimization
 * =========================================
 * Pre-computed style objects for ticket/item statuses.
 * Avoids creating new style objects on every render.
 * 
 * Usage:
 *   import { getStatusStyles, getPriorityStyles } from '@/utils/statusStyles';
 *   <span style={getStatusStyles(ticket.status)}>
 */

// ============================================================================
// Ticket Status Styles
// ============================================================================

export interface StatusStyle {
  backgroundColor: string;
  color: string;
  padding: string;
  borderRadius: string;
  fontSize: string;
  fontWeight: string | number;
  display: string;
  alignItems: string;
  gap: string;
}

// Pre-computed status styles - created once, reused forever
const STATUS_STYLES: Record<string, StatusStyle> = {
  open: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  'in-progress': {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  pending: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  resolved: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  closed: {
    backgroundColor: '#F3F4F6',
    color: '#4B5563',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  default: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
};

/**
 * Get pre-computed style object for a ticket status
 * Avoids creating new objects on each render
 */
export const getStatusStyles = (status: string): StatusStyle => {
  const normalizedStatus = status?.toLowerCase()?.replace(/\s+/g, '-') || 'default';
  return STATUS_STYLES[normalizedStatus] || STATUS_STYLES.default;
};

// ============================================================================
// Priority Styles
// ============================================================================

export interface PriorityStyle {
  backgroundColor: string;
  color: string;
  padding: string;
  borderRadius: string;
  fontSize: string;
  fontWeight: string | number;
}

const PRIORITY_STYLES: Record<string, PriorityStyle> = {
  high: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
  },
  medium: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
  },
  low: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
  },
  default: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
  },
};

/**
 * Get pre-computed style object for a priority level
 */
export const getPriorityStyles = (priority: string): PriorityStyle => {
  const normalizedPriority = priority?.toLowerCase() || 'default';
  return PRIORITY_STYLES[normalizedPriority] || PRIORITY_STYLES.default;
};

// ============================================================================
// Status Colors (for use in badges, borders, etc.)
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  open: '#3B82F6',
  'in-progress': '#F59E0B',
  pending: '#EF4444',
  resolved: '#10B981',
  closed: '#6B7280',
  default: '#6B7280',
};

/**
 * Get color for a status (for borders, icons, etc.)
 */
export const getStatusColor = (status: string): string => {
  const normalizedStatus = status?.toLowerCase()?.replace(/\s+/g, '-') || 'default';
  return STATUS_COLORS[normalizedStatus] || STATUS_COLORS.default;
};

// ============================================================================
// SLA Status Styles
// ============================================================================

export interface SLAStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

const SLA_STYLES: Record<string, SLAStyle> = {
  within: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    borderColor: '#10B981',
  },
  outside: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    borderColor: '#EF4444',
  },
  warning: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    borderColor: '#F59E0B',
  },
  default: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
    borderColor: '#D1D5DB',
  },
};

/**
 * Get SLA status styles
 */
export const getSLAStyles = (slaStatus: string): SLAStyle => {
  const normalizedSLA = slaStatus?.toLowerCase() || 'default';
  if (normalizedSLA.includes('within')) return SLA_STYLES.within;
  if (normalizedSLA.includes('outside') || normalizedSLA.includes('breach')) return SLA_STYLES.outside;
  if (normalizedSLA.includes('warning') || normalizedSLA.includes('risk')) return SLA_STYLES.warning;
  return SLA_STYLES.default;
};
