/**
 * Field Selection Utility
 * 
 * Provides consistent field selection across API endpoints for payload optimization.
 * 
 * Features:
 * - Predefined field sets for summary vs full views
 * - Client-specified field selection via query param
 * - Populate configuration for different views
 * 
 * Usage:
 *   import { getFieldSelection, TICKET_FIELDS, getPopulateConfig } from '../utils/fieldSelection';
 *   
 *   const { selectFields, view } = getFieldSelection(req.query, 'tickets');
 *   const tickets = await Ticket.find(query)
 *     .select(selectFields)
 *     .populate(getPopulateConfig('tickets', view));
 */

export type ViewType = 'summary' | 'list' | 'full';

export interface FieldConfig {
  summary: string;
  list: string;
  full: string;
}

// ============================================
// TICKET FIELD DEFINITIONS
// ============================================
export const TICKET_FIELDS: FieldConfig = {
  // Minimal summary for lists - excludes heavy arrays
  summary: [
    'ticketNumber',
    'subject',
    'status',
    'priority',
    'category',
    'assignedTo',
    'createdAt',
    'updatedAt',
    'closedAt',
    'resolvedAt',
    'metadata.projectId',
    'metadata.centerId',
    'slaStatus',
    'slaDeadline',
    'tags',
    'createdBy',
  ].join(' '),
  
  // List view - slightly more data
  list: [
    'ticketNumber',
    'subject',
    'status',
    'priority',
    'category',
    'assignedTo',
    'createdAt',
    'updatedAt',
    'closedAt',
    'resolvedAt',
    'metadata',
    'slaStatus',
    'slaDeadline',
    'tags',
    'createdBy',
    'submissionSource',
  ].join(' '),
  
  // Full view - all fields (no exclusions)
  full: '',
};

// Heavy fields to exclude from ticket lists
export const TICKET_EXCLUDE_FROM_LIST = '-threads -comments -internalNotes -changeHistory -escalationHistory -attachments -description';

// ============================================
// KB ARTICLE FIELD DEFINITIONS
// ============================================
export const KB_ARTICLE_FIELDS: FieldConfig = {
  // Summary for search/list - no content
  summary: [
    'title',
    'slug',
    'status',
    'category',
    'publishedAt',
    'updatedAt',
    'author',
    'viewCount',
    'helpfulCount',
    'notHelpfulCount',
    'excerpt',
    'tags',
    'level1Id',
    'level2Id',
    'level3Id',
  ].join(' '),
  
  // List view - same as summary
  list: [
    'title',
    'slug',
    'status',
    'category',
    'publishedAt',
    'updatedAt',
    'author',
    'viewCount',
    'excerpt',
    'tags',
    'featuredImage',
  ].join(' '),
  
  // Full view - includes content
  full: '',
};

// Heavy fields to exclude from article lists
export const KB_ARTICLE_EXCLUDE_FROM_LIST = '-content -htmlContent -relatedArticles -revisionHistory';

// ============================================
// USER FIELD DEFINITIONS
// ============================================
export const USER_FIELDS: FieldConfig = {
  // Summary - minimal user info
  summary: [
    'firstName',
    'lastName',
    'email',
    'employeeCode',
    'role',
    'status',
    'isActive',
  ].join(' '),
  
  // List view - more details
  list: [
    'firstName',
    'lastName',
    'email',
    'employeeCode',
    'role',
    'status',
    'isActive',
    'department',
    'designation',
    'phone',
    'createdAt',
    'lastLogin',
  ].join(' '),
  
  // Full view - all except password
  full: '-password -passwordResetToken -passwordResetExpires',
};

