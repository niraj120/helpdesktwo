import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { config } from '../config';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: any;
    firstName?: string;
    lastName?: string;
    tokenVersion?: number;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log('❌ [AUTH] No token provided');
      res.status(401).json({ message: 'No token provided' });
      return;
    }

    // Use centralized config for JWT secret
    console.log('🔐 [AUTH] Verifying token with secure secret');
    console.log('🎫 [AUTH] Token to verify (first 20 chars):', token.substring(0, 20));
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    console.log('✅ [AUTH] Token verified for user:', decoded.userId, decoded.email);
    
    // Check if token version matches user's current token version
    // AND fetch the full role with permissions for permission checking
    const user = await User.findById(decoded.userId)
      .select('tokenVersion')
      .populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });
      
    if (user) {
      const currentTokenVersion = user.tokenVersion || 0;
      const tokenTokenVersion = decoded.tokenVersion || 0;
      
      if (currentTokenVersion !== tokenTokenVersion) {
        console.log(`❌ [AUTH] Token version mismatch. User: ${currentTokenVersion}, Token: ${tokenTokenVersion}`);
        console.log('🔄 [AUTH] Permissions have been updated. Please log in again.');
        res.status(401).json({ 
          message: 'Your permissions have been updated. Please log in again.',
          code: 'TOKEN_VERSION_MISMATCH'
        });
        return;
      }
      
      // Attach full role with populated permissions to req.user
      const role = user.role as any;
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: role, // Full role object with permissions populated
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        tokenVersion: decoded.tokenVersion
      };
    } else {
      // User not found in database
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role, // Fallback to JWT role
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        tokenVersion: decoded.tokenVersion
      };
    }

    next();
  } catch (error) {
    console.error('❌ [AUTH] Token verification failed:', error instanceof Error ? error.message : error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Export alias for backward compatibility
export const auth = authMiddleware;

// Public auth middleware - allows requests without authentication
export const publicAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  console.log('✅ [PUBLIC_AUTH] Middleware executing');
  try {
    const token = req.headers.authorization?.split(' ')[1];
    console.log(`✅ [PUBLIC_AUTH] Token present: ${token ? 'YES' : 'NO'}`);

    if (!token) {
      // No token - continue without authentication
      console.log('✅ [PUBLIC_AUTH] No token - continuing WITHOUT auth (public access)');
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
      lastName: decoded.lastName
    };

    next();
  } catch (error) {
    // Invalid/expired token - continue without authentication
    console.log('✅ [PUBLIC_AUTH] Invalid token - continuing WITHOUT auth');
    next();
  }
};
