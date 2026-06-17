import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

/**
 * Rate limiter for authentication endpoints (login, OTP, account checks).
 *
 * Scoped ONLY to auth routes — a previous *global* limiter caused spurious 429s
 * for all traffic, so this is deliberately narrow. Limits are tunable via env
 * (AUTH_RATE_LIMIT_WINDOW_MS / AUTH_RATE_LIMIT_MAX) without a code change.
 *
 * Mitigates credential stuffing, brute force, and scripted account enumeration
 * (VAPT CODE-1 / CWE-204). Offending sources are logged for monitoring/review.
 */
const WINDOW_MS =
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX) || 100; // per client IP / window

/**
 * Resolve the originating client IP. The app runs behind nginx WITHOUT Express'
 * global `trust proxy` enabled, so derive the real client from X-Forwarded-For
 * (first hop) and fall back to the socket IP for local/dev. Keeping this local
 * to the limiter avoids changing global req.ip semantics elsewhere.
 */
const clientIp = (req: Request): string => {
  const xff = (req.headers?.["x-forwarded-for"] as string) || "";
  return xff.split(",")[0].trim() || req.ip || "unknown";
};

export const authRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => clientIp(req),
  handler: (req: Request, res: Response) => {
    console.warn(
      `🚧 [AUTH-RATELIMIT] Threshold exceeded — ip=${clientIp(req)} ${req.method} ${req.originalUrl} ua="${req.headers["user-agent"] || ""}"`,
    );
    res.status(429).json({
      success: false,
      message: "Too many attempts. Please wait a few minutes and try again.",
    });
  },
});

export default authRateLimiter;
