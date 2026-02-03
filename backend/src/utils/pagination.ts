/**
 * Pagination Utility
 * 
 * Provides consistent pagination across all API endpoints.
 * 
 * Features:
 * - Default page size: 20
 * - Maximum page size: 100 (enforced)
 * - Consistent response format
 * - Helper for building pagination metadata
 * 
 * Usage:
 *   import { getPaginationParams, buildPaginationResponse } from '../utils/pagination';
 *   
 *   const { page, limit, skip } = getPaginationParams(req.query);
 *   const [items, total] = await Promise.all([
 *     Model.find(query).skip(skip).limit(limit),
 *     Model.countDocuments(query)
 *   ]);
 *   return buildPaginationResponse(res, items, total, page, limit);
 */

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
}

// Configuration
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;

/**
 * Extract and validate pagination parameters from query
 */
export const getPaginationParams = (
  query: Record<string, any>,
  defaults?: { page?: number; limit?: number }
): PaginationParams => {
  const defaultPage = defaults?.page ?? 1;
  const defaultLimit = defaults?.limit ?? DEFAULT_PAGE_SIZE;
  
  // Parse page number (minimum 1)
  let page = parseInt(query.page as string) || defaultPage;
  page = Math.max(1, page);
  
  // Parse and enforce limit (between MIN and MAX)
  let limit = parseInt(query.limit as string) || defaultLimit;
  limit = Math.max(MIN_PAGE_SIZE, Math.min(limit, MAX_PAGE_SIZE));
  
  // Calculate skip
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
};

/**
 * Build pagination metadata
 */
export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Build a complete paginated response
 */
export const buildPaginationResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  additionalData?: Record<string, any>
): PaginatedResponse<T> & Record<string, any> => {
  return {
    success: true,
    data,
    pagination: buildPaginationMeta(total, page, limit),
    ...additionalData,
  };
};

/**
 * Express response helper - sends paginated JSON response
 */
export const sendPaginatedResponse = <T>(
  res: any,
  data: T[],
  total: number,
  page: number,
  limit: number,
  additionalData?: Record<string, any>
): void => {
  res.json(buildPaginationResponse(data, total, page, limit, additionalData));
};

/**
 * Enforce maximum limit on a value
 */
export const enforceMaxLimit = (
  requestedLimit: number | string | undefined,
  defaultLimit: number = DEFAULT_PAGE_SIZE,
  maxLimit: number = MAX_PAGE_SIZE
): number => {
  const limit = parseInt(requestedLimit as string) || defaultLimit;
  return Math.max(MIN_PAGE_SIZE, Math.min(limit, maxLimit));
};

/**
 * Constants for use in controllers
 */
export const PAGINATION_DEFAULTS = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
};

export default {
  getPaginationParams,
  buildPaginationMeta,
  buildPaginationResponse,
  sendPaginatedResponse,
  enforceMaxLimit,
  PAGINATION_DEFAULTS,
};
