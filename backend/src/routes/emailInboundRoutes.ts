import { Router } from "express";
import multer from "multer";
import { handleSendgridInbound } from "../controllers/sendgridInboundController";
import { handleWebhookInbound } from "../controllers/webhookInboundController";

const router = Router();

// multer with memory storage — vendors may send multipart/form-data
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/email/inbound/sendgrid
 * Legacy SendGrid Inbound Parse webhook — kept for backward compatibility
 * with existing configs that have inboundMethod: "sendgrid"
 */
router.post("/inbound/sendgrid", upload.any(), handleSendgridInbound);

/**
 * POST /api/email/inbound/webhook
 * Generic vendor-agnostic webhook endpoint.
 * Field extraction is driven by ProjectEmailConfig.webhookPayloadMap
 * stored in the DB — no code changes needed to switch vendors.
 */
router.post("/inbound/webhook", upload.any(), handleWebhookInbound);

export default router;
