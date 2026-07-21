// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
// Rate limiting removed to prevent 429 errors
// import rateLimit from 'express-rate-limit';
import { createServer } from "http";
import { Server } from "socket.io";

// Register the global audit plugin BEFORE any model compiles, so every schema
// is audited automatically (mongoose.plugin only affects later-created schemas).
import "./bootstrap/auditBootstrap";

// Import all models FIRST to ensure they're registered before controllers use them
import "./models/Category";
import "./models/HierarchyConfig";
import "./models/Ticket";
import "./models/User";
import "./models/Role";
import "./models/Permission";
import "./models/Project";
import "./models/Status";
import "./models/Center";
import "./models/PublicApiKey";
import "./models/IvrIngestLog";
import "./models/Asset";
import "./models/CenterAssetMapping";
import "./models/FeedbackForm";
import "./models/FeedbackResponse";
import "./models/KBCategory";
import "./models/KBSubcategory";
import "./models/KnowledgeBaseArticle";
import "./models/MasterData";
import "./models/MDMSource";
import "./models/MDMCacheRecord";
import "./models/MDMCacheJoin";
import "./models/MDMSyncJob";
import "./models/psr/PipelineConfig"; // PSR Pipeline system
import "./models/psr/SyncRun"; // PSR Sync run logs
import "./models/psr/PsrMaster";      // PSR Builder — master
import "./models/psr/PsrTable";       // PSR Builder — table
import "./models/EmailLog";
import "./models/EmailConfig";
import "./models/FAQ";
import "./models/PushSubscription";
// UserReportingHierarchy model removed - using User.reportingManager field directly
import "./models/UserDashboardConfig";
import "./models/dashboard/WidgetDefinition";
import "./models/dashboard/DashboardTemplate";
import "./models/dashboard/DashboardWidget";
import "./models/dashboard/DashboardAssignment";
import "./models/dashboard/UserDashboardPreference";
import "./models/dashboard/UserTarget";
import "./models/dashboard/DashScheduledReport";
import "./models/dashboard/DashThresholdAlert";
import "./models/Notification";
import "./models/NotificationSetting";
import "./models/UserNotificationPreference";

