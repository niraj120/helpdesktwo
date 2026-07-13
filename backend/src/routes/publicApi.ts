import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { validatePublicApiKey } from "../middleware/validatePublicApiKey";
import { resolveSelfServiceAuth } from "../middleware/selfServiceAuth";
import {
  lookupUser,
  createPublicTicket,
  getFormSchema,
  createLmsFormTicket,
  findNearestCentres,
  getTicketCount,
  searchTickets,
  getTicketByNumber,
  createPublicUser,
  createPublicCenter,
} from "../controllers/publicApiController";
import {
  getSelfServiceFormSchema,
  createSelfServiceSr,
  listMySelfServiceSr,
  listParentStudents,
  getMySrDetail,
  replyToMySr,
  createParentSession,
} from "../controllers/publicServiceRequestController";

// Multer instance (memory storage) used only for the LMS form endpoint
const lmsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "video/mp4",
      "video/quicktime",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed.`));
    }
  },
});

const router = Router();

// Rate limiter keyed on the API key so limits are per-consumer, not per IP
const makeRateLimit = (max: number) =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      (req.headers["x-api-key"] as string) || req.ip || "unknown",
    message: {
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please slow down.",
    },
  });

// GET /v1/users/lookup — 60 req/min
router.get(
  "/users/lookup",
  makeRateLimit(60),
  validatePublicApiKey,
  lookupUser,
);

// POST /v1/tickets — 30 req/min
router.post(
  "/tickets",
  makeRateLimit(30),
  validatePublicApiKey,
  createPublicTicket,
);

// GET /v1/tickets/form-schema — returns custom fields schema for this project
router.get(
  "/tickets/form-schema",
  makeRateLimit(60),
  validatePublicApiKey,
  getFormSchema,
);

// POST /v1/tickets/lms-form — 20 req/min
// Accepts multipart/form-data from an external LMS "raise ticket" form.
// Fields: name, email, category, grade, subject, dayNumber, issueDescription
//         attachment (optional file: image/pdf/video, max 10 MB)
// Auth:   X-API-Key + X-Project-ID headers
router.post(
  "/tickets/lms-form",
  makeRateLimit(20),
  validatePublicApiKey,
  lmsUpload.single("attachment"),
  createLmsFormTicket,
);

// ── Parent self-service Service Requests ────────────────────────────────────
// POST /v1/service-requests/session — mint a short-lived parent session token.
// Server-to-server ONLY (pub_ key); the browser then uses the token, not the key.
router.post(
  "/service-requests/session",
  makeRateLimit(60),
  validatePublicApiKey,
  createParentSession,
);
// The rest accept EITHER a pub_ key (server) OR a parent session token (browser).
// GET /v1/service-requests/form-schema — the self-service PSR form (60 req/min)
router.get(
  "/service-requests/form-schema",
  makeRateLimit(60),
  resolveSelfServiceAuth,
  getSelfServiceFormSchema,
);
// GET /v1/service-requests/students — parent's children by mobile (60 req/min)
router.get(
  "/service-requests/students",
  makeRateLimit(60),
  resolveSelfServiceAuth,
  listParentStudents,
);
// POST /v1/service-requests — raise a PSR (30 req/min)
router.post(
  "/service-requests",
  makeRateLimit(30),
  resolveSelfServiceAuth,
  createSelfServiceSr,
);
// GET /v1/service-requests/mine — the parent's own PSRs (60 req/min)
router.get(
  "/service-requests/mine",
  makeRateLimit(60),
  resolveSelfServiceAuth,
  listMySelfServiceSr,
);
// POST /v1/service-requests/:ticketNumber/reply — parent reply (30 req/min)
router.post(
  "/service-requests/:ticketNumber/reply",
  makeRateLimit(30),
  resolveSelfServiceAuth,
  replyToMySr,
);
// GET /v1/service-requests/:ticketNumber — one request + thread (60 req/min)
// Registered AFTER the literal routes so it doesn't shadow them.
router.get(
  "/service-requests/:ticketNumber",
  makeRateLimit(60),
  resolveSelfServiceAuth,
  getMySrDetail,
);

// POST /v1/centers/nearest — 60 req/min
router.post(
  "/centers/nearest",
  makeRateLimit(60),
  validatePublicApiKey,
  findNearestCentres,
);

// GET /v1/tickets/count — 60 req/min
router.get(
  "/tickets/count",
  makeRateLimit(60),
  validatePublicApiKey,
  getTicketCount,
);

// GET /v1/tickets/search — 30 req/min
router.get(
  "/tickets/search",
  makeRateLimit(30),
  validatePublicApiKey,
  searchTickets,
);

// GET /v1/tickets/by-number/:ticketNumber — 60 req/min
router.get(
  "/tickets/by-number/:ticketNumber",
  makeRateLimit(60),
  validatePublicApiKey,
  getTicketByNumber,
);

// POST /v1/users — 30 req/min
router.post(
  "/users",
  makeRateLimit(30),
  validatePublicApiKey,
  createPublicUser,
);

// POST /v1/centers — 20 req/min
router.post(
  "/centers",
  makeRateLimit(20),
  validatePublicApiKey,
  createPublicCenter,
);

export default router;
