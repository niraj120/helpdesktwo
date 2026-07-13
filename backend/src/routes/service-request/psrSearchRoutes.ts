import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { auth } from "../../middleware/auth";
import MDMSource from "../../models/MDMSource";
import { searchCachedParentDirectory } from "../../services/mdmCacheService";

/**
 * PSR Search Routes — production search endpoint for the PSR create-form
 * parent/student lookup. Uses the pre-built MDMCacheJoin collection for
 * sub-100ms query latency.
 *
 * Endpoint: GET /api/service-requests/psr/search
 * Auth: session-based (auth middleware)
 *
 * Query params:
 *   q          — search query string (required)
 *   projectId  — project scope (required)
 *   sourceId   — explicit MDM source to search (optional; first eligible if omitted)
 *   joinKey    — explicit join config key (optional; first enabled join if omitted)
 *   limit      — max results to return, 1-100, default 25
 *
 * Response:
 *   { success: true, data: [ { externalId, name, parentCode, children: [...] } ] }
 */

const router = Router();

router.use(auth);

router.get("/psr/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, projectId, sourceId, joinKey } = req.query;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 25, 100));
    const query = typeof q === "string" ? q.trim() : "";
    const pid = typeof projectId === "string" ? projectId.trim() : "";
    const sid = typeof sourceId === "string" ? sourceId.trim() : "";
    const jk = typeof joinKey === "string" ? joinKey.trim() : "";

    if (!pid) {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }

    // Resolve the MDM source to search.
    // If sourceId is given use it directly. Otherwise find the first enabled source
    // that has cache enabled and at least one enabled join.
    let resolvedSourceId = sid;
    if (!resolvedSourceId) {
      const firstSource = await MDMSource.findOne({
        enabled: true,
        "cache.enabled": true,
        "cache.joins": { $elemMatch: { enabled: true } },
      })
        .select("_id")
        .lean();
      if (!firstSource) {
        res.json({ success: true, data: [] });
        return;
      }
      resolvedSourceId = String((firstSource as any)._id);
    }

    if (!mongoose.Types.ObjectId.isValid(resolvedSourceId)) {
      res.status(400).json({ success: false, error: "Invalid sourceId" });
      return;
    }

    const result = await searchCachedParentDirectory({
      sourceId: resolvedSourceId,
      projectId: pid || undefined,
      joinKey: jk || undefined,
      query,
      limit,
    });

    if (!result) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }

    res.json({
      success: true,
      source: result.source
        ? { id: (result.source as any)._id, name: (result.source as any).name }
        : null,
      data: result.parents || [],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/service-requests/psr/sources
 * Returns available MDM sources that have cache enabled. Used by the admin
 * PSR lookup config panel to populate the source dropdown.
 */
router.get("/psr/sources", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sources = await MDMSource.find({
      enabled: true,
      "cache.enabled": true,
    })
      .select("_id name description cache.joins")
      .lean();

    const formatted = sources.map((source: any) => ({
      id: source._id,
      name: source.name,
      description: source.description || "",
      joins: (source.cache?.joins || [])
        .filter((join: any) => join.enabled !== false)
        .map((join: any) => ({ key: join.key, label: join.label || join.key })),
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
