/**
 * ObjectId Utility Functions
 * 
 * Centralized utilities for MongoDB ObjectId operations.
 * Use these functions instead of scattered `new mongoose.Types.ObjectId()` calls.
 * 
 * Benefits:
 * - Single source of truth for ObjectId handling
 * - Consistent type safety across the codebase
 * - Easier maintenance and debugging
 * - Prevents string/ObjectId type mismatches
 * 
 * Usage:
 *   import { toObjectId, toObjectIdArray, isValidObjectId, ensureObjectId } from '../utils/objectIdUtils';
 *   
 *   // Convert any value to ObjectId
 *   const id = toObjectId(stringOrObjectId); // Returns ObjectId or null
 *   
 *   // Safe conversion with fallback
 *   const id = ensureObjectId(value) ?? defaultId;
 *   
 *   // Convert array
 *   const ids = toObjectIdArray(['id1', 'id2', objectId3]);
 */

import mongoose from 'mongoose';

// Type alias for readability
export type ObjectIdLike = mongoose.Types.ObjectId | string | { _id: mongoose.Types.ObjectId | string } | { toString(): string };

/**
 * Check if a value is a valid MongoDB ObjectId
 * Works with strings, ObjectIds, and objects with _id property
 */
export function isValidObjectId(value: unknown): boolean {
  if (!value) return false;
  
  // Already an ObjectId
  if (value instanceof mongoose.Types.ObjectId) return true;
  
  // String that represents valid ObjectId
  if (typeof value === 'string') {
    return mongoose.Types.ObjectId.isValid(value) && 
           new mongoose.Types.ObjectId(value).toString() === value;
  }
  
  // Object with _id property
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return isValidObjectId((value as { _id: unknown })._id);
  }
  
  return false;
}

/**
 * Convert a value to ObjectId
 * Returns null if conversion fails
 * 
 * @param value - String, ObjectId, or object with _id
 * @returns ObjectId or null
 */
export function toObjectId(value: unknown): mongoose.Types.ObjectId | null {
  if (!value) return null;
  
  try {
    // Already an ObjectId - return as is
    if (value instanceof mongoose.Types.ObjectId) {
      return value;
    }
    
    // String - convert to ObjectId
    if (typeof value === 'string') {
      if (mongoose.Types.ObjectId.isValid(value)) {
        return new mongoose.Types.ObjectId(value);
      }
      return null;
    }
    
    // Object with _id property - extract and convert
    if (typeof value === 'object' && value !== null) {
      if ('_id' in value) {
        return toObjectId((value as { _id: unknown })._id);
      }
      // Object with toString method (like ObjectId)
      if ('toString' in value && typeof (value as any).toString === 'function') {
        const str = (value as any).toString();
        if (mongoose.Types.ObjectId.isValid(str)) {
          return new mongoose.Types.ObjectId(str);
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a value to ObjectId, throwing error if invalid
 * Use when you need guaranteed ObjectId
 * 
 * @param value - Value to convert
 * @param fieldName - Name of field for error message
 * @returns ObjectId
 * @throws Error if conversion fails
 */
export function toObjectIdStrict(value: unknown, fieldName = 'id'): mongoose.Types.ObjectId {
  const result = toObjectId(value);
  if (!result) {
    throw new Error(`Invalid ObjectId for ${fieldName}: ${String(value)}`);
  }
  return result;
}

/**
 * Ensure a value is an ObjectId - returns existing ObjectId or converts
 * This is the most common use case: "make sure this is ObjectId"
 * 
 * @param value - String or ObjectId
 * @returns ObjectId or null
 */
export function ensureObjectId(value: unknown): mongoose.Types.ObjectId | null {
  return toObjectId(value);
}

/**
 * Convert an array of values to ObjectIds
 * Filters out invalid values
 * 
 * @param values - Array of strings, ObjectIds, or objects with _id
 * @returns Array of ObjectIds (invalid entries filtered out)
 */
export function toObjectIdArray(values: unknown[]): mongoose.Types.ObjectId[] {
  if (!Array.isArray(values)) return [];
  
  return values
    .map(v => toObjectId(v))
    .filter((id): id is mongoose.Types.ObjectId => id !== null);
}

/**
 * Convert an array of values to ObjectIds, throwing if any are invalid
 * 
 * @param values - Array of values to convert
 * @param fieldName - Name of field for error message
 * @returns Array of ObjectIds
 * @throws Error if any value is invalid
 */
export function toObjectIdArrayStrict(values: unknown[], fieldName = 'ids'): mongoose.Types.ObjectId[] {
  if (!Array.isArray(values)) {
    throw new Error(`${fieldName} must be an array`);
  }
  
  return values.map((v, index) => {
    const result = toObjectId(v);
    if (!result) {
      throw new Error(`Invalid ObjectId at ${fieldName}[${index}]: ${String(v)}`);
    }
    return result;
  });
}

/**
 * Compare two ObjectId-like values for equality
 * Works with strings, ObjectIds, and objects with _id
 * 
 * @param a - First value
 * @param b - Second value
 * @returns true if both represent the same ObjectId
 */
export function objectIdEquals(a: unknown, b: unknown): boolean {
  const idA = toObjectId(a);
  const idB = toObjectId(b);
  
  if (!idA || !idB) return false;
  return idA.equals(idB);
}

/**
 * Check if an ObjectId exists in an array of ObjectId-like values
 * 
 * @param id - ObjectId to search for
 * @param array - Array to search in
 * @returns true if id is found in array
 */
export function objectIdInArray(id: unknown, array: unknown[]): boolean {
  const targetId = toObjectId(id);
  if (!targetId) return false;
  
  return array.some(item => objectIdEquals(item, targetId));
}

/**
 * Extract ObjectId string from any ObjectId-like value
 * 
 * @param value - String, ObjectId, or object with _id
 * @returns String representation of ObjectId, or null
 */
export function toObjectIdString(value: unknown): string | null {
  const objectId = toObjectId(value);
  return objectId ? objectId.toHexString() : null;
}

/**
 * Create a new ObjectId
 * Wrapper for consistency
 */
export function newObjectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

export default {
  isValidObjectId,
  toObjectId,
  toObjectIdStrict,
  ensureObjectId,
  toObjectIdArray,
  toObjectIdArrayStrict,
  objectIdEquals,
  objectIdInArray,
  toObjectIdString,
  newObjectId,
};
