import { Response } from "express";
import mongoose from "mongoose";
import PipelineConfig from "../../models/psr/PipelineConfig";
import SyncRun from "../../models/psr/SyncRun";
import { testSource } from "../../services/psr/sourceTestService";
import { runPipeline } from "../../services/psr/pipelineEngine";
import { enqueuePipelineRun } from "../../services/psr/pipelineQueue";
import { AuthRequest } from "../../middleware/auth";

// ---------------------------------------------------------------------------
// PSR Pipeline Controller
// Handles all admin-facing pipeline CRUD, source test/discover, dry-run,
// run-now, and the generic search endpoint.
// ---------------------------------------------------------------------------

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function fail(res: Response, message: string, statusCode = 400) {
  return res.status(statusCode).json({ success: false, error: message });
}

function isValidObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

// System collection denylist (lowercase) — prevents overwriting core data
const SYSTEM_COLLECTIONS = new Set([
  "users",
  "roles",
  "permissions",
  "projects",
  "tickets",
  "categories",
  "statuses",
  "priorities",
  "mdmsources",
  "mdmcacherecords",
  "mdmcachejoins",
  "mdmsyncjobs",
  "psrpipelineconfigs",
  "psrsyncruns",
]);

// ─── Pipeline CRUD ───────────────────────────────────────────────────────────

/** GET /api/psr/pipelines */
export async function listPipelines(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const pipelines = await PipelineConfig.find()
      .sort({ createdAt: -1 })
      .select("-steps -sources.auth.secretRef") // never expose secret refs in list
      .lean();
    ok(res, pipelines);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

/** GET /api/psr/pipelines/:id */
export async function getPipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }
    const pipeline = await PipelineConfig.findById(id).lean();
    if (!pipeline) {
      fail(res, "Pipeline not found", 404);
      return;
    }
    // Strip secret refs from response
    const safe = JSON.parse(JSON.stringify(pipeline));
    safe.sources?.forEach((s: any) => {
      if (s.auth) s.auth.secretRef = undefined;
    });
    ok(res, safe);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

/** POST /api/psr/pipelines */
export async function createPipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { name, targetCollection } = req.body;
    if (!name?.trim()) {
      fail(res, "name is required");
      return;
    }
    if (!targetCollection?.trim()) {
      fail(res, "targetCollection is required");
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(targetCollection.trim())) {
      fail(res, "targetCollection must match ^[a-zA-Z][a-zA-Z0-9_]*$");
      return;
    }
    if (SYSTEM_COLLECTIONS.has(targetCollection.trim().toLowerCase())) {
      fail(
        res,
        `targetCollection "${targetCollection}" is a reserved system collection`,
      );
      return;
    }
    const existing = await PipelineConfig.findOne({
      targetCollection: targetCollection.trim(),
    });
    if (existing) {
      fail(
        res,
        `targetCollection "${targetCollection}" is already used by pipeline "${existing.name}"`,
      );
      return;
    }
    const pipeline = await PipelineConfig.create({
      name: name.trim(),
      targetCollection: targetCollection.trim(),
      sources: [],
      steps: [],
    });
    ok(res, pipeline, 201);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

