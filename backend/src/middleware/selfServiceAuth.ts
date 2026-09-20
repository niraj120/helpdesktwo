/**
 * Auth for the parent self-service API. Accepts EITHER:
 *   - X-API-Key: pub_…            (server-to-server, e.g. the app/web backend)
 *   - Authorization: Bearer <t>   (short-lived parent session token, browser-safe)
 *
 * The parent web/app backend (which already authenticated the parent) mints a
 * session token via POST /v1/service-requests/session using its pub_ key. The
 * browser modal opens our portal with that token in the URL — the pub_ key never
 * reaches the client, and a token can only access ITS parent's own data.
 */
import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { validatePublicApiKey, PublicApiRequest } from "./validatePublicApiKey";

export const PARENT_SESSION_SCOPE = "parent_self_service";
/** Short-lived — the parent app re-mints as needed. */
export const PARENT_SESSION_TTL = "20m";

export interface ParentSessionRequest extends PublicApiRequest {
  /** Set when the caller authenticated with a parent session token. The parent
   *  is locked to this mobile — they cannot query another parent's data. */
  parentSessionMobile?: string;
  /** Enrolment numbers of the children mapped to that parent, resolved when
   *  the session was minted; the student-shared list is scoped to these. */
  parentSessionEnrolments?: string[];
}

/** Mint a parent session token (called after pub_ key validation). */
export function signParentSession(
  projectId: string,
  parentMobile: string,
  enrolments: string[] = [],
): string {
  return jwt.sign(
    { scope: PARENT_SESSION_SCOPE, projectId, parentMobile, enrolments },
    config.jwt.secret,
    { expiresIn: PARENT_SESSION_TTL },
  );
}

export const resolveSelfServiceAuth = async (
  req: ParentSessionRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = req.headers["authorization"] as string | undefined;
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (bearer) {
    try {
      const decoded = jwt.verify(bearer, config.jwt.secret) as any;
      if (decoded?.scope !== PARENT_SESSION_SCOPE || !decoded.projectId) {
        res.status(401).json({
          status: "error",
          code: "INVALID_SESSION",
          message: "Invalid or expired parent session token.",
        });
        return;
      }
      req.publicApiProjectId = String(decoded.projectId);
      req.parentSessionMobile = String(decoded.parentMobile || "");
      req.parentSessionEnrolments = Array.isArray(decoded.enrolments)
        ? decoded.enrolments.map(String)
        : [];
      next();
      return;
    } catch {
      res.status(401).json({
        status: "error",
        code: "INVALID_SESSION",
        message: "Invalid or expired parent session token.",
      });
      return;
    }
  }

  // No session token → fall back to pub_ API key (server-to-server callers).
  return validatePublicApiKey(req, res, next);
};
