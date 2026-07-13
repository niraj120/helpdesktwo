import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validatePublicApiKey } from "../../../middleware/validatePublicApiKey";
import { ingestSmartflow } from "../controllers/publicIvrController";

const router = Router();

const webhookLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.headers["x-api-key"] as string) || req.ip || "unknown",
  message: {
    success: false,
    message: "Too many IVR webhook requests. Please slow down.",
  },
});

router.post("/ingest", webhookLimit, validatePublicApiKey, ingestSmartflow);

export default router;
