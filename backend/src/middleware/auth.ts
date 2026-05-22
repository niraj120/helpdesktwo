import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/User";
import { config } from "../config";
import { extractPermissionCodes } from "../utils/permissionUtils";
import { cache } from "../utils/cache";

export interface ProjectContext {
  viewMode: "single" | "unified";
  currentProjectId: string | null;
  accessibleProjectIds: string[]; // Empty array means all projects (admin)
  isAdmin: boolean;
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: any;
    firstName?: string;
    lastName?: string;
    tokenVersion?: number;
    projects?: any[]; // Projects from user's role (ObjectIds)
    userDirectProjects?: any[]; // Projects directly assigned to user (ObjectIds)
    projectId?: string;   // Set when logged in via project-specific portal
    projectName?: string; // Display name of that project
  };
  projectContext?: ProjectContext; // Attached by attachProjectContext middleware
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;

    // Cache key includes tokenVersion so the cache is auto-invalidated when
    // permissions change (tokenVersion increments on role/permission updates).
    const authCacheKey = `auth:processed:${decoded.userId}:${decoded.tokenVersion || 0}`;
    const cachedUser = cache.get<AuthRequest["user"]>(authCacheKey);

    if (cachedUser) {
      req.user = cachedUser;
      return next();
    }

    // Cache miss — fetch user from DB with role + permissions populated
    const user = await User.findById(decoded.userId)
      .select("tokenVersion projects")
      .populate({
        path: "role",
        populate: {
          path: "permissions",
        },
      })
      .populate("projects", "_id name code branding status")
      .lean();

    if (user) {
      const currentTokenVersion = (user as any).tokenVersion || 0;
      const tokenTokenVersion = decoded.tokenVersion || 0;

      if (currentTokenVersion !== tokenTokenVersion) {
        res.status(401).json({
          message: "Your permissions have been updated. Please log in again.",
          code: "TOKEN_VERSION_MISMATCH",
        });
        return;
      }

      const role = (user as any).role as any;

      const permissionCodes = await extractPermissionCodes(
        role?.permissions,
        `Auth Middleware [${decoded.email}]`,
      );

      const userData: AuthRequest["user"] = {
        userId: decoded.userId,
        email: decoded.email,
        role: {
          ...(role || {}),
          permissions: permissionCodes,
        },
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        tokenVersion: decoded.tokenVersion,
        projects: role?.projects || [], // role-assigned project IDs
        userDirectProjects:
          ((user as any).projects as any[])?.map((p: any) => p._id || p) || [], // user's own project IDs
        projectId: decoded.projectId ? decoded.projectId.toString() : undefined,
        projectName: decoded.projectName,
      };

      // Cache for 30 seconds — eliminates DB hit for every subsequent request
      cache.set(authCacheKey, userData, 30);
      req.user = userData;
    } else {
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        tokenVersion: decoded.tokenVersion,
      };
    }

    next();
  } catch (error) {
    console.error(
      "❌ [AUTH] Token verification failed:",
      error instanceof Error ? error.message : error,
    );
    res.status(401).json({ message: "Invalid token" });
  }
};

// Export alias for backward compatibility
export const auth = authMiddleware;

// Public auth middleware - allows requests without authentication
export const publicAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  console.log("✅ [PUBLIC_AUTH] Middleware executing");
  try {
    const token = req.headers.authorization?.split(" ")[1];
    console.log(`✅ [PUBLIC_AUTH] Token present: ${token ? "YES" : "NO"}`);

    if (!token) {
      // No token - continue without authentication
      console.log(
        "✅ [PUBLIC_AUTH] No token - continuing WITHOUT auth (public access)",
      );
      next();
      return;
    }

    // Use centralized config for JWT secret
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    console.log(`✅ [PUBLIC_AUTH] Token verified for user: ${decoded.userId}`);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
    };

    next();
  } catch (error) {
    // Invalid/expired token - continue without authentication
    console.log("✅ [PUBLIC_AUTH] Invalid token - continuing WITHOUT auth");
    next();
  }
};