import { connectDB } from "./config/database";
import { ensureWebPushConfiguredAsync } from "./services/webPushService";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { auditContext } from "./middleware/auditContext";
import authRoutes from "./routes/auth";
import projectAuthRoutes from "./routes/projectAuth";
import studentAuthRoutes from "./routes/studentAuth";
import keycloakAuthRoutes from "./routes/keycloakAuth";
import userRoutes from "./routes/users";
import ticketRoutes from "./routes/tickets";
import serviceRequestRoutes from "./modules/service-request/routes/serviceRequest";
import clusterRoutes from "./modules/service-request/routes/clusters";
import emailIntakeRoutes from "./modules/service-request/routes/emailIntake";
import leadRoutes from "./modules/service-request/routes/leads";
import ivrRoutes from "./modules/service-request/routes/ivr";
import publicIvrRoutes from "./modules/service-request/routes/publicIvr";
import ivrAgentRoutes from "./modules/service-request/routes/ivrAgents";
import roleMappingRoutes from "./modules/service-request/routes/roleMappingRules";
import eulaRoutes from "./routes/eula";
import projectRoutes from "./routes/projects";
import roleRoutes from "./routes/roleRoutes";
import permissionRoutes from "./routes/permissionRoutes";
import masterRoutes from "./routes/masterRoutes"; // Country, State, City routes (consolidated)
import mdmRoutes from "./routes/mdmRoutes"; // MDM (Master Data Management) sources
import mdmUserSyncRoutes from "./routes/mdmUserSync"; // MDM → User refresh (active/inactive + profile)
import psrSearchRoutes from "./routes/service-request/psrSearchRoutes"; // PSR search (production endpoint)
import psrPipelineRoutes from "./routes/psr/psrPipelineRoutes"; // PSR Pipeline system (new)
import psrBuilderRoutes from "./routes/psr/psrBuilderRoutes";   // PSR Builder (simple UI layer)
import { initPsrQueue } from "./services/psr/pipelineQueue"; // PSR BullMQ queue
import { startPsrWorker, stopPsrWorker } from "./services/psr/pipelineWorker"; // PSR worker
import { startStalenessWatchdog, stopStalenessWatchdog } from "./services/psr/stalenessWatchdog"; // PSR US-5.2
import { startPsrTableScheduler, stopPsrTableScheduler } from "./services/psr/psrTableScheduler"; // PSR table sync
import categoryRoutes from "./routes/categories";
import hierarchyConfigRoutes from "./routes/hierarchyConfig";
import statusRoutes from "./routes/statuses";
import assetCategoryRoutes from "./routes/assetCategories";
import departmentRoutes from "./routes/departments";
// import { ticketFieldRoutes, autoAssignmentRoutes } from './routes/ticket-module'; // TODO: Implement
import slaRuleRoutes from "./routes/sla-module/slaRuleRoutes";
import escalationPolicyRoutes from "./routes/sla-module/escalationPolicyRoutes";
import { escalationMatrixRoutes } from "./routes/escalation-matrix";
import priorityRoutes from "./routes/priorityRoutes";
import workingCalendarRoutes from "./routes/workingCalendar";
import activityLogRoutes from "./routes/activityLogs";
import accessLogRoutes from "./routes/accessLogs";
import knowledgeBaseRoutes from "./routes/knowledgeBase";
import kbLevelsRoutes from "./routes/kbLevels";
import kbArticlesRoutes from "./routes/kbArticles";
import kbTablesRoutes from "./routes/kbTables";
import kbPublicRoutes from "./routes/kbPublic";
import uploadRoutes from "./routes/upload";
import faqRoutes from "./routes/faqRoutes";
import approvalRoutes from "./routes/approvals";
import approvalMasterRoutes from "./routes/approvalMasters";
import offlineModuleRoutes from "./routes/offlineModule";
import dashboardRoutes from "./routes/dashboard";
import adminDashboardRoutes from "./routes/adminDashboardRoutes";
import meDashboardRoutes from "./routes/meDashboardRoutes";
import widgetDataRoutes from "./routes/widgetDataRoutes";
import personalDashboardRoutes from "./routes/personalDashboardRoutes";
import usageAnalyticsRoutes from "./routes/usageAnalyticsRoutes";
import { startAggregationScheduler } from "./services/dashboardAggregationService";
import { startReportScheduler } from "./services/dashboard/reportScheduler";
import { startReportAlertScheduler } from "./services/reports/reportAlertScheduler";
import { startAttendanceAlertScheduler } from "./services/reports/attendanceAlertScheduler";
import { startMDMCacheScheduler } from "./services/mdmCacheScheduler";
import { mdmUserSyncScheduler } from "./services/mdmUserSyncScheduler";
import hierarchyRoutes from "./routes/hierarchy";
import emailConfigRoutes from "./routes/emailConfig";
import emailLogRoutes from "./routes/emailLogs";
import emailActivityRoutes from "./routes/emailActivity";
import projectEmailConfigRoutes from "./routes/projectEmailConfigRoutes";
import emailConfigToggleRoutes from "./routes/emailConfigToggleRoutes";
import emailInboundRoutes from "./routes/emailInboundRoutes";
import emailCommunicationsRoutes from "./routes/emailCommunications";
import whatsappConfigRoutes from "./routes/whatsappConfig";
import smsConfigRoutes from "./routes/smsConfig";
import attendanceRoutes from "./routes/attendance";
import { attendanceScheduler } from "./services/attendanceScheduler";
import dpdpRoutes from "./routes/dpdp.routes";
import apiLogRoutes from "./routes/apiLogs";
import feedbackFormRoutes from "./routes/feedbackForm";
import feedbackResponseRoutes from "./routes/feedbackResponse";
import assetRoutes from "./routes/asset";
import centerAssetRoutes from "./routes/centerAsset";
import myAssetsRoutes from "./routes/myAssets";
import centerRoutes from "./routes/centers";
import seedRoutes from "./routes/seed";
import diagnosticRoutes from "./routes/diagnostic";
import healthcheckRoutes from "./routes/healthcheck";
import cacheRoutes from "./routes/cacheRoutes";
import otpRoutes from "./routes/otp";
import reportRoutes from "./routes/reportRoutes";
import dbMonitoringRoutes from "./routes/dbMonitoringRoutes";
import publicApiKeysRoutes from "./routes/publicApiKeys";
import publicApiRoutes from "./routes/publicApi";
import pushNotificationRoutes from "./routes/pushNotifications";
import notificationRoutes from "./routes/notifications";
import notificationSettingsRoutes from "./routes/notificationSettingsRoutes";
import userNotificationPrefRoutes from "./routes/userNotificationPrefRoutes";
// import integrationRoutes from './routes/integrations'; // TODO: Implement
import { setupSocketHandlers } from "./socket/socketHandlers";
import { setIo } from "./socket/ioInstance";
import { initializeDatabase } from "./utils/dbInit";
import { seedRolesAndPermissions } from "./utils/seedRolesPermissions";
import { seedNotificationSettings } from "./utils/seedNotificationSettings";
import { emailPollingService } from "./services/emailPollingService";
import { emailProcessingWorker } from "./services/emailProcessingWorker";
import { autoEscalationService } from "./services/autoEscalationService";
import { srWipScheduler } from "./modules/service-request/services/srWipScheduler";
import { startAuditArchivalScheduler } from "./services/auditArchiveService";
import { flushAudit } from "./plugins/auditWriter";
import { registerPhase1Handlers } from "./services/widgetHandlers/phase1Handlers";
import { registerPhase2Handlers } from "./services/widgetHandlers/phase2Handlers";
import { registerPhase3Handlers } from "./services/widgetHandlers/phase3Handlers";
import { registerPhase4Handlers } from "./services/widgetHandlers/phase4Handlers";
import { registerPhase5Handlers } from "./services/widgetHandlers/phase5Handlers";
import { registerSrDashboardHandlers } from "./services/widgetHandlers/srDashboardHandlers";
import { registerKbHandlers } from "./services/dashboard/queryHandlers/kbHandlers";
import { registerActivityHandlers } from "./services/dashboard/queryHandlers/activityHandlers";
import { registerAttRawHandlers } from "./services/widgetHandlers/attRawHandlers";
import { registerCenterOpsHandlers } from "./services/widgetHandlers/centerOpsHandlers";
import { registerAgentPerfHandlers } from "./services/widgetHandlers/agentPerfHandlers";
import { registerSlaEscHandlers } from "./services/widgetHandlers/slaEscHandlers";
import { registerMiscHandlers } from "./services/widgetHandlers/miscHandlers";
import { registerAssetMgmtHandlers } from "./services/widgetHandlers/assetMgmtHandlers";
import { registerFootfallHandlers } from "./services/widgetHandlers/footfallHandlers";
import "./models/dashboard/FeedbackScore";
import { seedWidgetDefinitions } from "./utils/seedWidgetDefinitions";
import { seedDashboardTemplates } from "./utils/seedDashboardTemplates";
import { initDashboardEventBus } from "./services/dashboardEventBus";

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3003;
const NODE_ENV = process.env.NODE_ENV || "development";

