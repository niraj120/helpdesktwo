/**
 * Query Parameter Utility
 * 
 * Provides consistent query parameter parsing, validation, and sanitization
 * for all list API endpoints.
 * 
 * Features:
 * - Parse and validate common filter types
 * - Date range handling
 * - Sorting with field validation
 * - Search term sanitization (prevent regex injection)
 * - ObjectId validation
 * - Type-safe query building
 * 
 * Usage:
 *   import { parseQueryParams, buildMongoQuery, sanitizeSearch } from '../utils/queryParams';
 *   
 *   const params = parseQueryParams(req.query, {
 *     status: { type: 'number', allowed: [1, 2, 3, 4, 5] },
 *     priority: { type: 'enum', allowed: ['low', 'medium', 'high', 'critical'] },
 *     search: { type: 'search', fields: ['title', 'description'] },
 *     createdAfter: { type: 'date' },
 *   });
 */

import mongoose from 'mongoose';

// ============================================
// TYPES
// ============================================

export type ParamType = 'string' | 'number' | 'boolean' | 'date' | 'objectId' | 
                        'objectIdArray' | 'numberArray' | 'stringArray' | 'enum' | 'search';

export interface ParamConfig {
  type: ParamType;
  required?: boolean;
  default?: any;
  allowed?: any[]; // For enum type
  min?: number; // For number type
  max?: number; // For number type
  fields?: string[]; // For search type - fields to search in
}

export interface ParsedParams {
  [key: string]: any;
  _errors: string[];
  _isValid: boolean;
}

export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

export interface DateRangeFilter {
  $gte?: Date;
  $lte?: Date;
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if string is a valid MongoDB ObjectId
 */
export const isValidObjectId = (id: string): boolean => {
  return mongoose.Types.ObjectId.isValid(id) && 
         new mongoose.Types.ObjectId(id).toString() === id;
};

/**
 * Sanitize search string to prevent regex injection
 */
export const sanitizeSearch = (search: string): string => {
  if (!search || typeof search !== 'string') return '';
  // Escape regex special characters
  return search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
};

/**
 * Parse date string to Date object
 */
export const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Parse boolean string to boolean
 */
export const parseBoolean = (value: string | boolean): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
};

// ============================================
// PARSING FUNCTIONS
// ============================================

/**
 * Parse a single query parameter based on config
 */
export const parseParam = (
  value: any,
  config: ParamConfig
): { value: any; error?: string } => {
  // Handle missing value
  if (value === undefined || value === null || value === '') {
    if (config.required) {
      return { value: undefined, error: 'Required parameter is missing' };
    }
    return { value: config.default };
  }

  switch (config.type) {
    case 'string':
      return { value: String(value).trim() };

    case 'number': {
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        return { value: config.default, error: 'Invalid number' };
      }
      if (config.min !== undefined && num < config.min) {
        return { value: config.min };
      }
      if (config.max !== undefined && num > config.max) {
        return { value: config.max };
      }
      return { value: num };
    }

    case 'boolean': {
      const bool = parseBoolean(value);
      if (bool === null) {
        return { value: config.default, error: 'Invalid boolean' };
      }
      return { value: bool };
    }

    case 'date': {
      const date = parseDate(value);
      if (!date) {
        return { value: undefined, error: 'Invalid date format' };
      }
      return { value: date };
    }

    case 'objectId': {
      if (!isValidObjectId(value)) {
        return { value: undefined, error: 'Invalid ObjectId' };
      }
      return { value: new mongoose.Types.ObjectId(value) };
    }

    case 'objectIdArray': {
      const ids = String(value).split(',').map(id => id.trim()).filter(Boolean);
      const validIds: mongoose.Types.ObjectId[] = [];
      for (const id of ids) {
        if (isValidObjectId(id)) {
          validIds.push(new mongoose.Types.ObjectId(id));
        }
      }
      return { value: validIds.length > 0 ? validIds : undefined };
    }

    case 'numberArray': {
      const nums = String(value).split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      if (config.allowed) {
        const filtered = nums.filter(n => config.allowed!.includes(n));
        return { value: filtered.length > 0 ? filtered : undefined };
      }
      return { value: nums.length > 0 ? nums : undefined };
    }

    case 'stringArray': {
      const strs = String(value).split(',').map(s => s.trim()).filter(Boolean);
      if (config.allowed) {
        const filtered = strs.filter(s => config.allowed!.includes(s.toLowerCase()));
        return { value: filtered.length > 0 ? filtered : undefined };
      }
      return { value: strs.length > 0 ? strs : undefined };
    }

    case 'enum': {
      const val = String(value).toLowerCase().trim();
      if (config.allowed && !config.allowed.includes(val)) {
        return { value: config.default, error: `Invalid value. Allowed: ${config.allowed.join(', ')}` };
      }
      return { value: val };
    }

    case 'search': {
      const sanitized = sanitizeSearch(String(value));
      return { value: sanitized || undefined };
    }

    default:
      return { value: String(value) };
  }
};