// ============================================
// PROJECT FIELD DEFINITIONS
// ============================================
export const PROJECT_FIELDS: FieldConfig = {
  // Summary - key project info
  summary: [
    '_id',
    'projectId',
    'name',
    'code',
    'status',
    'customUrlPath',
    'branding.logo',
    'branding.primaryColor',
  ].join(' '),
  
  // List view
  list: [
    '_id',
    'projectId',
    'name',
    'code',
    'status',
    'customUrlPath',
    'description',
    'branding.logo',
    'branding.primaryColor',
    'branding.companyName',
    'createdAt',
  ].join(' '),
  
  // Full view
  full: '',
};

// Heavy fields to exclude from project lists
export const PROJECT_EXCLUDE_FROM_LIST = '-ticketConfig -slaConfig -notificationConfig -integrations';

// ============================================
// CENTER FIELD DEFINITIONS
// ============================================
export const CENTER_FIELDS: FieldConfig = {
  // Summary - minimal center info
  summary: [
    'centerName',
    'centerCode',
    'city',
    'state',
    'status',
    'projectId',
  ].join(' '),
  
  // List view
  list: [
    'centerName',
    'centerCode',
    'city',
    'state',
    'status',
    'projectId',
    'address',
    'pincode',
    'contactPerson',
    'createdAt',
  ].join(' '),
  
  // Full view
  full: '',
};

// Heavy fields to exclude from center lists
export const CENTER_EXCLUDE_FROM_LIST = '-contacts -schedule -notes';

// ============================================
// ASSET FIELD DEFINITIONS
// ============================================
export const ASSET_FIELDS: FieldConfig = {
  // Summary
  summary: [
    'name',
    'assetCode',
    'category',
    'status',
    'projectId',
    'centerId',
  ].join(' '),
  
  // List view
  list: [
    'name',
    'assetCode',
    'description',
    'category',
    'status',
    'projectId',
    'centerId',
    'purchaseDate',
    'createdAt',
  ].join(' '),
  
  // Full view
  full: '',
};

// ============================================
// FIELD SELECTION CONFIG MAP
// ============================================
const FIELD_CONFIGS: Record<string, FieldConfig> = {
  tickets: TICKET_FIELDS,
  kbArticles: KB_ARTICLE_FIELDS,
  users: USER_FIELDS,
  projects: PROJECT_FIELDS,
  centers: CENTER_FIELDS,
  assets: ASSET_FIELDS,
};

const EXCLUDE_CONFIGS: Record<string, string> = {
  tickets: TICKET_EXCLUDE_FROM_LIST,
  kbArticles: KB_ARTICLE_EXCLUDE_FROM_LIST,
  projects: PROJECT_EXCLUDE_FROM_LIST,
  centers: CENTER_EXCLUDE_FROM_LIST,
};

