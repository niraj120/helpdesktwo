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
import "./models/Asset";
import "./models/CenterAssetMapping";
import "./models/FeedbackForm";
import "./models/FeedbackResponse";
import "./models/KBCategory";
import "./models/KBSubcategory";
import "./models/KnowledgeBaseArticle";
import "./models/MasterData";
import "./models/EmailLog";
import "./models/EmailConfig";
import "./models/FAQ";
import "./models/PushSubscription";
// UserReportingHierarchy model removed - using User.reportingManager field directly
import "./models/UserDashboardConfig";

import { connectDB } from "./config/database";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import authRoutes from "./routes/auth";
import projectAuthRoutes from "./routes/projectAuth";
import studentAuthRoutes from "./routes/studentAuth";
import keycloakAuthRoutes from "./routes/keycloakAuth";
import userRoutes from "./routes/users";
import ticketRoutes from "./routes/tickets";
import eulaRoutes from "./routes/eula";
import projectRoutes from "./routes/projects";
import roleRoutes from "./routes/roleRoutes";
import permissionRoutes from "./routes/permissionRoutes";
import masterRoutes from "./routes/masterRoutes"; // Country, State, City routes (consolidated)
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
// import integrationRoutes from './routes/integrations'; // TODO: Implement
import { setupSocketHandlers } from "./socket/socketHandlers";
import { setIo } from "./socket/ioInstance";
import { initializeDatabase } from "./utils/dbInit";
import { seedRolesAndPermissions } from "./utils/seedRolesPermissions";
import { emailPollingService } from "./services/emailPollingService";
import { emailProcessingWorker } from "./services/emailProcessingWorker";
import { autoEscalationService } from "./services/autoEscalationService";

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
const io = new Server(httpServer, {
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
        console.log("❌ CORS blocked origin:", origin);
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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
import path from "path";
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Compression and logging
app.use(compression());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

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
app.use("/api/projects", projectRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/master", masterRoutes); // Master data: Countries, States, Cities (all endpoints)
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

// Audit Logs Routes
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/access-logs", accessLogRoutes);

// Dashboard Routes
app.use("/api/dashboard", dashboardRoutes);

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
// ⚠️ Use /api/v1 so Vite proxy in dev forwards these to backend correctly
app.use("/api/v1", publicApiRoutes);

// Integration Routes (TODO: Implement)
// app.use('/api/integrations', integrationRoutes);

// Cache Management Routes
app.use("/api/cache", cacheRoutes);

// Web Push Notification Routes
app.use("/api/push", pushNotificationRoutes);

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
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);

  // Initialize database with default data
  try {
    // Seed roles and permissions FIRST (before creating admin user)
    console.log("🔐 Initializing roles and permissions...");
    await seedRolesAndPermissions();

    // Then initialize database (creates admin user with role reference)
    await initializeDatabase();

    // Start email polling service
    console.log("📧 Starting Email Polling Service...");
    await emailPollingService.start();

    // Start email processing worker (creates tickets from queued emails)
    console.log("🤖 Starting Email Processing Worker...");
    emailProcessingWorker.start();

    // Start auto-escalation service (monitors and escalates tickets based on SLA)
    console.log("⏰ Starting Auto-Escalation Service...");
    autoEscalationService.start();

    // Start attendance sync scheduler (per-project AFT cron jobs)
    console.log("📅 Starting Attendance Sync Scheduler...");
    await attendanceScheduler.start();
  } catch (error) {
    console.error(
      "⚠️  Database initialization failed, but server is still running",
    );
  }
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  console.error("❌ Server will continue running, but this should be fixed");
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("❌ Server will continue running, but this should be fixed");
});

// Graceful shutdown - only in production
// In development, ignore accidental SIGINT/SIGTERM to prevent server crashes
const isDevelopment = process.env.NODE_ENV !== "production";

if (!isDevelopment) {
  // Production: Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🔄 SIGTERM received, shutting down gracefully");
    httpServer.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("🔄 SIGINT received, shutting down gracefully");
    httpServer.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });
  });
} else {
  // Development: Ignore accidental signals, only shutdown on explicit Ctrl+C twice
  let sigintCount = 0;

  process.on("SIGINT", () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log("⚠️  SIGINT received - Press Ctrl+C again to stop server");
      console.log("   (Ignoring single SIGINT to prevent accidental shutdown)");
      setTimeout(() => {
        sigintCount = 0;
      }, 3000); // Reset after 3 seconds
    } else {
      console.log("🔄 Shutting down server...");
      httpServer.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    }
  });

  process.on("SIGTERM", () => {
    console.log(
      "⚠️  SIGTERM received in development - Ignoring (server stays running)",
    );
    console.log("   Use Ctrl+C twice to stop the server");
  });
}

export { io };