// Get allowed origins from .env - Supports both old and new format
// Old format: FRONTEND_URL, PRODUCTION_FRONTEND_URL
// New format: ALLOWED_ORIGINS_LOCAL, ALLOWED_ORIGINS_PRODUCTION
const getAllowedOrigins = (): string[] => {
  const isProduction = NODE_ENV === "production";

  // Try new format first
  const newFormatOrigins = isProduction
    ? process.env.ALLOWED_ORIGINS_PRODUCTION
    : process.env.ALLOWED_ORIGINS_LOCAL;

  if (newFormatOrigins) {
    return newFormatOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  // Fallback to old format (FRONTEND_URL / PRODUCTION_FRONTEND_URL)
  const oldFormatUrl = isProduction
    ? process.env.PRODUCTION_FRONTEND_URL
    : process.env.FRONTEND_URL;

  if (oldFormatUrl) {
    return [oldFormatUrl];
  }

  // Final fallback
  return isProduction
    ? ["https://helpdesk.hubblehox.ai"]
    : [
        "http://localhost:3001",
        "http://localhost:3000",
        "http://localhost:3003",
      ];
};

const allowedOrigins = getAllowedOrigins();

// Allowed origins for Socket.IO
const socketAllowedOrigins = allowedOrigins;

// Connect to MongoDB
connectDB();

// Initialize Socket.IO with allowed origins from .env
// Path is /api/socket.io so the existing nginx /api proxy block handles it
// (avoids needing a separate /socket.io location on the live server)
const io = new Server(httpServer, {
  path: "/api/socket.io",
  cors: {
    origin: socketAllowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // GIGW: explicit HSTS — force HTTPS for a year, incl. subdomains + preload.
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xXssProtection: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        fontSrc: ["'none'"],
        mediaSrc: ["'none'"],
        manifestSrc: ["'none'"],
        workerSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);

// CORS - Must be before other middleware
// Support multiple origins from .env configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("âŒ CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Cache-Control",
      "Pragma",
      "X-API-Key",
      "X-Project-ID",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400, // 24 hours
  }),
);

