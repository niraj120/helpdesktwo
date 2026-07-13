import { Request, Response } from "express";
import mongoose from "mongoose";
import MDMCacheJoin from "../models/MDMCacheJoin";
import MDMCacheRecord from "../models/MDMCacheRecord";
import MDMFieldConfig from "../models/MDMFieldConfig";
import MDMSource from "../models/MDMSource";
import MDMSyncJob from "../models/MDMSyncJob";
import { User } from "../models/User";
import { callMdmApi, pickApiForDataType } from "../services/mdmService";
import {
  rebuildJoin,
  searchCachedParentDirectory,
  syncDataset,
} from "../services/mdmCacheService";
import { startMDMCacheScheduler } from "../services/mdmCacheScheduler";

/**
 * MDM Source controller — manage the company-wide master-data sources and test
 * their endpoints. Secrets are never returned to the client; instead boolean
 * "has*" flags indicate whether a secret is set.
 */

// Strip secrets from auth before sending to the client.
const maskAuth = (auth: any) => {
  const a = auth || {};
  return {
    type: a.type || "none",
    username: a.username || "",
    headerName: a.headerName || "X-API-Key",
    extraHeaders:
      a.extraHeaders instanceof Map
        ? Object.fromEntries(a.extraHeaders)
        : a.extraHeaders || {},
    hasApiKey: !!a.apiKey,
    hasToken: !!a.token,
    hasPassword: !!a.password,
  };
};

const serialize = (doc: any) => {
  const obj = doc.toObject ? doc.toObject() : doc;
  return { ...obj, auth: maskAuth(obj.auth) };
};

const normalizeStringList = (value: any) =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

const normalizeCacheConfig = (cache: any) => ({
  enabled: cache?.enabled === true,
  datasets: Array.isArray(cache?.datasets)
    ? cache.datasets
        .map((dataset: any) => ({
          key: String(dataset?.key || "").trim(),
          label: String(dataset?.label || "").trim(),
          apiIndex: Number(dataset?.apiIndex || 0),
          enabled: dataset?.enabled !== false,
          uniqueKeyField: String(dataset?.uniqueKeyField || "").trim(),
          displayField: String(dataset?.displayField || "").trim(),
          searchFields: normalizeStringList(dataset?.searchFields),
          storedFields: normalizeStringList(dataset?.storedFields),
          incremental: {
            mode: ["full", "count", "latest_id", "updated_at"].includes(
              dataset?.incremental?.mode,
            )
              ? dataset.incremental.mode
              : "full",
            countPath: String(dataset?.incremental?.countPath || "").trim(),
            latestIdField: String(
              dataset?.incremental?.latestIdField || "",
            ).trim(),
            updatedAtField: String(
              dataset?.incremental?.updatedAtField || "",
            ).trim(),
          },
          schedule: {
            enabled: dataset?.schedule?.enabled === true,
            cron: String(dataset?.schedule?.cron || "0 2 * * *").trim(),
          },
        }))
        .filter((dataset: any) => dataset.key && dataset.uniqueKeyField)
    : [],
  joins: Array.isArray(cache?.joins)
    ? cache.joins
        .map((join: any) => ({
          key: String(join?.key || "").trim(),
          label: String(join?.label || "").trim(),
          enabled: join?.enabled !== false,
          outputType: "parent_with_children",
          parentDatasetKey: String(join?.parentDatasetKey || "").trim(),
          mappingDatasetKey: String(join?.mappingDatasetKey || "").trim(),
          studentDatasetKey: String(join?.studentDatasetKey || "").trim(),
          parentKeyField: String(join?.parentKeyField || "").trim(),
          mappingParentKeyField: String(
            join?.mappingParentKeyField || "",
          ).trim(),
          mappingStudentKeyField: String(
            join?.mappingStudentKeyField || "",
          ).trim(),
          studentKeyField: String(join?.studentKeyField || "").trim(),
          parentStoredFields: normalizeStringList(join?.parentStoredFields),
          childStoredFields: normalizeStringList(join?.childStoredFields),
        }))
        .filter(
          (join: any) =>
            join.key &&
            join.parentDatasetKey &&
            join.mappingDatasetKey &&
            join.studentDatasetKey,
        )
    : [],
});

