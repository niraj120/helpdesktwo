/**
 * Escalation Matrix Types
 * Level-based escalation routing system
 */

/**
 * Escalation Level - represents a step in the escalation hierarchy
 */
export interface EscalationLevel {
  _id?: string;
  levelNumber: number; // Defines escalation order (1, 2, 3, ...)
  levelName: string; // Display label only
  roleId: string; // Role responsible at this level
  roleName?: string; // Populated from role
  slaHours: number; // SLA duration for this level in hours
  slaUnit?: SlaUnit; // Display unit (mins, hrs, days) - default 'hrs'
  /** US-ESC-005: 'reassign' changes assignee; 'notify' only notifies */
  levelType?: "reassign" | "notify";
  /** US-ESC-006: specific users to notify (used when levelType='notify') */
  notifyUserIds?: string[];
  /** US-ESC-007: trigger on fixed duration or % of overall ticket SLA consumed */
  slaThresholdType?: "fixed" | "percent";
  /** US-ESC-007: percentage threshold (1-100), used when slaThresholdType='percent' */
  slaThresholdPercent?: number;
  isActive: boolean;
  users?: EscalationLevelUser[]; // Users in this role (populated)
  userCount?: number;
}

/**
 * User info for escalation level
 */
export interface EscalationLevelUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: {
    _id: string;
    name: string;
    code: string;
  };
}

/**
 * Escalation Mode Types
 */
export type EscalationMode = "SEQUENTIAL" | "RANDOM";

/**
 * Priority Mode Types - Controls if matrix uses same levels for all priorities or different per priority
 */
export type PriorityMode = "SAME_FOR_ALL" | "PER_PRIORITY";

/**
 * Priority Configuration - Different escalation levels per priority
 */
export interface PriorityConfig {
  priorityCode: string; // e.g., 'HIGH', 'MEDIUM', 'LOW'
  priorityName?: string;
  levels: EscalationLevel[];
}

/**
 * Escalation Matrix - configurable matrix for ticket escalation
 */
export interface EscalationMatrix {
  _id?: string;
  name: string;
  description?: string;
  escalationMode: EscalationMode;
  priorityMode?: PriorityMode; // NEW: Controls if matrix is same for all priorities or different
  allowSkipLevel: boolean; // Only for RANDOM mode
  allowBackward: boolean; // Allows backward escalation
  autoEscalate: boolean; // Auto-escalate on SLA breach
  /** US-ESC-008: pre-breach SLA warning config */
  slaWarningConfig?: {
    warningThresholds: number[];
    notifyAssignedAgent: boolean;
    notifyRoles?: string[];
  };
  levels: EscalationLevel[]; // Used when priorityMode is 'SAME_FOR_ALL'
  priorityConfigs?: PriorityConfig[]; // Used when priorityMode is 'PER_PRIORITY'
  projectIds: string[] | ProjectInfo[];
  applicablePriorities?: string[]; // Priority codes this matrix applies to
  isActive: boolean;
  linkedCategoriesCount?: number; // Number of categories linked to this matrix
  linkedCategories?: LinkedCategoryInfo[]; // Populated when fetching by ID
  createdBy?: UserInfo;
  updatedBy?: UserInfo;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Linked category info for a matrix
 */
export interface LinkedCategoryInfo {
  _id: string;
  categoryId: string;
  categoryName: string;
  categoryLevel?: number;
  projectId: string;
}

/**
 * Project info for display
 */
export interface ProjectInfo {
  _id: string;
  name: string;
  code?: string;
}

/**
 * User info for display
 */
export interface UserInfo {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Allowed escalation level response from API
 */
export interface AllowedEscalationLevel {
  levelId: string;
  levelNumber: number;
  levelName: string;
  roleId: string;
  roleName?: string;
  slaHours: number;
  slaUnit?: string; // 'mins', 'hrs', 'days'
  userCount?: number;
  userNames?: string[];
  users?: {
    _id: string;
    name: string;
    email: string;
  }[];
  // For de-escalation: the specific previous handler at this level
  previousHandlerId?: string;
  previousHandlerName?: string;
  previousHandlerEmail?: string;
  isDeEscalation?: boolean; // True if this is a backward/de-escalation option
}

/**
 * Form data for creating/editing escalation matrix
 */
export interface EscalationMatrixFormData {
  name: string;
  description?: string;
  escalationMode: EscalationMode;
  priorityMode?: PriorityMode; // NEW: Controls if matrix uses same levels for all priorities
  allowSkipLevel: boolean;
  allowBackward: boolean;
  autoEscalate: boolean; // Auto-escalate on SLA breach
  /** US-ESC-008: pre-breach SLA warning config */
  slaWarningConfig?: {
    warningThresholds: number[];
    notifyAssignedAgent: boolean;
    notifyRoles?: string[];
  };
  levels: EscalationLevelFormData[]; // Used when priorityMode is 'SAME_FOR_ALL'
  priorityConfigs?: PriorityConfigFormData[]; // Used when priorityMode is 'PER_PRIORITY'
  projectIds: string[];
  applicablePriorities?: string[]; // Priority codes this matrix applies to
  isActive: boolean;
}

/**
 * Priority Configuration form data
 */
export interface PriorityConfigFormData {
  priorityCode: string;
  priorityName?: string;
  levels: EscalationLevelFormData[];
}

export type SlaUnit = "mins" | "hrs" | "days";

/**
 * Form data for escalation level
 */
export interface EscalationLevelFormData {
  levelNumber: number;
  levelName: string;
  roleId: string;
  slaHours: number;
  slaUnit?: SlaUnit; // Display unit (mins, hrs, days) - default 'hrs'
  /** US-ESC-005: 'reassign' changes assignee; 'notify' only notifies */
  levelType?: "reassign" | "notify";
  /** US-ESC-006: specific users to notify (used when levelType='notify') */
  notifyUserIds?: string[];
  /** US-ESC-007: trigger on fixed duration or % of overall ticket SLA consumed */
  slaThresholdType?: "fixed" | "percent";
  /** US-ESC-007: percentage threshold (1-100), used when slaThresholdType='percent' */
  slaThresholdPercent?: number;
  isActive: boolean;
}

/**
 * Ticket escalation context
 */
export interface TicketEscalationContext {
  ticketId: string;
  matrixId?: string;
  matrixName?: string;
  currentLevelId?: string;
  currentLevelNumber: number;
  currentLevelName?: string;
  allowedLevels: AllowedEscalationLevel[];
}

/**
 * Escalation request payload
 */
export interface EscalateTicketRequest {
  targetLevelId: string;
  reason: string;
  targetUserId?: string; // Optional: specific user to assign to when multiple users at level
}

/**
 * Escalation response
 */
export interface EscalateTicketResponse {
  success: boolean;
  message: string;
  data?: {
    ticket: any;
    assignedUser: EscalationLevelUser;
  };
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