// Rate limiting disabled for development/testing

// Body parsing middleware
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }),
);

// Serve uploaded files statically
import path from "path";
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Compression and logging
app.use(compression());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Bind the per-request audit context (AsyncLocalStorage) before any route, so
// the global mongoose audit plugin can attribute every mutation to the actor.
app.use(auditContext);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth/project", projectAuthRoutes); // Agent login via /api/auth/project/:customUrlPath/login
app.use("/api/project-auth", projectAuthRoutes);
app.use("/api/student-auth", studentAuthRoutes);
app.use("/api/keycloak-auth", keycloakAuthRoutes);
app.use("/api/auth", eulaRoutes);
app.use("/api/otp", otpRoutes); // OTP verification for fields
app.use("/api/users", userRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/clusters", clusterRoutes);
app.use("/api/email-intake", emailIntakeRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/ivr", ivrRoutes);
app.use("/api/public/service-requests/ivr", publicIvrRoutes);
app.use("/api/ivr-agents", ivrAgentRoutes);
app.use("/api/role-mapping-rules", roleMappingRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/master", masterRoutes); // Master data: Countries, States, Cities (all endpoints)
app.use("/api/mdm", mdmRoutes); // MDM (Master Data Management) source configuration
app.use("/api/mdm-sync", mdmUserSyncRoutes); // MDM → User sync (manual + scheduled)
app.use("/api/service-requests", psrSearchRoutes); // PSR parent/student search (production)
app.use("/api/psr", psrPipelineRoutes); // PSR Pipeline system — configurable API composition
app.use("/api/psr-builder", psrBuilderRoutes); // PSR Builder — simple master/table UI
app.use("/api/categories", categoryRoutes);
app.use("/api/hierarchy-config", hierarchyConfigRoutes);
app.use("/api/statuses", statusRoutes);
app.use("/api/asset-categories", assetCategoryRoutes);
app.use("/api/departments", departmentRoutes);

// Ticket Module Routes (TODO: Implement)
// app.use('/api/ticket-fields', ticketFieldRoutes);
// app.use('/api/auto-assignments', autoAssignmentRoutes);

// SLA Module Routes
app.use("/api/sla-rules", slaRuleRoutes);
app.use("/api/escalation-policies", escalationPolicyRoutes);
app.use("/api/escalation-matrix", escalationMatrixRoutes);
app.use("/api/priorities", priorityRoutes);
app.use("/api/working-calendars", workingCalendarRoutes);

// Dashboard Engine Routes (Phase 1 + 2 + 3)
app.use("/api/v1/admin/dashboards", adminDashboardRoutes);
app.use("/api/v1/me/dashboards", meDashboardRoutes);
app.use("/api/v1/me/personal-dashboards", personalDashboardRoutes);
app.use("/api/v1/widgets", widgetDataRoutes);
app.use("/api/v1/usage", usageAnalyticsRoutes);
app.use("/api/v1/admin/usage", usageAnalyticsRoutes);

// Hierarchy Routes (User Reporting Structure for Team Dashboards)
// Temporarily disabled - hierarchyController needs refactoring for new schema
// app.use('/api/hierarchy', hierarchyRoutes);

// Knowledge Base Routes
// IMPORTANT: Specific KB routes MUST be registered BEFORE /api/kb to avoid /:id matching route names
app.use("/api/kb/levels", kbLevelsRoutes);
app.use("/api/kb/articles", kbArticlesRoutes);
app.use("/api/kb/tables", kbTablesRoutes);
app.use("/api/kb/public", kbPublicRoutes);
app.use("/api/kb", knowledgeBaseRoutes);
app.use("/api/knowledge-base", knowledgeBaseRoutes);

// File Upload Routes
app.use("/api/upload", uploadRoutes);

// FAQ Routes
app.use("/api/faq", faqRoutes);

// Approval workflows
app.use("/api/approvals", approvalRoutes);
app.use("/api/approval-masters", approvalMasterRoutes);

// Offline Module Routes (Agent features for walk-in student support)
app.use("/api/offline-module", offlineModuleRoutes);

// Asset Management Routes
app.use("/api/assets", assetRoutes);
app.use("/api/center-assets", centerAssetRoutes);
app.use("/api/my-assets", myAssetsRoutes);
app.use("/api/centers", centerRoutes);

// Seed Routes (for initial data population)
app.use("/api/seed", seedRoutes);

// Diagnostic Routes (for deployment troubleshooting)
app.use("/api/diagnostic", diagnosticRoutes);

// Healthcheck Route (public, no auth)
app.use("/api/healthcheck", healthcheckRoutes);

// Email Configuration Routes
app.use("/api/email-config", emailConfigRoutes);

// Email Activity Routes (real-time polling status)
app.use("/api/email-activity", emailActivityRoutes);

// Activity (audit) Log Routes — imported above but the mount was missing,
// which 404'd the whole audit-log UI.
app.use("/api/activity-logs", activityLogRoutes);

// Project Email Configuration Routes (for project-specific email settings)
app.use("/api/projects", projectEmailConfigRoutes);

// Email Config Toggle Routes (toggle, delete, test by configId)
app.use("/api/email-configs", emailConfigToggleRoutes);

// SendGrid / inbound email webhook (public, no auth required)
app.use("/api/email", emailInboundRoutes);

// Email Communications Routes (incoming/outgoing email logs)
app.use("/api/email-communications", emailCommunicationsRoutes);

// WhatsApp Configuration Routes
app.use("/api/whatsapp-config", whatsappConfigRoutes);

// SMS Configuration Routes
app.use("/api/sms-config", smsConfigRoutes);

// Attendance Module Routes
app.use("/api/attendance", attendanceRoutes);

// DPDP Act 2023 Compliance Routes
app.use("/api/dpdp", dpdpRoutes);

// Email Logs Routes
app.use("/api/email-logs", emailLogRoutes);

// API Logs Routes (Webhook/Integration failures)
app.use("/api/api-logs", apiLogRoutes);

// Feedback Module Routes
app.use("/api/feedback-forms", feedbackFormRoutes);
app.use("/api/feedback-responses", feedbackResponseRoutes);

// Report Module Routes
app.use("/api/reports", reportRoutes);

// DB Monitoring Routes
app.use("/api/db-monitoring", dbMonitoringRoutes);

// Public API Key Management Routes (admin)
app.use("/api/admin/public-api-keys", publicApiKeysRoutes);

// Public API Routes (chatbot / WhatsApp / external consumers)
// Per-endpoint rate limiting is applied inside the router
// âš ï¸ Use /api/v1 so Vite proxy in dev forwards these to backend correctly
app.use("/api/v1", publicApiRoutes);

// Integration Routes (TODO: Implement)
// app.use('/api/integrations', integrationRoutes);

// Cache Management Routes
app.use("/api/cache", cacheRoutes);

// Web Push Notification Routes
app.use("/api/push", pushNotificationRoutes);

// In-App Notification Routes
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/notification-settings", notificationSettingsRoutes);
app.use("/api/me/notification-preferences", userNotificationPrefRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "SAC Helpdesk API is running",
    timestamp: new Date().toISOString(),
  });
});