/** PUT /api/psr/pipelines/:id */
export async function updatePipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }

    const {
      name,
      targetCollection,
      sources,
      steps,
      output,
      schedule,
      enabled,
    } = req.body;

    // Validate targetCollection uniqueness (allow same pipeline)
    if (targetCollection) {
      if (SYSTEM_COLLECTIONS.has(targetCollection.toLowerCase())) {
        fail(res, `targetCollection "${targetCollection}" is reserved`);
        return;
      }
      const clash = await PipelineConfig.findOne({
        targetCollection,
        _id: { $ne: id },
      });
      if (clash) {
        fail(
          res,
          `targetCollection is already used by pipeline "${clash.name}"`,
        );
        return;
      }
    }

    // Source key uniqueness within pipeline
    if (sources) {
      const keys = (sources as any[]).map((s: any) => s.key);
      if (new Set(keys).size !== keys.length) {
        fail(res, "Source keys must be unique within a pipeline");
        return;
      }
      const badKey = keys.find((k: string) => !/^[a-z][a-z0-9_]*$/.test(k));
      if (badKey) {
        fail(
          res,
          `Source key "${badKey}" is invalid — must match ^[a-z][a-z0-9_]*$`,
        );
        return;
      }
    }

    // Validate exactly one root step if steps are provided
    if (steps) {
      const rootCount = (steps as any[]).filter(
        (s: any) => s.op === "root",
      ).length;
      if (rootCount > 1) {
        fail(res, "A pipeline can only have one root step");
        return;
      }
    }

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (targetCollection !== undefined)
      update.targetCollection = targetCollection;
    if (sources !== undefined) update.sources = sources;
    if (steps !== undefined) update.steps = steps;
    if (output !== undefined) update.output = output;
    if (schedule !== undefined) update.schedule = schedule;
    if (enabled !== undefined) update.enabled = enabled;

    const pipeline = await PipelineConfig.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!pipeline) {
      fail(res, "Pipeline not found", 404);
      return;
    }

    const safe = JSON.parse(JSON.stringify(pipeline.toObject()));
    safe.sources?.forEach((s: any) => {
      if (s.auth) s.auth.secretRef = undefined;
    });
    ok(res, safe);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

/** DELETE /api/psr/pipelines/:id */
export async function deletePipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }
    const pipeline = await PipelineConfig.findByIdAndDelete(id);
    if (!pipeline) {
      fail(res, "Pipeline not found", 404);
      return;
    }
    ok(res, { deleted: true, id });
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

/** POST /api/psr/pipelines/:id/clone (US-2.1) */
export async function clonePipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }
    const original = await PipelineConfig.findById(id).lean();
    if (!original) {
      fail(res, "Pipeline not found", 404);
      return;
    }

    const { name, targetCollection } = req.body;
    if (!name?.trim()) {
      fail(res, "name is required for clone");
      return;
    }
    if (!targetCollection?.trim()) {
      fail(res, "targetCollection is required for clone");
      return;
    }

    const clone = await PipelineConfig.create({
      ...original,
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      targetCollection: targetCollection.trim(),
      enabled: false,
      isRunnable: false,
      lastSyncedAt: undefined,
      lastSyncedCount: undefined,
    });
    ok(res, clone, 201);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

// ─── Source Test & Discover (US-1.3) ─────────────────────────────────────────

/** POST /api/psr/sources/test */
export async function testSourceHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const source = req.body?.source;
    if (!source?.baseUrl) {
      fail(res, "source.baseUrl is required");
      return;
    }

    const result = await testSource(source);
    // Always 200 — the test result itself carries success/httpStatus/error.
    // A 4xx here would cause the frontend's fetch wrapper to discard the result data.
    ok(res, result, 200);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

// ─── Dry Run (US-2.8) ─────────────────────────────────────────────────────────

/** POST /api/psr/pipelines/:id/dry-run */
export async function dryRunPipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }

    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
    const runId = await runPipeline(id, {
      mode: "dry-run",
      dryRunLimit: limit,
      triggeredBy: "manual",
    });
    const run = await SyncRun.findById(runId).lean();
    ok(res, run);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

// ─── Manual Run (US-3.7) ─────────────────────────────────────────────────────

