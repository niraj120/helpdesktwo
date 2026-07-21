import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { TataVoiceConfig } from "../models/TataVoiceConfig";

/**
 * Per-project TATA SmartFlo voice (Click-to-Call) credential management.
 * GET returns config with the token MASKED (never the decrypted JWT). PUT
 * upserts; an empty/omitted token on PUT preserves the stored one.
 */

const DEFAULT_BASE_URL =
  process.env.TATA_SMARTFLO_BASE_URL ||
  "https://api-smartflo.tatateleservices.com/v1";

/** Shape a config doc for the client without exposing the token. */
const present = (doc: any) => ({
  projectId: doc?.projectId,
  baseUrl: doc?.baseUrl || DEFAULT_BASE_URL,
  defaultCallerId: doc?.defaultCallerId || "",
  callTimeoutSeconds: doc?.callTimeoutSeconds ?? null,
  isActive: doc?.isActive ?? true,
  hasToken: !!doc?.apiToken,
  updatedAt: doc?.updatedAt,
});

export const getTataVoiceConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await TataVoiceConfig.findOne({ projectId: id });
    if (!doc) {
      return res.json({
        success: true,
        data: {
          projectId: id,
          baseUrl: DEFAULT_BASE_URL,
          defaultCallerId: "",
          callTimeoutSeconds: null,
          isActive: false,
          hasToken: false,
        },
      });
    }
    return res.json({ success: true, data: present(doc) });
  } catch (err) {
    console.error("[tata-voice] get error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load config" });
  }
};

export const updateTataVoiceConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { apiToken, baseUrl, defaultCallerId, callTimeoutSeconds, isActive } =
      req.body || {};

    let doc = await TataVoiceConfig.findOne({ projectId: id });
    if (!doc) {
      doc = new TataVoiceConfig({
        projectId: id,
        baseUrl: baseUrl || DEFAULT_BASE_URL,
        // Placeholder; overwritten below if a real token was supplied.
        apiToken: "",
        createdBy: req.user?.userId as any,
      });
    }

    if (typeof baseUrl === "string" && baseUrl.trim())
      doc.baseUrl = baseUrl.trim();
    if (typeof defaultCallerId === "string")
      doc.defaultCallerId = defaultCallerId.trim();
    if (callTimeoutSeconds === null || callTimeoutSeconds === undefined) {
      // leave unchanged
    } else {
      const t = Number(callTimeoutSeconds);
      doc.callTimeoutSeconds = Number.isFinite(t) && t > 0 ? t : undefined;
    }
    if (typeof isActive === "boolean") doc.isActive = isActive;

    // Only overwrite the token when a non-empty value is supplied, so saving
    // other fields doesn't wipe the stored JWT. The model's pre-save hook
    // encrypts it.
    if (typeof apiToken === "string" && apiToken.trim()) {
      doc.apiToken = apiToken.trim();
    } else if (!doc.apiToken) {
      return res
        .status(400)
        .json({ success: false, message: "API token is required" });
    }

    doc.updatedBy = req.user?.userId as any;
    await doc.save();

    return res.json({ success: true, data: present(doc) });
  } catch (err) {
    console.error("[tata-voice] update error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save config" });
  }
};
