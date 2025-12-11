import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

import { connectDB } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import authRoutes from './routes/auth';
import projectAuthRoutes from './routes/projectAuth';
import studentAuthRoutes from './routes/studentAuth';
import userRoutes from './routes/users';
import ticketRoutes from './routes/tickets';
import eulaRoutes from './routes/eula';
import projectRoutes from './routes/projects';
import roleRoutes from './routes/roleRoutes';
import permissionRoutes from './routes/permissionRoutes';
import masterDataRoutes from './routes/masterData'; // Old generic routes (kept for backward compatibility)
import newMasterDataRoutes from './routes/master-data'; // New separate collection routes
import masterRoutes from './routes/masterRoutes'; // Country, State, City routes
import categoryRoutes from './routes/categories';
import statusRoutes from './routes/statuses';
// import { ticketFieldRoutes, autoAssignmentRoutes } from './routes/ticket-module'; // TODO: Implement
import slaRuleRoutes from './routes/sla-module/slaRuleRoutes';
import escalationPolicyRoutes from './routes/sla-module/escalationPolicyRoutes';
import priorityRoutes from './routes/priorityRoutes';
import activityLogRoutes from './routes/activityLogs';
import accessLogRoutes from './routes/accessLogs';
import knowledgeBaseRoutes from './routes/knowledgeBase';
import approvalRoutes from './routes/approvals';
import approvalMasterRoutes from './routes/approvalMasters';
import offlineModuleRoutes from './routes/offlineModule';
import dashboardRoutes from './routes/dashboard';
import emailConfigRoutes from './routes/emailConfig';
import emailLogRoutes from './routes/emailLogs';
import apiLogRoutes from './routes/apiLogs';
// import integrationRoutes from './routes/integrations'; // TODO: Implement
import { setupSocketHandlers } from './socket/socketHandlers';
import { initializeDatabase } from './utils/dbInit';
import { seedRolesAndPermissions } from './utils/seedRolesPermissions';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3003;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Get allowed origins from .env - Supports both old and new format
// Old format: FRONTEND_URL, PRODUCTION_FRONTEND_URL
// New format: ALLOWED_ORIGINS_LOCAL, ALLOWED_ORIGINS_PRODUCTION
const getAllowedOrigins = (): string[] => {
  const isProduction = NODE_ENV === 'production';
  
  // Try new format first
  const newFormatOrigins = isProduction
    ? process.env.ALLOWED_ORIGINS_PRODUCTION
    : process.env.ALLOWED_ORIGINS_LOCAL;
  
  if (newFormatOrigins) {
    return newFormatOrigins
      .split(',')
      .map(origin => origin.trim())
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
    ? ['https://helpdesk.hubblehox.ai']
    : ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:3003'];
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
    methods: ['GET', 'POST'],
    credentials: true
  },
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS - Must be before other middleware
// Support multiple origins from .env configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Rate limiting - More lenient in development
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '15') || 15) * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' 
    ? 1000  // 1000 requests per 15 min in development
    : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100') || 100, // 100 in production
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Compression and logging
app.use(compression());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/project', projectAuthRoutes); // Agent login via /api/auth/project/:customUrlPath/login
app.use('/api/project-auth', projectAuthRoutes);
app.use('/api/student-auth', studentAuthRoutes);
app.use('/api/auth', eulaRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/master-data', masterDataRoutes); // Old generic routes (backward compatibility)
app.use('/api/masters', newMasterDataRoutes); // New separate collection routes
app.use('/api/master', masterRoutes); // Country, State, City routes
app.use('/api/categories', categoryRoutes);
app.use('/api/statuses', statusRoutes);

// Ticket Module Routes (TODO: Implement)
// app.use('/api/ticket-fields', ticketFieldRoutes);
// app.use('/api/auto-assignments', autoAssignmentRoutes);

// SLA Module Routes
app.use('/api/sla-rules', slaRuleRoutes);
app.use('/api/escalation-policies', escalationPolicyRoutes);
app.use('/api/priorities', priorityRoutes);

// Audit Logs Routes
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/access-logs', accessLogRoutes);

// Dashboard Routes
app.use('/api/dashboard', dashboardRoutes);

// Knowledge Base Routes
app.use('/api/kb', knowledgeBaseRoutes);

// Approval workflows
app.use('/api/approvals', approvalRoutes);
app.use('/api/approval-masters', approvalMasterRoutes);

// Offline Module Routes (Agent features for walk-in student support)
app.use('/api/offline-module', offlineModuleRoutes);

// Email Configuration Routes
app.use('/api/email-config', emailConfigRoutes);

// Email Logs Routes
app.use('/api/email-logs', emailLogRoutes);

// API Logs Routes (Webhook/Integration failures)
app.use('/api/api-logs', apiLogRoutes);

// Integration Routes (TODO: Implement)
// app.use('/api/integrations', integrationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'SAC Helpdesk API is running',
    timestamp: new Date().toISOString(),
  });
});

// Socket.io setup
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
    console.log('🔐 Initializing roles and permissions...');
    await seedRolesAndPermissions();
    
    // Then initialize database (creates admin user with role reference)
    await initializeDatabase();
  } catch (error) {
    console.error('⚠️  Database initialization failed, but server is still running');
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('❌ Server will continue running, but this should be fixed');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('❌ Server will continue running, but this should be fixed');
});

// Graceful shutdown - only in production
// In development, ignore accidental SIGINT/SIGTERM to prevent server crashes
const isDevelopment = process.env.NODE_ENV !== 'production';

if (!isDevelopment) {
  // Production: Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully');
    httpServer.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
} else {
  // Development: Ignore accidental signals, only shutdown on explicit Ctrl+C twice
  let sigintCount = 0;
  
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log('⚠️  SIGINT received - Press Ctrl+C again to stop server');
      console.log('   (Ignoring single SIGINT to prevent accidental shutdown)');
      setTimeout(() => { sigintCount = 0; }, 3000); // Reset after 3 seconds
    } else {
      console.log('🔄 Shutting down server...');
      httpServer.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    }
  });
  
  process.on('SIGTERM', () => {
    console.log('⚠️  SIGTERM received in development - Ignoring (server stays running)');
    console.log('   Use Ctrl+C twice to stop the server');
  });
}

export { io };
