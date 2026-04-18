import { Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { PublicApiKey } from "../models/PublicApiKey";
import { AuthRequest } from "../middleware/auth";

// ── Helper: generate a pub_ prefixed random key ──────────────────────────────
function generateRawKey(): string {
  return "pub_" + crypto.randomBytes(32).toString("hex");
}

/**
 * POST /api/admin/public-api-keys
 * Create a new public API key for a project.
 * Full key shown once in response — not stored in DB.
 * Admin only.
 */
export const createPublicApiKey = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { projectId, name } = req.body;

  if (!projectId || !name) {
    res.status(400).json({ message: "projectId and name are required." });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    res.status(400).json({ message: "Invalid projectId." });
    return;
  }

  // Deactivate any existing active key for this project
  await PublicApiKey.updateMany(
    { projectId: new mongoose.Types.ObjectId(projectId), isActive: true },
    { isActive: false, revokedAt: new Date() },
  );

  // Generate raw key, hash it
  const rawKey = generateRawKey();
  const keyHash = await bcrypt.hash(rawKey, 12);
  const keyPrefix = rawKey.slice(0, 12); // "pub_" + 8 chars

  const record = await PublicApiKey.create({
    projectId: new mongoose.Types.ObjectId(projectId),
    name,
    keyHash,
    keyPrefix,
    isActive: true,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  });

  res.status(201).json({
    message:
      "API key created. This is the only time the full key will be shown.",
    data: {
      id: record._id,
      projectId: record.projectId,
      name: record.name,
      keyPrefix: record.keyPrefix,
      fullKey: rawKey, // ONE-TIME only
      isActive: true,
      createdAt: record.createdAt,
    },
  });
};

/**
 * POST /api/admin/public-api-keys/:id/rotate
 * Rotate (replace) a public API key. Old key immediately invalidated.
 * Admin only.
 */
export const rotatePublicApiKey = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: "Invalid key ID." });
    return;
  }

  const existing = await PublicApiKey.findById(id);
  if (!existing) {
    res.status(404).json({ message: "API key not found." });
    return;
  }

  // Revoke old key
  existing.isActive = false;
  existing.revokedAt = new Date();
  await existing.save();

  // Create new key for same project
  const rawKey = generateRawKey();
  const keyHash = await bcrypt.hash(rawKey, 12);
  const keyPrefix = rawKey.slice(0, 12);

  const newRecord = await PublicApiKey.create({
    projectId: existing.projectId,
    name: existing.name,
    keyHash,
    keyPrefix,
    isActive: true,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  });

  res.status(201).json({
    message:
      "API key rotated. Old key is immediately invalidated. This is the only time the full key will be shown.",
    data: {
      id: newRecord._id,
      projectId: newRecord.projectId,
      name: newRecord.name,
      keyPrefix: newRecord.keyPrefix,
      fullKey: rawKey, // ONE-TIME only
      isActive: true,
      createdAt: newRecord.createdAt,
    },
  });
};

/**
 * GET /api/admin/public-api-keys?projectId=xxx
 * List active public API keys for a project (prefix only, never full key).
 * Admin only.
 */
export const listPublicApiKeys = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { projectId } = req.query as { projectId?: string };

  const filter: any = {};
  if (projectId) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      res.status(400).json({ message: "Invalid projectId." });
      return;
    }
    filter.projectId = new mongoose.Types.ObjectId(projectId);
  }

  const keys = await PublicApiKey.find(filter)
    .select("-keyHash") // Never return hash
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: keys });
};

/**
 * DELETE /api/admin/public-api-keys/:id
 * Revoke a public API key.
 * Admin only.
 */
export const revokePublicApiKey = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: "Invalid key ID." });
    return;
  }

  const record = await PublicApiKey.findByIdAndUpdate(
    id,
    { isActive: false, revokedAt: new Date() },
    { new: true },
  ).select("-keyHash");

  if (!record) {
    res.status(404).json({ message: "API key not found." });
    return;
  }

  res.json({ message: "API key revoked.", data: record });
};
