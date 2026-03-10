import { Router } from "express";
import multer from "multer";
import { handleSendgridInbound } from "../controllers/sendgridInboundController";

const router = Router();

// multer with memory storage — SendGrid sends email parts + attachments as multipart
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/email/inbound/sendgrid
 * SendGrid Inbound Parse webhook (public — auth handled by SendGrid IP ranges)
 */
router.post("/inbound/sendgrid", upload.any(), handleSendgridInbound);

export default router;
