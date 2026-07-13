import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { PublicApiKey } from "../models/PublicApiKey";

export interface PublicApiRequest extends Request {
  publicApiProjectId?: string; // Validated project ObjectId string
}

// In-memory cache of validated keys → projectId. The webview makes several
// calls with the same key; caching skips the (expensive) bcrypt compare on
// every repeat. Short TTL so revocation takes effect quickly.
const KEY_CACHE = new Map<string, { projectId: string; exp: number }>();
const KEY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Middleware for all /v1/* public API routes.
 *
 * Only X-API-Key header is required. The project is resolved from the key
 * record itself, so vendors do not need to know or send the project ID.
 *
 * X-Project-ID header is optional — if provided it is validated to match
 * the project tied to the key, but it is never required.
 */
export const validatePublicApiKey = async (
  req: PublicApiRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  // ── 1. API key must be present ───────────────────────────────────
  if (!apiKey) {
    res.status(400).json({
      status: "error",
      code: "BAD_REQUEST",
      message: "X-API-Key header is required.",
    });
    return;
  }

  // ── 1b. Cache hit → skip bcrypt + DB entirely. ───────────────────
  const cached = KEY_CACHE.get(apiKey);
  if (cached && cached.exp > Date.now()) {
    const headerPid = req.headers["x-project-id"] as string | undefined;
    if (headerPid && headerPid !== cached.projectId) {
      res.status(403).json({
        status: "error",
        code: "PROJECT_MISMATCH",
        message: "X-Project-ID does not match the project tied to this API key.",
      });
      return;
    }
    req.publicApiProjectId = cached.projectId;
    next();
    return;
  }

  // ── 2. Narrow by keyPrefix (first 8 chars) so we bcrypt-compare only the
  //       candidate(s) for this key, not every active key. bcrypt.compare is
  //       ~200ms each — comparing against all keys made every /v1 call slow.
  const prefix = apiKey.slice(0, 8);
  let candidates = await PublicApiKey.find({ isActive: true, keyPrefix: prefix })
    .select("keyHash projectId")
    .lean();

  // Back-compat: if no key stored a matching prefix, fall back to all active.
  if (candidates.length === 0) {
    candidates = await PublicApiKey.find({ isActive: true })
      .select("keyHash projectId")
      .lean();
  }

  if (candidates.length === 0) {
    res.status(401).json({
      status: "error",
      code: "INVALID_API_KEY",
      message: "API key is missing, invalid, or has been revoked.",
    });
    return;
  }

  let matchedProjectId: string | null = null;
  for (const record of candidates) {
    const match = await bcrypt.compare(apiKey, record.keyHash);
    if (match) {
      matchedProjectId = record.projectId.toString();
      break;
    }
  }

  if (!matchedProjectId) {
    res.status(401).json({
      status: "error",
      code: "INVALID_API_KEY",
      message: "API key is missing, invalid, or has been revoked.",
    });
    return;
  }

  // ── 3. Optional X-Project-ID validation ─────────────────────────
  const headerProjectId = req.headers["x-project-id"] as string | undefined;
  if (headerProjectId && headerProjectId !== matchedProjectId) {
    res.status(403).json({
      status: "error",
      code: "PROJECT_MISMATCH",
      message: "X-Project-ID does not match the project tied to this API key.",
    });
    return;
  }

  // Cache the validated key so repeat calls skip bcrypt.
  KEY_CACHE.set(apiKey, {
    projectId: matchedProjectId,
    exp: Date.now() + KEY_CACHE_TTL_MS,
  });

  // ── 4. Attach validated project ID to request ────────────────────
  req.publicApiProjectId = matchedProjectId;
  next();
};
