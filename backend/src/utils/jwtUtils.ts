import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '../models/User';
import { IUser } from '../models/User';
import mongoose from 'mongoose';
import { config } from '../config';

/**
 * Centralized JWT Token Generation Utility
 * This ensures consistent token structure and dynamic permission loading for ALL users/roles
 */

export interface JWTPayload {
  userId: string | mongoose.Types.ObjectId;
  email: string;
  firstName?: string;
  lastName?: string;
  tokenVersion: number;
  role: {
    _id: string | mongoose.Types.ObjectId;
    code: string;
    name: string;
    permissions: string[]; // Always array of permission codes
  } | null;
  // Optional project-specific fields
  projectId?: string | mongoose.Types.ObjectId;
  projectName?: string;
  // Token metadata
  iat?: number;
  exp?: number;
}

/**
 * Get JWT secret from centralized config
 * @deprecated Use config.jwt.secret directly instead
 */
export function getJwtSecret(): string {
  return config.jwt.secret;
}

/**
 * Generate JWT token with dynamic permissions for any user
 * @param user - User document (should be populated with role and permissions)
 * @param additionalPayload - Optional additional payload fields (e.g., project info)
 * @param options - JWT sign options (default: 7 days expiry)
 * @returns JWT token string
 */
export async function generateUserJWT(
  user: IUser | any,
  additionalPayload: Partial<JWTPayload> = {},
  options: SignOptions = { expiresIn: '7d' }
): Promise<string> {
  try {
    // Ensure user has role populated with permissions
    let populatedUser = user;
    if (!user.role || !user.role.permissions) {
      console.log(`🔄 Populating role and permissions for user: ${user.email}`);
      populatedUser = await User.findById(user._id).populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });
    }

    if (!populatedUser) {
      throw new Error('User not found during JWT generation');
    }

    // Extract role information
    const roleData = populatedUser.role && typeof populatedUser.role === 'object' 
      ? populatedUser.role as any 
      : { _id: null, name: 'User', code: 'USER', permissions: [] };

    // Extract permission codes (handle both object and string formats)
    const permissions = roleData.permissions || [];
    const permissionCodes = permissions.map((p: any) => {
      if (typeof p === 'string') return p;
      if (typeof p === 'object' && p.code) return p.code;
      return String(p);
    });

    console.log(`🔑 JWT Generation for ${populatedUser.email}:`);
    console.log(`   Role: ${roleData.name} (${roleData.code})`);
    console.log(`   Permissions: ${permissionCodes.length}`);

    // Build JWT payload
    const payload: JWTPayload = {
      userId: populatedUser._id,
      email: populatedUser.email,
      firstName: populatedUser.firstName,
      lastName: populatedUser.lastName,
      tokenVersion: populatedUser.tokenVersion || 0,
      role: roleData._id ? {
        _id: roleData._id,
        code: roleData.code,
        name: roleData.name,
        permissions: permissionCodes
      } : null,
      ...additionalPayload // Merge any additional payload (project info, etc.)
    };

    // Sign the token
    const secret = getJwtSecret();
    const token = jwt.sign(payload, secret, options);

    console.log(`✅ JWT generated: ${token.length} chars, ${permissionCodes.length} permissions`);
    console.log(`🔍 JWT Payload being signed:`, JSON.stringify(payload, null, 2));

    return token;  } catch (error) {
    console.error('❌ JWT Generation Error:', error);
    throw new Error(`Failed to generate JWT token: ${error}`);
  }
}

/**
 * Verify and decode JWT token
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function verifyUserJWT(token: string): JWTPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('❌ JWT Verification Error:', error);
    return null;
  }
}

/**
 * Generate JWT for project-specific login
 * @param user - User document  
 * @param project - Project information
 * @param options - JWT sign options
 * @returns JWT token string
 */
export async function generateProjectJWT(
  user: IUser | any,
  project: { _id: any; name: string },
  options: SignOptions = { expiresIn: '7d' }
): Promise<string> {
  return generateUserJWT(user, {
    projectId: project._id,
    projectName: project.name
  }, options);
}

/**
 * Refresh user permissions in existing token
 * Useful when user role/permissions change without requiring full re-login
 * @param userId - User ID to refresh
 * @returns New JWT token with updated permissions
 */
export async function refreshUserPermissions(userId: string | mongoose.Types.ObjectId): Promise<string> {
  try {
    // Get user with latest role and permissions
    const user = await User.findById(userId).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    if (!user) {
      throw new Error('User not found for permission refresh');
    }

    // Increment token version to invalidate old tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    console.log(`🔄 Refreshing permissions for: ${user.email}`);
    
    // Generate new token with updated permissions
    return generateUserJWT(user);

  } catch (error) {
    console.error('❌ Permission Refresh Error:', error);
    throw new Error(`Failed to refresh permissions: ${error}`);
  }
}

/**
 * Extract permissions from JWT token without verification
 * Useful for frontend to quickly access permissions
 * @param token - JWT token string
 * @returns Array of permission codes
 */
export function extractPermissionsFromToken(token: string): string[] {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return [];

    const payload = JSON.parse(atob(parts[1]));
    return payload.role?.permissions || [];
  } catch (error) {
    console.error('❌ Permission Extraction Error:', error);
    return [];
  }
}

/**
 * Check if token has specific permission
 * @param token - JWT token string
 * @param permission - Permission code to check
 * @returns Boolean indicating if user has permission
 */
export function hasPermission(token: string, permission: string): boolean {
  const permissions = extractPermissionsFromToken(token);
  return permissions.includes(permission);
}

/**
 * Get user role information from token
 * @param token - JWT token string  
 * @returns Role information or null
 */
export function getRoleFromToken(token: string): { code: string; name: string; permissions: string[] } | null {
  try {
    const decoded = verifyUserJWT(token);
    return decoded?.role || null;
  } catch (error) {
    return null;
  }
}