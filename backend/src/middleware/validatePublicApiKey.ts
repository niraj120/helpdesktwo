import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { PublicApiKey } from "../models/PublicApiKey";

export interface PublicApiRequest extends Request {
  publicApiProjectId?: string; // Validated project ObjectId string
}

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

  // ── 2. Load all active keys (across all projects) and bcrypt-match ─
  const activeKeys = await PublicApiKey.find({ isActive: true })
    .select("keyHash projectId")
    .lean();

  if (activeKeys.length === 0) {
    res.status(401).json({
      status: "error",
      code: "INVALID_API_KEY",
      message: "API key is missing, invalid, or has been revoked.",
    });
    return;
  }

  let matchedProjectId: string | null = null;
  for (const record of activeKeys) {
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

  // ── 4. Attach validated project ID to request ────────────────────
  req.publicApiProjectId = matchedProjectId;
  next();
};
