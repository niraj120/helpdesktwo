import { Request, Response } from "express";
import axios from "axios";
import mongoose from "mongoose";
import { AttendanceConfig } from "../models/attendance/AttendanceConfig";
import { AttendanceSyncLog } from "../models/attendance/AttendanceSyncLog";
import { runAttendanceSync } from "../services/attendanceSyncService";
import { attendanceScheduler } from "../services/attendanceScheduler";
import { encrypt, isEncrypted } from "../utils/encryption";

const MASKED_TOKEN = "••••••";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/config?projectId=
// ─────────────────────────────────────────────────────────────────────────────
export const getAttendanceConfig = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    let config = await AttendanceConfig.findOneAndUpdate(
      { projectId },
      { $setOnInsert: { projectId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Never expose raw or encrypted token
    const safeConfig = config.toObject() as Record<string, unknown>;
    safeConfig.apiKeyEncrypted = config.apiKeyEncrypted ? MASKED_TOKEN : "";
    // Mask legacy plain-text apiKey field (old documents stored it here)
    if (safeConfig.apiKey) {
      safeConfig.apiKey = MASKED_TOKEN;
    }

    res.json(safeConfig);
  } catch (err) {
    console.error("[AttendanceConfig] getAttendanceConfig error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/attendance/config
// Body: partial AttendanceConfig fields. Token handling:
//   - If body.apiKey === MASKED_TOKEN → keep existing encrypted value
//   - If body.apiKey is a real value   → encrypt and store
//   - If body.apiKey is omitted        → no change
// ─────────────────────────────────────────────────────────────────────────────
export const updateAttendanceConfig = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      projectId,
      apiKey, // incoming plain token from frontend (or masked placeholder)
      ...rest
    } = req.body;

    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    let config = await AttendanceConfig.findOne({ projectId });
    if (!config) {
      config = new AttendanceConfig({ projectId });
    }

    // Apply non-token fields
    const allowedFields = [
      "aftBaseUrl",
      "aftProjectPrefix",
      "syncActive",
      "syncSchedule",
      "publishedCheckEnabled",
      "syncLookbackDays",
      "commonIdentifier",
      "displayFields",
      "fieldPermissions",
    ];

    for (const field of allowedFields) {
      if (rest[field] !== undefined) {
        (config as unknown as Record<string, unknown>)[field] = rest[field];
      }
    }

    // Handle token
    if (apiKey !== undefined && apiKey !== MASKED_TOKEN && apiKey !== "") {
      try {
        config.apiKeyEncrypted = encrypt(apiKey);
      } catch {
        // ENCRYPTION_KEY not configured — store plain text (pre-save hook will warn)
        config.apiKeyEncrypted = apiKey;
      }
    } else if (
      apiKey === undefined &&
      !config.apiKeyEncrypted &&
      (config as unknown as Record<string, unknown>).apiKey
    ) {
      // Migrate legacy plain-text apiKey field into apiKeyEncrypted
      const legacyKey = (config as unknown as Record<string, unknown>)
        .apiKey as string;
      try {
        config.apiKeyEncrypted = encrypt(legacyKey);
      } catch {
        config.apiKeyEncrypted = legacyKey;
      }
    }
    // If apiKey === MASKED_TOKEN or undefined → leave existing encrypted value

    await config.save();

    // Rebuild cron schedule if syncSchedule or syncActive changed
    if (rest.syncSchedule !== undefined || rest.syncActive !== undefined) {
      await attendanceScheduler.rebuildProjectSchedule(projectId);
    }

    const safeConfig = config.toObject() as Record<string, unknown>;
    safeConfig.apiKeyEncrypted = config.apiKeyEncrypted ? MASKED_TOKEN : "";
    // Mask legacy plain-text apiKey field too
    if (safeConfig.apiKey) {
      safeConfig.apiKey = MASKED_TOKEN;
    }

    res.json({ message: "Attendance config updated", config: safeConfig });
  } catch (err) {
    console.error("[AttendanceConfig] updateAttendanceConfig error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/config/test-connection
// Body: { projectId, aftBaseUrl?, aftProjectPrefix?, apiKey? }
// If aftBaseUrl/aftProjectPrefix/apiKey are supplied they are used directly
// (allows testing before saving).  Falls back to the saved DB config when omitted.
// ─────────────────────────────────────────────────────────────────────────────
export const testAttendanceConnection = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      projectId,
      aftBaseUrl: bodyBase,
      aftProjectPrefix: bodyPrefix,
      apiKey: bodyKey,
    } = req.body;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    // Resolve credentials: prefer values sent in the body (test-before-save),
    // fall back to whatever is persisted in the DB.
    let resolvedBase = bodyBase as string | undefined;
    let resolvedPrefix = bodyPrefix as string | undefined;
    let resolvedToken = bodyKey as string | undefined;

    if (!resolvedBase || !resolvedPrefix || !resolvedToken) {
      const config = await AttendanceConfig.findOne({ projectId });
      if (!config || !config.apiKeyEncrypted) {
        res
          .status(400)
          .json({ message: "No API credentials configured for this project" });
        return;
      }
      resolvedBase = resolvedBase || config.aftBaseUrl;
      resolvedPrefix = resolvedPrefix || config.aftProjectPrefix;
      resolvedToken = resolvedToken || config.getDecryptedApiKey();
    }

    const token = resolvedToken;
    const aftUrl = `${resolvedBase}/${resolvedPrefix}/get-attendance`;

    // Use last 30 days as date range for test connection
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

    const response = await axios.post(
      aftUrl,
      { from_date: fmt(fromDate), to_date: fmt(toDate) },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    if (
      response.data?.status === "success" &&
      Array.isArray(response.data?.data)
    ) {
      res.json({
        status: "success",
        recordCount: response.data.data.length,
        sampleRecord: response.data.data[0] ?? null,
      });
    } else {
      res.json({
        status: "failed",
        error: response.data?.message || "AFT returned unexpected response",
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    res.json({ status: "failed", error: message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/sync/run
// Body: { projectId }
// Starts an async sync; returns syncLogId immediately.
// ─────────────────────────────────────────────────────────────────────────────
export const triggerManualSync = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.body;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    // Create the sync log stub first so we can return its ID immediately
    const syncLog = await AttendanceSyncLog.create({
      projectId: new mongoose.Types.ObjectId(projectId as string),
      triggeredBy: "MANUAL" as const,
      startedAt: new Date(),
      status: "RUNNING",
    });

    // Respond before the async work starts so the client gets the syncLogId right away
    res.json({
      message: "Sync started",
      projectId,
      syncLogId: syncLog._id.toString(),
    });

    // Kick off async — pass the pre-created log ID to avoid a duplicate log
    runAttendanceSync(projectId, "MANUAL", syncLog._id.toString()).catch(
      (err) => {
        console.error(
          `[AttendanceSync] Manual sync failed for ${projectId}:`,
          err,
        );
      },
    );
  } catch (err) {
    console.error("[AttendanceConfig] triggerManualSync error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/sync/logs?projectId=&page=&limit=
// ─────────────────────────────────────────────────────────────────────────────
export const getSyncLogs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 30),
    );

    const [logs, total] = await Promise.all([
      AttendanceSyncLog.find({ projectId })
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AttendanceSyncLog.countDocuments({ projectId }),
    ]);

    res.json({
      data: logs,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[AttendanceConfig] getSyncLogs error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/sync/logs/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getSyncLogById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const log = await AttendanceSyncLog.findById(req.params.id).lean();
    if (!log) {
      res.status(404).json({ message: "Sync log not found" });
      return;
    }
    res.json(log);
  } catch (err) {
    console.error("[AttendanceConfig] getSyncLogById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