export const listMDMSources = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sources = await MDMSource.find().sort({ createdAt: -1 });
    res.json({ success: true, data: sources.map(serialize) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMDMSource = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const source = await MDMSource.findById(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }
    res.json({ success: true, data: serialize(source) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createMDMSource = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { name, description, enabled, apis, auth } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: "Name is required" });
      return;
    }
    const source = new MDMSource({
      name: name.trim(),
      description: description || "",
      enabled: enabled !== undefined ? enabled : true,
      apis: Array.isArray(apis) ? apis : [],
      auth: auth || { type: "none" },
    });
    await source.save();
    res.status(201).json({ success: true, data: serialize(source) });
  } catch (error: any) {
    if (error.code === 11000) {
      res
        .status(400)
        .json({ success: false, error: "An MDM source with that name already exists" });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateMDMSource = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const source = await MDMSource.findById(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }

    const { name, description, enabled, apis, auth, userSync } = req.body;
    if (name !== undefined) source.name = name.trim();
    if (description !== undefined) source.description = description;
    if (enabled !== undefined) source.enabled = enabled;
    if (Array.isArray(apis)) source.apis = apis as any;

    if (userSync !== undefined) {
      const cur: any = source.userSync || {};
      source.userSync = {
        enabled: userSync.enabled ?? cur.enabled ?? false,
        cron: userSync.cron ?? cur.cron ?? "0 3 * * *",
        statusField: userSync.statusField ?? cur.statusField ?? "",
        activeValues: Array.isArray(userSync.activeValues)
          ? userSync.activeValues
          : cur.activeValues || [],
        updateProfile: userSync.updateProfile ?? cur.updateProfile ?? true,
      } as any;
      source.markModified("userSync");
    }

    if (auth) {
      // Preserve existing secrets when the client sends blanks (it never
      // receives the real values, so empty means "unchanged").
      const current: any = source.auth || {};
      source.auth = {
        type: auth.type ?? current.type ?? "none",
        username: auth.username ?? current.username ?? "",
        headerName: auth.headerName ?? current.headerName ?? "X-API-Key",
        extraHeaders: auth.extraHeaders ?? current.extraHeaders ?? {},
        apiKey: auth.apiKey ? auth.apiKey : current.apiKey || "",
        token: auth.token ? auth.token : current.token || "",
        password: auth.password ? auth.password : current.password || "",
      } as any;
      source.markModified("auth");
    }

    await source.save();

    // Live-apply schedule changes without a server restart.
    if (userSync !== undefined) {
      try {
        const { refreshMDMUserSyncScheduler } = await import(
          "../services/mdmUserSyncScheduler"
        );
        await refreshMDMUserSyncScheduler();
      } catch (e) {
        console.error("[mdm-user-sync] scheduler refresh failed:", e);
      }
    }
    res.json({ success: true, data: serialize(source) });
  } catch (error: any) {
    if (error.code === 11000) {
      res
        .status(400)
        .json({ success: false, error: "An MDM source with that name already exists" });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteMDMSource = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ success: false, error: "Invalid MDM source id" });
      return;
    }

    const source = await MDMSource.findById(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }

    await Promise.all([
      MDMFieldConfig.deleteMany({ mdmSourceId: source._id }),
      MDMCacheRecord.deleteMany({ sourceId: source._id }),
      MDMCacheJoin.deleteMany({ sourceId: source._id }),
      MDMSyncJob.deleteMany({ sourceId: source._id }),
      User.updateMany(
        { mdmSourceId: source._id },
        { $unset: { mdmSourceId: "" } },
      ),
    ]);
    await source.deleteOne();

    res.json({ success: true, message: "MDM source deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Test a saved source's api (by index or dataType). */
export const testMDMSource = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const source = await MDMSource.findById(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }

    const { apiIndex, dataType, sampleLimit } = req.body;
    let api;
    if (typeof apiIndex === "number") api = source.apis[apiIndex];
    else if (dataType) api = pickApiForDataType(source, dataType);
    else api = source.apis[0];

    if (!api) {
      res.status(400).json({ success: false, error: "No matching API to test" });
      return;
    }

    const result = await callMdmApi(api, source.getDecryptedAuth(), undefined, {
      sampleLimit: Number(sampleLimit) || undefined,
    });

    source.connectionStatus = result.success ? "connected" : "error";
    source.lastConnectionTest = new Date();
    source.lastConnectionError = result.success ? "" : result.error || "";
    source.failedAttempts = result.success ? 0 : (source.failedAttempts || 0) + 1;
    await source.save();

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Test an unsaved api configuration. Accepts a single api + auth object so the
 * modal can verify a row before the source is saved. Secrets come in plaintext.
 */
export const testMDMCredentials = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { api, auth } = req.body;
    if (!api || !api.baseUrl) {
      res.status(400).json({ success: false, error: "api.baseUrl is required" });
      return;
    }
    const result = await callMdmApi(api, auth || { type: "none" });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateMDMCacheConfig = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const source = await MDMSource.findById(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }

    source.cache = normalizeCacheConfig(req.body.cache || req.body) as any;
    source.markModified("cache");
    await source.save();
    await startMDMCacheScheduler();

    res.json({ success: true, data: serialize(source) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const syncMDMDatasetNow = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const job = await syncDataset(req.params.id, req.params.datasetKey);
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const rebuildMDMJoinNow = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const job = await rebuildJoin(req.params.id, req.params.joinKey);
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listMDMSyncJobs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const jobs = await MDMSyncJob.find({ sourceId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const testMDMCacheLookup = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await searchCachedParentDirectory({
      sourceId: req.params.id,
      projectId: typeof req.query.projectId === "string" ? req.query.projectId : undefined,
      joinKey: typeof req.query.joinKey === "string" ? req.query.joinKey : undefined,
      query: typeof req.query.q === "string" ? req.query.q : "",
      limit: Number(req.query.limit) || 25,
    });

    res.json({
      success: true,
      source: result?.source
        ? { id: result.source._id, name: result.source.name }
        : null,
      data: result?.parents || [],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