/** POST /api/psr/pipelines/:id/run */
export async function triggerRun(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }

    const mode = (req.query.mode as string) || "full";
    if (!["incremental", "full"].includes(mode)) {
      fail(res, "mode must be 'incremental' or 'full'");
      return;
    }

    const cfg = await PipelineConfig.findById(id)
      .select("name targetCollection isRunnable")
      .lean();
    if (!cfg) {
      fail(res, "Pipeline not found", 404);
      return;
    }
    if (!(cfg as any).isRunnable) {
      fail(
        res,
        "Pipeline is not runnable — add a root step and set a keyField first",
        422,
      );
      return;
    }

    // Block if already active (mutex — US-3.5)
    const active = await SyncRun.findOne({
      pipelineId: id,
      status: { $in: ["pending", "running"] },
    });
    if (active) {
      fail(res, "A run is already active for this pipeline", 409);
      return;
    }

    // Try BullMQ queue first (US-3.5); fall back to direct engine if Redis unavailable
    const jobId = await enqueuePipelineRun({
      pipelineId: id,
      mode: mode as "full" | "incremental",
      triggeredBy: "manual",
    });

    if (jobId) {
      ok(res, { queued: true, jobId, mode, status: "pending" }, 202);
    } else {
      // Redis unavailable — run directly in background (degraded mode)
      const runRecord = await SyncRun.create({
        pipelineId: id,
        pipelineName: (cfg as any).name,
        targetCollection: (cfg as any).targetCollection,
        mode,
        status: "pending",
        startedAt: new Date(),
        triggeredBy: "manual",
      });
      runPipeline(id, {
        mode: mode as "full" | "incremental",
        triggeredBy: "manual",
      }).catch((err) => {
        SyncRun.findByIdAndUpdate(runRecord._id, {
          status: "failed",
          completedAt: new Date(),
          errorSummary: String(err?.message || err).slice(0, 500),
        }).catch(() => {});
      });
      ok(
        res,
        {
          queued: false,
          runId: String(runRecord._id),
          mode,
          status: "pending",
          note: "Redis unavailable — running directly",
        },
        202,
      );
    }
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

// ─── Run History (US-5.1) ─────────────────────────────────────────────────────

/** GET /api/psr/pipelines/:id/runs */
export async function listRuns(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      fail(res, "Invalid pipeline id");
      return;
    }
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const runs = await SyncRun.find({ pipelineId: id })
      .sort({ startedAt: -1 })
      .limit(limit)
      .select("-dryRunSample") // keep list payload small
      .lean();
    ok(res, runs);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

/** GET /api/psr/runs/:runId */
export async function getRun(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { runId } = req.params;
    if (!isValidObjectId(runId)) {
      fail(res, "Invalid run id");
      return;
    }
    const run = await SyncRun.findById(runId).lean();
    if (!run) {
      fail(res, "Run not found", 404);
      return;
    }
    ok(res, run);
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}

// ─── Generic Search (US-4.1) ─────────────────────────────────────────────────

/** GET /api/psr/search?pipeline=:id&q=:term&limit=25&offset=0 */
export async function searchPipeline(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { pipeline: pipelineId, q } = req.query;
    const query = typeof q === "string" ? q.trim() : "";
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    if (!pipelineId || typeof pipelineId !== "string") {
      fail(res, "pipeline query param is required");
      return;
    }
    if (!isValidObjectId(pipelineId)) {
      fail(res, "Invalid pipeline id");
      return;
    }

    const cfg = await PipelineConfig.findById(pipelineId)
      .select("targetCollection output")
      .lean();
    if (!cfg) {
      fail(res, "Pipeline not found", 404);
      return;
    }

    const searchIndexes = cfg.output?.searchIndexes || [];
    if (!searchIndexes.length) {
      ok(res, { results: [], total: 0 });
      return;
    }

    // Build query against only declared search index fields (field allowlist)
    const col = mongoose.connection.collection(cfg.targetCollection);
    const hasTextIndex = searchIndexes.some((si) => si.type === "text");

    let mongoQuery: Record<string, unknown> = {};
    if (query) {
      if (hasTextIndex) {
        mongoQuery = { $text: { $search: query } };
      } else {
        const plainFields = searchIndexes
          .filter((si) => si.type === "plain")
          .map((si) => si.field);
        const regexQuery = new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i",
        );
        mongoQuery = {
          $or: plainFields.map((f) => ({ [f]: { $regex: regexQuery } })),
        };
      }
    }

    const [results, total] = await Promise.all([
      col
        .find(mongoQuery, { projection: { _id: 0, _source: 0 } })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col.countDocuments(mongoQuery),
    ]);

    ok(res, { results, total, limit, offset });
  } catch (err: any) {
    fail(res, err.message, 500);
  }
}