/**
 * Parse all query parameters based on config map
 */
export const parseQueryParams = (
  query: Record<string, any>,
  config: Record<string, ParamConfig>
): ParsedParams => {
  const result: ParsedParams = {
    _errors: [],
    _isValid: true,
  };

  for (const [key, paramConfig] of Object.entries(config)) {
    const { value, error } = parseParam(query[key], paramConfig);
    
    if (error) {
      result._errors.push(`${key}: ${error}`);
      if (paramConfig.required) {
        result._isValid = false;
      }
    }
    
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

// ============================================
// SORTING FUNCTIONS
// ============================================

/**
 * Parse and validate sort parameters
 */
export const parseSortParams = (
  query: Record<string, any>,
  allowedFields: string[],
  defaultSort: SortConfig = { field: 'createdAt', order: 'desc' }
): SortConfig => {
  const sortBy = String(query.sortBy || '').trim();
  const sortOrder = String(query.sortOrder || '').toLowerCase().trim();

  const field = allowedFields.includes(sortBy) ? sortBy : defaultSort.field;
  const order = sortOrder === 'asc' ? 'asc' : sortOrder === 'desc' ? 'desc' : defaultSort.order;

  return { field, order };
};

/**
 * Build Mongoose sort object from SortConfig
 */
export const buildSortObject = (sort: SortConfig): Record<string, 1 | -1> => {
  return { [sort.field]: sort.order === 'asc' ? 1 : -1 };
};

// ============================================
// QUERY BUILDING FUNCTIONS
// ============================================

/**
 * Build date range filter for MongoDB query
 */
export const buildDateRangeFilter = (
  startDate?: Date,
  endDate?: Date
): DateRangeFilter | undefined => {
  if (!startDate && !endDate) return undefined;

  const filter: DateRangeFilter = {};
  if (startDate) {
    filter.$gte = startDate;
  }
  if (endDate) {
    // Set to end of day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    filter.$lte = endOfDay;
  }
  return filter;
};

/**
 * Build search filter for multiple fields
 */
export const buildSearchFilter = (
  search: string | undefined,
  fields: string[]
): any => {
  if (!search || fields.length === 0) return undefined;

  const sanitized = sanitizeSearch(search);
  if (!sanitized) return undefined;

  return {
    $or: fields.map(field => ({
      [field]: { $regex: sanitized, $options: 'i' }
    }))
  };
};

/**
 * Build complete MongoDB query from parsed params
 */
export const buildMongoQuery = (
  params: ParsedParams,
  fieldMappings: Record<string, string | ((value: any) => any)>
): any => {
  const query: any = {};

  for (const [paramKey, mongoField] of Object.entries(fieldMappings)) {
    const value = params[paramKey];
    if (value === undefined) continue;

    if (typeof mongoField === 'function') {
      // Custom transform function
      const result = mongoField(value);
      if (result !== undefined) {
        Object.assign(query, result);
      }
    } else {
      // Direct field mapping
      if (Array.isArray(value)) {
        query[mongoField] = { $in: value };
      } else {
        query[mongoField] = value;
      }
    }
  }

  return query;
};

// ============================================
// PREDEFINED CONFIGS FOR COMMON ENTITIES
// ============================================

/**
 * Common ticket query parameters config
 */
export const TICKET_QUERY_CONFIG: Record<string, ParamConfig> = {
  status: { type: 'numberArray', allowed: [1, 2, 3, 4, 5] },
  priority: { type: 'stringArray', allowed: ['low', 'medium', 'high', 'critical'] },
  search: { type: 'search' },
  projectId: { type: 'objectId' },
  projectIds: { type: 'objectIdArray' },
  categoryId: { type: 'objectId' },
  assignedTo: { type: 'objectId' },
  createdAfter: { type: 'date' },
  createdBefore: { type: 'date' },
  centerId: { type: 'string' }, // Can be 'online' or ObjectId
  submissionSource: { type: 'enum', allowed: ['online', 'offline', 'email', 'whatsapp'] },
  slaStatus: { type: 'enum', allowed: ['within_sla', 'outside_sla', 'pending'] },
  unassigned: { type: 'boolean' },
};

/**
 * Common user query parameters config
 */
export const USER_QUERY_CONFIG: Record<string, ParamConfig> = {
  search: { type: 'search' },
  role: { type: 'objectId' },
  isActive: { type: 'boolean' },
  project: { type: 'objectId' },
  department: { type: 'string' },
  centers: { type: 'objectIdArray' },
  createdAfter: { type: 'date' },
  createdBefore: { type: 'date' },
};

/**
 * Common KB article query parameters config
 */
export const KB_ARTICLE_QUERY_CONFIG: Record<string, ParamConfig> = {
  projectId: { type: 'string' }, // Can be 'all' or ObjectId
  levelId: { type: 'objectId' },
  status: { type: 'enum', allowed: ['active', 'draft', 'archived'] },
  search: { type: 'search' },
  tags: { type: 'stringArray' },
  author: { type: 'objectId' },
  isFeatured: { type: 'boolean' },
  publishedAfter: { type: 'date' },
  publishedBefore: { type: 'date' },
};

/**
 * Allowed sort fields per entity type
 */
export const SORT_FIELDS = {
  tickets: ['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber', 'slaDeadline'],
  users: ['createdAt', 'firstName', 'lastName', 'email', 'lastLogin'],
  projects: ['createdAt', 'name', 'code', 'status'],
  kbArticles: ['createdAt', 'publishedAt', 'viewCount', 'title', 'displayOrder'],
  categories: ['order', 'name', 'createdAt'],
  centers: ['centerName', 'city', 'state', 'createdAt'],
  assets: ['name', 'createdAt', 'category'],
  logs: ['createdAt', 'timestamp'],
};

// ============================================
// HELPER MIDDLEWARE
// ============================================

/**
 * Middleware to parse and attach query params to request
 */
export const parseQueryMiddleware = (
  config: Record<string, ParamConfig>
) => {
  return (req: any, res: any, next: any) => {
    const parsed = parseQueryParams(req.query, config);
    
    if (!parsed._isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: parsed._errors,
      });
    }
    
    req.parsedQuery = parsed;
    next();
  };
};

export default {
  isValidObjectId,
  sanitizeSearch,
  parseDate,
  parseBoolean,
  parseParam,
  parseQueryParams,
  parseSortParams,
  buildSortObject,
  buildDateRangeFilter,
  buildSearchFilter,
  buildMongoQuery,
  parseQueryMiddleware,
  TICKET_QUERY_CONFIG,
  USER_QUERY_CONFIG,
  KB_ARTICLE_QUERY_CONFIG,
  SORT_FIELDS,
};
