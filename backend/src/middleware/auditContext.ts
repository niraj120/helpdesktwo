import { Request, Response, NextFunction } from "express";
import { runWithAuditContext } from "../context/requestContext";
import { getClientIp } from "../utils/logger";

/**
 * Binds an AsyncLocalStorage audit context for the lifetime of the request, so
 * the global mongoose audit plugin — running deep in the async stack — can
 * attribute every mutation to the acting user without any controller passing
 * `req.user` down by hand.
 *
 * Mounted ONCE, early, before the route handlers. `next()` is invoked inside
 * the ALS scope, so everything the request touches (per-route auth, controllers,
 * mongoose hooks) shares the same store. The actor is resolved LAZILY from the
 * held `req` at write time, because per-route auth populates `req.user` only
 * after this middleware has run.
 */
export const auditContext = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const path = req.originalUrl.split("?")[0];
  const source =
    path.startsWith("/api/v1") || path.includes("/public/")
      ? "public-api"
      : "web";

  runWithAuditContext(
    {
      req,
      ipAddress: getClientIp(req),
      userAgent: (req.headers["user-agent"] as string) || undefined,
      method: req.method,
      route: `${req.method} ${path}`,
      source,
    },
    () => next(),
  );
};

export default auditContext;
