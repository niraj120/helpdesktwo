/**
 * PSR Audit Log Middleware (US-5.4 — AuthZ on admin surface)
 *
 * Logs all PSR admin mutations (POST/PUT/DELETE) to the ActivityLog collection.
 * Records: who (userId + email), what (action + entity + entityId), when (timestamp),
 * and sanitized request metadata (no secrets).
 *
 * Applied to all write routes in psrPipelineRoutes.ts.
 *
 * Note: this middleware runs AFTER the handler (post-response logging), so it
 * doesn't block the response. The handler attaches `res.locals.psrAuditMeta`
 * with the entity details before responding.
 */

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import ActivityLog from "../models/ActivityLog";

export interface PsrAuditMeta {
  entityId?: string;
  entityName?: string;
  changes?: { field: string; oldValue: any; newValue: any }[];
  description?: string;
}

/**
 * Determine a human-readable action string from the HTTP method.
 */
function actionFromMethod(
  method: string,
): "create" | "update" | "delete" | "edit" {
  switch (method.toUpperCase()) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return "edit";
  }
}

/**
 * Sanitize request body — strip any auth/secretRef fields before logging.
 * This is the last line of defence for US-5.3.
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== "object") return undefined;
  const clone = JSON.parse(JSON.stringify(body));
  // Recursively redact sensitive keys
  const redact = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (
        /secretRef|apiKey|password|token|credential|secret/i.test(key)
      ) {
        obj[key] = "[REDACTED]";
      } else if (typeof obj[key] === "object") {
        redact(obj[key]);
      }
    }
  };
  redact(clone);
  return clone;
}

/**
 * Middleware factory. Call with the entity name, e.g. `psrAuditLog("PSR Pipeline")`.
 * Attach to write routes ONLY — skip for GET.
 */
export function psrAuditLog(entityLabel: string) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Let the handler run first
    res.on("finish", async () => {
      try {
        // Only log successful mutations (2xx)
        if (res.statusCode < 200 || res.statusCode >= 300) return;

        const user = req.user;
        if (!user) return;

        const meta: PsrAuditMeta = res.locals.psrAuditMeta || {};
        const entityId =
          meta.entityId ||
          req.params?.id ||
          req.params?.runId ||
          undefined;

        await ActivityLog.create({
          userId: user.userId,
          userName:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.email,
          userEmail: user.email,
          action: actionFromMethod(req.method),
          entity: entityLabel,
          entityId,
          entityName: meta.entityName,
          description:
            meta.description ||
            `${req.method} ${req.originalUrl}`,
          changes: meta.changes,
          ipAddress:
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
            req.socket?.remoteAddress ||
            "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          timestamp: new Date(),
          metadata: {
            method: req.method,
            url: req.originalUrl,
            body: sanitizeBody(req.body),
            statusCode: res.statusCode,
          },
        });
      } catch (err) {
        // Audit logging must never crash the server
        console.error("[PSR Audit] Log failed:", (err as Error).message);
      }
    });

    next();
  };
}