// ============================================
// POPULATE CONFIGURATIONS
// ============================================
export const POPULATE_CONFIGS = {
  tickets: {
    summary: [
      { path: 'assignedTo', select: 'firstName lastName' },
      { path: 'category', select: 'name' },
    ],
    list: [
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'category', select: 'name code' },
      { path: 'createdBy', select: 'firstName lastName email' },
    ],
    full: [
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'category', select: 'name code color icon' },
      { path: 'createdBy', select: 'firstName lastName email' },
      {
        path: 'threads.createdBy',
        select: 'firstName lastName email role',
        populate: { path: 'role', select: 'name code' },
      },
      { path: 'comments.createdBy', select: 'firstName lastName email' },
      { path: 'internalNotes.createdBy', select: 'firstName lastName email' },
    ],
  },
  kbArticles: {
    summary: [
      { path: 'author', select: 'firstName lastName' },
    ],
    list: [
      { path: 'author', select: 'firstName lastName email' },
    ],
    full: [
      { path: 'author', select: 'firstName lastName email' },
      { path: 'level1Id', select: 'name slug' },
      { path: 'level2Id', select: 'name slug' },
      { path: 'level3Id', select: 'name slug' },
    ],
  },
  users: {
    summary: [
      { path: 'role', select: 'name code' },
    ],
    list: [
      { path: 'role', select: 'name code isAgent' },
    ],
    full: [
      { path: 'role', select: 'name code isAgent permissions' },
      { path: 'projects', select: 'name code' },
      { path: 'centers', select: 'centerName city' },
      { path: 'reportingManager', select: 'firstName lastName email' },
    ],
  },
  projects: {
    summary: [],
    list: [],
    full: [
      { path: 'createdBy', select: 'firstName lastName email' },
    ],
  },
  centers: {
    summary: [
      { path: 'projectId', select: 'name' },
    ],
    list: [
      { path: 'projectId', select: 'name code' },
    ],
    full: [
      { path: 'projectId', select: 'name code' },
      { path: 'createdBy', select: 'firstName lastName email' },
    ],
  },
  assets: {
    summary: [
      { path: 'category', select: 'name' },
    ],
    list: [
      { path: 'category', select: 'name code color' },
      { path: 'projectId', select: 'projectName' },
    ],
    full: [
      { path: 'category', select: 'name code color icon' },
      { path: 'projectId', select: 'projectName' },
      { path: 'centerId', select: 'centerName city' },
      { path: 'createdBy', select: 'firstName lastName email' },
    ],
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get field selection based on query params and entity type
 */
export const getFieldSelection = (
  query: Record<string, any>,
  entityType: keyof typeof FIELD_CONFIGS,
  defaultView: ViewType = 'summary'
): { selectFields: string; view: ViewType; useExclusion: boolean } => {
  const config = FIELD_CONFIGS[entityType];
  if (!config) {
    return { selectFields: '', view: 'full', useExclusion: false };
  }
  
  // Check for custom fields param
  const customFields = query.fields as string;
  if (customFields) {
    return { 
      selectFields: customFields.replace(/,/g, ' '), 
      view: 'full',
      useExclusion: false,
    };
  }
  
  // Check for view param
  const requestedView = (query.view as ViewType) || defaultView;
  const view = ['summary', 'list', 'full'].includes(requestedView) ? requestedView : defaultView;
  
  // For full view, use exclusion pattern if available
  if (view === 'full') {
    return { selectFields: config.full, view, useExclusion: false };
  }
  
  // For summary/list, check if we should use exclusion or selection
  const exclusionPattern = EXCLUDE_CONFIGS[entityType];
  if (exclusionPattern && view === 'summary') {
    return { selectFields: exclusionPattern, view, useExclusion: true };
  }
  
  return { selectFields: config[view], view, useExclusion: false };
};

/**
 * Get populate configuration for entity and view
 */
export const getPopulateConfig = (
  entityType: keyof typeof POPULATE_CONFIGS,
  view: ViewType = 'summary'
): Array<any> => {
  const config = POPULATE_CONFIGS[entityType];
  if (!config) return [];
  
  return config[view] || config.summary || [];
};

/**
 * Transform response for summary view - strip heavy fields client-side safety
 */
export const stripHeavyFields = <T extends Record<string, any>>(
  data: T,
  fieldsToStrip: string[]
): Partial<T> => {
  const result = { ...data };
  for (const field of fieldsToStrip) {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (result[parent] && typeof result[parent] === 'object') {
        delete result[parent][child];
      }
    } else {
      delete result[field];
    }
  }
  return result;
};

/**
 * Add computed fields for list views (e.g., counts instead of arrays)
 */
export const addComputedFields = <T extends Record<string, any>>(
  data: T,
  computations: Record<string, (item: T) => any>
): T & Record<string, any> => {
  const result = { ...data };
  for (const [field, compute] of Object.entries(computations)) {
    (result as any)[field] = compute(data);
  }
  return result;
};

export default {
  getFieldSelection,
  getPopulateConfig,
  stripHeavyFields,
  addComputedFields,
  TICKET_FIELDS,
  KB_ARTICLE_FIELDS,
  USER_FIELDS,
  PROJECT_FIELDS,
  CENTER_FIELDS,
  ASSET_FIELDS,
  POPULATE_CONFIGS,
};
