import { Response } from "express";
import { PublicApiRequest } from "../../../middleware/validatePublicApiKey";
import { Project } from "../../../models/Project";
import { resolveSrConfig } from "../serviceRequestConfig";
import { ingestSmartflowWebhook } from "../callTriage";

const safeHeaders = (headers: Record<string, any>) => {
  const copy = { ...headers };
  delete copy["x-api-key"];
  delete copy["authorization"];
  delete copy["cookie"];
  return copy;
};

export const ingestSmartflow = async (
  req: PublicApiRequest,
  res: Response,
) => {
  try {
    const projectId = req.publicApiProjectId;
    if (!projectId) {
      res.status(401).json({
        success: false,
        message: "Valid X-API-Key is required.",
      });
      return;
    }

    const project = await Project.findById(projectId).select("configuration");
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found." });
      return;
    }

    const srConfig = resolveSrConfig(project);
    if (!srConfig.enabled || !srConfig.psr.enabled || !srConfig.psr.intake.ivr.enabled) {
      res.status(403).json({
        success: false,
        message: "IVR intake is not enabled for this project.",
      });
      return;
    }

    const result = await ingestSmartflowWebhook({
      projectId,
      payload: req.body || {},
      headers: safeHeaders(req.headers as Record<string, any>),
      rawBody: (req as any).rawBody,
    });

    res.status(200).json({
      success: true,
      status: result.ignored ? "ignored" : "processed",
      data: {
        ignored: result.ignored,
        reason: (result as any).reason,
        callId: (result as any).call?._id,
        logId: result.logId,
      },
    });
  } catch (error: any) {
    console.error("[public-ivr] Smartflow ingest failed:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to ingest IVR payload.",
    });
  }
};