// Socket.io setup
setIo(io);
setupSocketHandlers(io);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

httpServer.listen(PORT, async () => {
  console.log(`ðŸš€ Server running on port ${PORT}`);
  console.log(`ðŸ“Š Environment: ${process.env.NODE_ENV}`);
  console.log(`ðŸ”— API URL: http://localhost:${PORT}/api`);

  // Step 0: Register dashboard widget handlers FIRST.
  // This is a pure in-memory operation that does NOT depend on the database, so
  // it MUST run independently of seeding. Previously it lived inside the seeding
  // try/catch below â€” any seeding failure would skip registration entirely and
  // leave every dashboard widget reporting "No query handler registered".
  try {
    registerPhase1Handlers();
    registerPhase2Handlers();
    registerPhase3Handlers();
    registerPhase4Handlers();
    registerPhase5Handlers();
    registerSrDashboardHandlers();
    registerKbHandlers();
    registerActivityHandlers();
    registerAttRawHandlers();
    registerCenterOpsHandlers();
    registerAgentPerfHandlers();
    registerSlaEscHandlers();
    registerMiscHandlers();
    registerAssetMgmtHandlers();
    registerFootfallHandlers();
    console.log(
      "ðŸ“Š Dashboard Engine: Phase 1â€“5 + KB + Activity + att/co/ap/se/misc/am/footfall handlers registered",
    );

    // Start event-driven cache invalidation (in-memory event bus)
    initDashboardEventBus();
  } catch (error) {
    console.error("âš ï¸  Widget handler registration failed:", error);
  }

  // Step 1: Seed data and initialize database (failures here must NOT block services)
  try {
    // Seed roles and permissions FIRST (before creating admin user)
    console.log("ðŸ” Initializing roles and permissions...");
    await seedRolesAndPermissions();

    // Seed global notification settings defaults (idempotent)
    await seedNotificationSettings();

    // Then initialize database (creates admin user with role reference)
    await initializeDatabase();

    // Seed widget definitions (idempotent)
    await seedWidgetDefinitions();

    // Seed pre-built dashboard templates (idempotent)
    await seedDashboardTemplates();
  } catch (error) {
    console.error(
      "âš ï¸  Database initialization/seeding failed, but server will continue:",
      error,
    );
  }

  // Step 2: Start background services independently â€” always run even if seeding failed
  try {
    // Start email polling service
    console.log("ðŸ“§ Starting Email Polling Service...");
    await emailPollingService.start();

    // Start email processing worker (creates tickets from queued emails)
    console.log("ðŸ¤– Starting Email Processing Worker...");
    emailProcessingWorker.start();

    // Start auto-escalation service (monitors and escalates tickets based on SLA)
    console.log("â° Starting Auto-Escalation Service...");
    autoEscalationService.start();

    // Start SR WIP committed-date reminder scheduler (inert until SR enabled)
    srWipScheduler.start();

    // Start audit-log GCS archival scheduler (inert unless AUDIT_ARCHIVE_ENABLED)
    startAuditArchivalScheduler();

    // Start attendance sync scheduler (per-project AFT cron jobs)
    console.log("ðŸ“… Starting Attendance Sync Scheduler...");
    await attendanceScheduler.start();

    // Start External MDM cache scheduler (dataset sync + join rebuild)
    console.log("Starting External MDM Cache Scheduler...");
    await startMDMCacheScheduler();
    await mdmUserSyncScheduler.start();

    // Start PSR Pipeline queue + worker (Slice B — US-3.5)
    console.log("🔧 Starting PSR Pipeline Queue & Worker...");
    initPsrQueue();
    startPsrWorker();

    // Start PSR Staleness Watchdog (Slice D — US-5.2)
    console.log("🔍 Starting PSR Staleness Watchdog...");
    startStalenessWatchdog();

    // Start PSR Table Scheduler (periodic auto-refresh)
    console.log("🗓️  Starting PSR Table Scheduler...");
    // Reset any tables stuck in "refreshing" state from a previous crashed/restarted process
    try {
      const { default: PsrTableModel } = await import("./models/psr/PsrTable");
      const stuckCount = await (PsrTableModel as any).countDocuments({ status: "refreshing" });
      if (stuckCount > 0) {
        await (PsrTableModel as any).updateMany({ status: "refreshing" }, { $set: { status: "idle" } });
        console.log(`🔄 Reset ${stuckCount} stuck PSR table(s) from "refreshing" → "idle"`);
      }
    } catch (e: any) { console.warn("Could not reset stuck PSR tables:", e.message); }
    startPsrTableScheduler();

    // Warm up VAPID keys now so push notifications work immediately.
    // Keys are persisted in SystemSettings (MongoDB) â€” no .env entry needed.
    console.log("ðŸ”” Initializing Web Push (VAPID)...");
    await ensureWebPushConfiguredAsync();

    // Start dashboard pre-aggregation scheduler (Phase 4)
    console.log("ðŸ“Š Starting Dashboard Aggregation Scheduler...");
    startAggregationScheduler();

    // Start scheduled report delivery scheduler (Sprint 10)
    console.log("ðŸ“§ Starting Report Delivery Scheduler...");
    await startReportScheduler();

    // Start saved-report alert scheduler
    console.log("ðŸ”” Starting Report Alert Scheduler...");
    await startReportAlertScheduler();

    // Start attendance report alert scheduler
    console.log("ðŸ”” Starting Attendance Report Alert Scheduler...");
    await startAttendanceAlertScheduler();
  } catch (error) {
    console.error(
      "âš ï¸  One or more background services failed to start:",
      error,
    );
  }
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("âŒ Unhandled Rejection at:", promise, "reason:", reason);
  console.error("âŒ Server will continue running, but this should be fixed");
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  console.error("âŒ Uncaught Exception:", error);
  if ((error as any).code === "EADDRINUSE") {
    console.error("âŒ Port already in use. Exiting so nodemon can retry.");
    process.exit(1);
  }
  console.error("âŒ Server will continue running, but this should be fixed");
});

