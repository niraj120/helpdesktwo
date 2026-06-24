import { Request, Response } from "express";
import MDMSource from "../models/MDMSource";
import { callMdmApi, pickApiForDataType } from "../services/mdmService";

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

    const { name, description, enabled, apis, auth } = req.body;
    if (name !== undefined) source.name = name.trim();
    if (description !== undefined) source.description = description;
    if (enabled !== undefined) source.enabled = enabled;
    if (Array.isArray(apis)) source.apis = apis as any;

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
    const source = await MDMSource.findByIdAndDelete(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, error: "MDM source not found" });
      return;
    }
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

    const { apiIndex, dataType } = req.body;
    let api;
    if (typeof apiIndex === "number") api = source.apis[apiIndex];
    else if (dataType) api = pickApiForDataType(source, dataType);
    else api = source.apis[0];

    if (!api) {
      res.status(400).json({ success: false, error: "No matching API to test" });
      return;
    }

    const result = await callMdmApi(api, source.getDecryptedAuth());

    source.connectionStatus = result.success ? "connected" : "error";
    source.lastConnectionTest = new Date();
    source.lastConnectionError = result.success ? "" : result.error || "";
    source.failedAttempts = result.success ? 0 : (source.failedAttempts || 0) + 1;
    await source.save();

    res.json({ success: result.success, data: result });
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
    res.json({ success: result.success, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
