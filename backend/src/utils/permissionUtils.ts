import mongoose from 'mongoose';

/**
 * CENTRALIZED PERMISSION EXTRACTION UTILITY
 * 
 * This utility safely extracts permission codes from role.permissions array
 * regardless of whether permissions are:
 * - Already populated objects (have .code property)
 * - ObjectIds that need to be fetched from database
 * - Permission codes as strings
 * 
 * USE THIS EVERYWHERE to avoid permission extraction bugs!
 */

export interface PermissionObject {
  _id?: mongoose.Types.ObjectId | string;
  code: string;
  name?: string;
  module?: string;
}

/**
 * Safely extract permission codes from a permissions array
 * Handles both populated objects and ObjectIds automatically
 * 
 * @param permissions - Array of permissions (can be objects, ObjectIds, or strings)
 * @param context - Optional context string for logging (e.g., "JWT Generation", "Auth Middleware")
 * @returns Array of permission code strings
 */
export async function extractPermissionCodes(
  permissions: any[] | undefined | null,
  context: string = 'Permission Extraction'
): Promise<string[]> {
  // Handle null/undefined/empty array
  if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
    console.log(`⚠️ [${context}] No permissions provided`);
    return [];
  }

  console.log(`🔍 [${context}] Processing ${permissions.length} permission items`);

  // Check first item to determine the type
  const firstItem = permissions[0];

  // Case 1: Already permission objects with 'code' property
  if (firstItem && typeof firstItem === 'object' && 'code' in firstItem) {
    console.log(`✅ [${context}] Permissions already populated - extracting codes directly`);
    const codes = permissions
      .map((p: any) => p?.code)
      .filter((code): code is string => typeof code === 'string' && code.length > 0);
    console.log(`✅ [${context}] Extracted ${codes.length} permission codes`);
    return codes;
  }

  // Case 2: Permission codes as strings
  if (typeof firstItem === 'string') {
    console.log(`✅ [${context}] Permissions are already strings`);
    const codes = permissions.filter((p): p is string => typeof p === 'string');
    console.log(`✅ [${context}] Found ${codes.length} permission codes`);
    return codes;
  }

  // Case 3: ObjectIds - need to fetch from database
  console.log(`🔍 [${context}] Permissions are ObjectIds - fetching from database`);
  try {
    const permissionObjects = await mongoose.connection.db
      .collection('permissions')
      .find({ _id: { $in: permissions } })
      .toArray();

    console.log(`✅ [${context}] Fetched ${permissionObjects.length} permission objects from database`);
    
    const codes = permissionObjects
      .map((p: any) => p?.code)
      .filter((code): code is string => typeof code === 'string' && code.length > 0);
    
    console.log(`✅ [${context}] Extracted ${codes.length} permission codes`);
    return codes;
  } catch (error) {
    console.error(`❌ [${context}] Failed to fetch permissions from database:`, error);
    return [];
  }
}

/**
 * Check if permissions array is already populated (contains objects with 'code')
 * @param permissions - Array of permissions
 * @returns true if permissions are already populated objects
 */
export function arePermissionsPopulated(permissions: any[] | undefined | null): boolean {
  if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
    return false;
  }
  
  const firstItem = permissions[0];
  return firstItem && typeof firstItem === 'object' && 'code' in firstItem;
}

/**
 * Validate that a role has required permissions
 * @param rolePermissions - Array of permission codes
 * @param requiredPermissions - Array of required permission codes
 * @returns Object with validation result and missing permissions
 */
export function validateRolePermissions(
  rolePermissions: string[],
  requiredPermissions: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredPermissions.filter(req => !rolePermissions.includes(req));
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Check if permission codes array includes a specific permission
 * @param permissionCodes - Array of permission codes
 * @param permission - Permission code to check
 * @returns true if permission exists
 */
export function hasPermission(permissionCodes: string[], permission: string): boolean {
  return permissionCodes.includes(permission);
}

/**
 * Check if permission codes array includes ANY of the specified permissions
 * @param permissionCodes - Array of permission codes
 * @param permissions - Array of permission codes to check
 * @returns true if at least one permission exists
 */
export function hasAnyPermission(permissionCodes: string[], permissions: string[]): boolean {
  return permissions.some(p => permissionCodes.includes(p));
}

/**
 * Check if permission codes array includes ALL of the specified permissions
 * @param permissionCodes - Array of permission codes
 * @param permissions - Array of permission codes to check
 * @returns true if all permissions exist
 */
export function hasAllPermissions(permissionCodes: string[], permissions: string[]): boolean {
  return permissions.every(p => permissionCodes.includes(p));
}

/**
 * Filter permission codes by module prefix
 * @param permissionCodes - Array of permission codes
 * @param modulePrefix - Module prefix (e.g., 'TICKET_', 'USER_')
 * @returns Filtered array of permission codes
 */
export function getPermissionsByModule(permissionCodes: string[], modulePrefix: string): string[] {
  return permissionCodes.filter(code => code.startsWith(modulePrefix));
}