// Graceful shutdown - only in production
// In development, ignore accidental SIGINT/SIGTERM to prevent server crashes
const isDevelopment = process.env.NODE_ENV !== "production";

if (!isDevelopment) {
  // Production: Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🔄 SIGTERM received, shutting down gracefully");
    stopStalenessWatchdog();
    stopPsrTableScheduler();
    Promise.all([stopPsrWorker(), flushAudit()]).finally(() => {
      httpServer.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    });
  });

  process.on("SIGINT", () => {
    console.log("🔄 SIGINT received, shutting down gracefully");
    stopStalenessWatchdog();
    stopPsrTableScheduler();
    Promise.all([stopPsrWorker(), flushAudit()]).finally(() => {
      httpServer.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    });
  });
} else {
  // Development: Ignore accidental signals, only shutdown on explicit Ctrl+C twice
  let sigintCount = 0;

  process.on("SIGINT", () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log("âš ï¸  SIGINT received - Press Ctrl+C again to stop server");
      console.log("   (Ignoring single SIGINT to prevent accidental shutdown)");
      setTimeout(() => {
        sigintCount = 0;
      }, 3000); // Reset after 3 seconds
    } else {
      console.log("ðŸ”„ Shutting down server...");
      httpServer.close(() => {
        console.log("âœ… Server closed");
        process.exit(0);
      });
    }
  });

  process.on("SIGTERM", () => {
    console.log(
      "âš ï¸  SIGTERM received in development - Ignoring (server stays running)",
    );
    console.log("   Use Ctrl+C twice to stop the server");
  });
}

export { io };
