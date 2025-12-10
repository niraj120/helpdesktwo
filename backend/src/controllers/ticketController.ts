import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Permission } from '../models/Permission';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sendTicketCreatedEmail, sendStudentWelcomeEmail } from '../utils/emailService';
import { logActivity } from '../utils/logger';
import { config } from '../config';

/**
 * Check if user has authorization to modify a ticket
 * Authorized users:
 * - Ticket creator (student who submitted)
 * - Assigned agent
 * - Project admins/managers
 * - Super admins
 */
const canModifyTicket = async (userId: string, ticket: any, user: any): Promise<boolean> => {
  // Super admins can modify any ticket
  if (user?.role?.code === 'SUPER_ADMIN') {
    return true;
  }

  // Center managers can modify tickets in their projects
  if (user?.role?.code === 'CENTER_MANAGER') {
    return true;
  }

  // Ticket creator can modify their own ticket
  if (ticket.submittedBy?.toString() === userId) {
    return true;
  }

  // Assigned agent can modify the ticket
  if (ticket.assignedTo?.toString() === userId) {
    return true;
  }

  // Check if user is an agent on this project
  const projectId = ticket.metadata?.projectId;
  if (projectId) {
    const userDoc = await User.findById(userId);
    if (userDoc?.projects?.some((p: any) => p.toString() === projectId.toString())) {
      return true;
    }
  }

  return false;
};

/**
 * Get next agent for round-robin assignment
 */
const getNextRoundRobinAgent = async (projectId: string, eligibleUserIds: mongoose.Types.ObjectId[]): Promise<mongoose.Types.ObjectId | null> => {
  if (eligibleUserIds.length === 0) return null;
  
  // Find the last assigned ticket for this project
  const lastTicket = await Ticket.findOne({ 
    'metadata.projectId': projectId,
    assignedTo: { $exists: true, $ne: null }
  }).sort({ createdAt: -1 });
  
  if (!lastTicket || !lastTicket.assignedTo) {
    // No previous assignment, return first agent
    return eligibleUserIds[0];
  }
  
  // Find the index of last assigned agent
  const lastAgentIndex = eligibleUserIds.findIndex(id => id.toString() === lastTicket.assignedTo?.toString());
  
  // Return next agent in rotation (or first if last was the end of list)
  const nextIndex = (lastAgentIndex + 1) % eligibleUserIds.length;
  return eligibleUserIds[nextIndex];
};

/**
 * Get agent with least active tickets (load-balanced)
 */
const getLeastLoadedAgent = async (eligibleUserIds: mongoose.Types.ObjectId[]): Promise<mongoose.Types.ObjectId | null> => {
  if (eligibleUserIds.length === 0) return null;
  
  // Count active tickets for each agent
  const ticketCounts = await Promise.all(
    eligibleUserIds.map(async (userId) => {
      const count = await Ticket.countDocuments({
        assignedTo: userId,
        status: { $in: ['open', 'in-progress', 'pending'] }
      });
      return { userId, count };
    })
  );
  
  // Sort by count (ascending) and return agent with least tickets
  ticketCounts.sort((a, b) => a.count - b.count);
  return ticketCounts[0].userId;
};

/**
 * Submit a ticket from student portal
 */
export const submitTicket = async (req: Request, res: Response) => {
  const perfStart = Date.now();
  console.time('⏱️ Total submitTicket');
  
  try {
    const { projectId, formData } = req.body;
    
    console.log(`📝 Submitting ticket for project: ${projectId}`);
    
    // Check if user is authenticated (optional for this endpoint)
    const authHeader = req.headers.authorization;
    let authenticatedUserId: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        authenticatedUserId = decoded.userId;
        console.log(`🔐 Authenticated submission from user: ${authenticatedUserId}`);
      } catch (error) {
        console.log(`⚠️ Invalid token, treating as public submission`);
      }
    }
    
    // Validate project exists
    console.time('⏱️ Project lookup');
    const project = await Project.findById(projectId);
    console.timeEnd('⏱️ Project lookup');
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    // Parse form data
    const ticketData = JSON.parse(formData);
    
    // Handle file attachments
    const attachments: any[] = [];
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file: Express.Multer.File) => {
        // Preserve the fieldname so we can map attachments to online form fields
        attachments.push({
          fieldName: file.fieldname,
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
        });
      });
    }
    
    // Generate unique ticket number with retry mechanism
    console.time('⏱️ Generate ticket number');
    const generateUniqueTicketNumber = async (): Promise<string> => {
      // Get ticket number configuration from project
      const ticketNumberConfig = project.configuration?.ticketNumberSettings;
      console.log('🔧 Ticket Number Config:', JSON.stringify(ticketNumberConfig, null, 2));
      const prefix = ticketNumberConfig?.prefix || 'TKT';
      const format = ticketNumberConfig?.format || '{PREFIX}-{YYYY}{MM}{DD}-{NNNN}';
      const resetPeriod = ticketNumberConfig?.resetPeriod || 'daily';
      console.log(`🎫 Using: prefix="${prefix}", format="${format}", resetPeriod="${resetPeriod}"`);
      
      const today = new Date();
      let datePrefix = '';
      
      // Build date prefix based on reset period
      if (resetPeriod === 'daily') {
        datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      } else if (resetPeriod === 'monthly') {
        datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
      } else if (resetPeriod === 'yearly') {
        datePrefix = `${today.getFullYear()}`;
      }
      
      // Build search pattern based on format
      let searchPattern = format
        .replace('{PREFIX}', prefix)
        .replace('{YYYY}', String(today.getFullYear()))
        .replace('{MM}', String(today.getMonth() + 1).padStart(2, '0'))
        .replace('{DD}', String(today.getDate()).padStart(2, '0'))
        .replace('{NNNN}', ''); // Remove the number part for search
      
      // Find the highest ticket number for the current period
      const latestTicket = await Ticket.findOne({
        projectId,
        ticketNumber: new RegExp(`^${searchPattern.replace(/[-]/g, '\\-')}`)
      }).sort({ ticketNumber: -1 });
      
      let nextNumber = ticketNumberConfig?.startingNumber || 1;
      if (latestTicket && latestTicket.ticketNumber) {
        // Extract the sequence number from the last ticket
        const lastNumber = parseInt(latestTicket.ticketNumber.split('-').pop() || '0');
        nextNumber = lastNumber + 1;
      }
      
      // Try up to 10 times to find a unique number (in case of race conditions)
      for (let attempt = 0; attempt < 10; attempt++) {
        // Generate ticket number based on format
        let ticketNumber = format
          .replace('{PREFIX}', prefix)
          .replace('{YYYY}', String(today.getFullYear()))
          .replace('{MM}', String(today.getMonth() + 1).padStart(2, '0'))
          .replace('{DD}', String(today.getDate()).padStart(2, '0'))
          .replace('{NNNN}', String(nextNumber).padStart(4, '0'));
        
        // Check if this number already exists
        const exists = await Ticket.findOne({ ticketNumber });
        if (!exists) {
          return ticketNumber;
        }
        
        nextNumber++;
      }
      
      // Fallback: use timestamp if all attempts fail
      return `${prefix}-${datePrefix}-${Date.now().toString().slice(-4)}`;
    };
    
    const ticketNumber = await generateUniqueTicketNumber();
    console.timeEnd('⏱️ Generate ticket number');
    console.log(`🎫 Generated ticket number: ${ticketNumber}`);
    
    // Auto-assignment logic
    console.time('⏱️ Auto-assignment');
    let assignedAgent: mongoose.Types.ObjectId | null = null;
    
    if (project.configuration?.ticketAssignmentSettings?.enabled) {
      const assignmentSettings = project.configuration.ticketAssignmentSettings;
      console.log(`🎯 Auto-assignment enabled: ${assignmentSettings.assignmentType}`);
      
      // Get eligible users for assignment
      let eligibleUsers: any[] = [];
      
      switch (assignmentSettings.assignmentType) {
        case 'round-robin':
          // For round-robin: Find users with isAgent roles mapped to this project
          console.log(`🔍 Looking for agent roles for project: ${projectId} (type: ${typeof projectId})`);
          
          const projectObjectId = new mongoose.Types.ObjectId(projectId);
          const agentRoles = await Role.find({
            isAgent: true,
            isActive: true,
            $or: [
              { projects: projectObjectId }, // New multi-project mapping
              { projectId: projectObjectId }  // Old single project mapping (backward compatibility)
            ]
          });
          
          console.log(`📊 Found ${agentRoles.length} agent roles:`, agentRoles.map(r => ({ name: r.name, code: r.code, projectId: r.projectId, projects: r.projects })));
          
          if (agentRoles.length > 0) {
            const agentRoleIds = agentRoles.map(r => r._id);
            eligibleUsers = await User.find({
              role: { $in: agentRoleIds },
              isActive: true
            });
            console.log(`🔍 Found ${eligibleUsers.length} agents with isAgent roles for project ${projectId}`);
          } else {
            console.log(`⚠️ No agent roles (isAgent=true) mapped to project ${projectId}`);
          }
          
          if (eligibleUsers.length > 0) {
            const eligibleUserIds = eligibleUsers.map(u => u._id);
            assignedAgent = await getNextRoundRobinAgent(projectId, eligibleUserIds);
            console.log(`🔄 Round-robin assignment to agent: ${assignedAgent}`);
          }
          break;
          
        case 'manual':
        default:
          console.log(`✋ Manual assignment - ticket will be unassigned`);
          break;
      }
    }
    console.timeEnd('⏱️ Auto-assignment');
    
    // Check if student user exists, create if first time (MUST DO THIS BEFORE CREATING TICKET)
    console.time('⏱️ Student user lookup/create');
    const studentEmail = ticketData.Email;
    const studentName = ticketData.Name || 'Student';
    let studentUserId: mongoose.Types.ObjectId;
    let isNewStudent = false;
    
    // If authenticated, use the authenticated user's ID
    if (authenticatedUserId) {
      console.log(`🔐 Using authenticated user ID: ${authenticatedUserId}`);
      studentUserId = new mongoose.Types.ObjectId(authenticatedUserId);
      
      // Get student info from database for notifications
      const authenticatedUser = await User.findById(authenticatedUserId);
      if (authenticatedUser) {
        ticketData.Email = authenticatedUser.email;
        ticketData.Name = `${authenticatedUser.firstName} ${authenticatedUser.lastName}`.trim();
      }
    } else if (studentEmail) {
      // Public submission - check if student exists or create new
      // Parallelize student user lookup and role lookup
      const [studentUser, studentRole] = await Promise.all([
        User.findOne({ email: studentEmail }),
        Role.findOne({ code: 'STUDENT' })
      ]);
      
      if (!studentUser) {
        console.log(`📧 First-time student submission detected: ${studentEmail}`);
        isNewStudent = true;
        
        if (studentRole) {
          // Create new student user
          const nameParts = studentName.split(' ');
          const newStudent = await User.create({
            email: studentEmail,
            firstName: nameParts[0] || 'Student',
            lastName: nameParts.slice(1).join(' ') || '',
            role: studentRole._id,
            projects: [projectId],
            isActive: true,
            requirePasswordSetup: true, // Flag for first-time password setup via OTP
            registrationSource: 'online', // Mark as online registration
          });
          
          console.log(`✅ Student user created: ${newStudent._id} | ${studentEmail}`);
          studentUserId = newStudent._id as mongoose.Types.ObjectId;
        } else {
          console.error('⚠️ STUDENT role not found - cannot create student user');
          // Use a placeholder if role doesn't exist
          studentUserId = new mongoose.Types.ObjectId();
        }
      } else {
        // Use the existing student user ID
        studentUserId = studentUser._id as mongoose.Types.ObjectId;
      }
    } else {
      // No email provided - use placeholder (shouldn't happen in normal flow)
      studentUserId = new mongoose.Types.ObjectId();
    }
    console.timeEnd('⏱️ Student user lookup/create');
    
    // Create ticket (using actual student user ID)
    console.time('⏱️ Ticket save');
    const ticket = new Ticket({
      ticketNumber,
      title: ticketData.Subject || 'New Ticket',
      description: ticketData.Description || '',
      status: 'open',
      priority: 'medium',
      category: ticketData.Category || 'General',
      createdBy: studentUserId, // Use actual student user ID
      assignedTo: assignedAgent, // Auto-assigned agent (if enabled)
      submissionSource: 'online', // Mark as online submission
      attachments,
      tags: [`student-submission`, `project-${projectId}`],
      // Store student contact info in custom metadata
      metadata: {
        studentName: ticketData.Name,
        studentEmail: ticketData.Email,
        studentPhone: ticketData.Phone,
        projectId,
        submissionType: 'online',
        autoAssigned: !!assignedAgent,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    await ticket.save();
    console.timeEnd('⏱️ Ticket save');
    
    console.log(`✅ Ticket created successfully: ${ticket._id} | Created by: ${studentUserId}${assignedAgent ? ` | Assigned to: ${assignedAgent}` : ' | Unassigned'}`);
    
    // Log activity (non-blocking - fire and forget)
    (async () => {
      try {
        await logActivity({
          userId: studentUserId.toString(),
          userName: studentName || 'Student',
          userEmail: studentEmail || 'unknown@student.com',
          action: 'create',
          entity: 'ticket',
          entityId: ticket._id.toString(),
          entityName: ticket.title,
          projectId: projectId,
          projectName: project.name,
          description: `Ticket ${ticket.ticketNumber} created via online submission`,
          req,
          metadata: { ticketNumber: ticket.ticketNumber, source: 'online' }
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    })();
    
    // Send email notifications to student (non-blocking - fire and forget)
    if (studentEmail) {
      // Send emails in background without blocking the response
      (async () => {
        try {
          // Send welcome email if this is a new student
          if (isNewStudent) {
            const customUrlPath = project.branding?.customUrlPath || 'portal';
            const isProduction = process.env.NODE_ENV === 'production';
            const frontendUrl = isProduction
              ? process.env.PRODUCTION_FRONTEND_URL || 'https://helpdesk.hubblehox.ai'
              : process.env.FRONTEND_URL || 'http://localhost:3001';
            const loginUrl = `${frontendUrl}/${customUrlPath}/student/login`;
            
            await sendStudentWelcomeEmail(
              studentEmail,
              studentName,
              project.name,
              loginUrl,
              projectId
            );
          }
          
          // Send ticket creation confirmation
          await sendTicketCreatedEmail(
            studentEmail,
            ticket.ticketNumber,
            ticket.title,
            projectId,
            {
              studentName: studentName,
              status: ticket.status,
              priority: ticket.priority
            }
          );
        } catch (emailError) {
          console.error('Failed to send email notifications:', emailError);
          // Don't fail the request if email fails
        }
      })();
    }
    
    console.timeEnd('⏱️ Total submitTicket');
    const totalTime = Date.now() - perfStart;
    console.log(`⚡ Total API response time: ${totalTime}ms`);
    
    return res.status(201).json({
      success: true,
      message: 'Ticket submitted successfully',
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
      },
    });
    
  } catch (error) {
    console.timeEnd('⏱️ Total submitTicket');
    console.error('Submit ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit ticket',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get tickets for logged-in student user
 */
export const getMyTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get user with their role and permissions
    const user = await User.findById(userId).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user has TICKET_VIEW_ALL permission
    const role = user.role as any;
    const permissions = role?.permissions || [];
    const permissionCodes = permissions.map((p: any) => p.code).filter((c: any) => c); // Filter out undefined
    const hasViewAll = permissionCodes.includes('TICKET_VIEW_ALL');
    const hasViewOwn = permissionCodes.includes('TICKET_VIEW_OWN');
    const isSuperAdmin = role?.code === 'SUPER_ADMIN';
    
    // Check if user is a student based on role code
    const isStudent = role?.code === 'STUDENT';
    const isAgent = role?.isAgent === true;

    console.log(`🔍 [MY_TICKETS] User: ${user.email}`);
    console.log(`🔍 [MY_TICKETS] Role: ${role?.name} (${role?.code})`);
    console.log(`🔍 [MY_TICKETS] isSuperAdmin: ${isSuperAdmin}, isStudent: ${isStudent}, isAgent: ${isAgent}`);
    console.log(`🔍 [MY_TICKETS] Permission codes:`, permissionCodes);
    console.log(`🔍 [MY_TICKETS] hasViewAll: ${hasViewAll}, hasViewOwn: ${hasViewOwn}`);

    // Build query based on permissions and role type
    let query: any = {};

    // Super Admin should see EMPTY list in My Tickets (no tickets assigned to them)
    if (isSuperAdmin) {
      console.log(`🔍 [MY_TICKETS] Super Admin - returning empty list`);
      return res.status(200).json({
        success: true,
        data: [],
        message: 'Super Admin has no assigned tickets. Use View Tickets to see all tickets.'
      });
    } else if (hasViewOwn) {
      // For TICKET_VIEW_OWN: Students see tickets created by them, Agents see tickets assigned to them
      if (isStudent) {
        query['metadata.studentEmail'] = user.email;
        console.log(`🔍 [QUERY] TICKET_VIEW_OWN + Student - filter by metadata.studentEmail: ${user.email}`);
      } else if (isAgent) {
        query.assignedTo = userId;
        console.log(`🔍 [QUERY] TICKET_VIEW_OWN + Agent - filter by assignedTo: ${userId}`);
      } else {
        // Fallback: check by studentEmail
        query['metadata.studentEmail'] = user.email;
        console.log(`🔍 [QUERY] TICKET_VIEW_OWN + Unknown role - filter by metadata.studentEmail: ${user.email}`);
      }
    } else {
      // No specific permissions: show only tickets created by this student (by studentEmail)
      query['metadata.studentEmail'] = user.email;
      console.log(`🔍 [QUERY] No VIEW permissions - filter by metadata.studentEmail: ${user.email}`);
    }

    console.log(`🔍 [TICKET QUERY] Final query:`, JSON.stringify(query));

    // Filter by project if projectId is provided in query params
    if (req.query.projectId) {
      query['metadata.projectId'] = req.query.projectId;
    }

    // Find tickets based on query
    const tickets = await Ticket.find(query)
      .populate('assignedTo', 'firstName lastName email')
      .sort({ createdAt: -1 });

    console.log(`🔍 [TICKET QUERY] Tickets found: ${tickets.length}`);

    // Manually populate project data since metadata.projectId is in a Mixed type field
    const ticketsWithProject = await Promise.all(
      tickets.map(async (ticket) => {
        const ticketObj = ticket.toObject();
        if (ticketObj.metadata?.projectId) {
          const project = await Project.findById(ticketObj.metadata.projectId).select('name code');
          if (project) {
            ticketObj.metadata.projectId = {
              _id: project._id,
              name: project.name,
              code: project.code,
            };
          }
        }
        return ticketObj;
      })
    );

    console.log(`📋 Retrieved ${tickets.length} tickets for ${hasViewAll ? 'all users' : `student ${user.email}`}${req.query.projectId ? ` in project ${req.query.projectId}` : ''}`);

    return res.status(200).json({
      success: true,
      data: ticketsWithProject,
    });

  } catch (error) {
    console.error('Get my tickets error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all tickets for View Tickets page
 * - Super Admin: ALL tickets across all projects
 * - Other roles: Only tickets from their assigned projects
 */
export const getAllTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get user with their role and permissions
    const user = await User.findById(userId).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    }).populate('projects');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const role = user.role as any;
    const isSuperAdmin = role?.code === 'SUPER_ADMIN';
    const permissions = role?.permissions || [];
    const permissionCodes = permissions.map((p: any) => p.code).filter((c: any) => c);
    const hasViewAll = permissionCodes.includes('TICKET_VIEW_ALL');

    console.log(`🔍 [VIEW_TICKETS] User: ${user.email}`);
    console.log(`🔍 [VIEW_TICKETS] Role: ${role?.name} (${role?.code})`);
    console.log(`🔍 [VIEW_TICKETS] isSuperAdmin: ${isSuperAdmin}, hasViewAll: ${hasViewAll}`);

    let query: any = {};

    // Super Admin sees ALL tickets across all projects
    if (isSuperAdmin) {
      console.log(`🔍 [VIEW_TICKETS] Super Admin - showing all tickets`);
      // No filter - show everything
    } else if (hasViewAll) {
      // Other roles with TICKET_VIEW_ALL see only tickets from their assigned projects
      const assignedProjectIds = ((user as any).projects as any[])?.map(p => p._id) || [];
      if (assignedProjectIds.length > 0) {
        // Handle both string and ObjectId project IDs in metadata.projectId
        query['metadata.projectId'] = { 
          $in: [
            ...assignedProjectIds, 
            ...assignedProjectIds.map(id => id.toString())
          ] 
        };
        console.log(`🔍 [VIEW_TICKETS] User with TICKET_VIEW_ALL - filter by assigned projects:`, assignedProjectIds);
      } else {
        console.log(`🔍 [VIEW_TICKETS] User has no assigned projects - returning empty`);
        return res.status(200).json({
          success: true,
          data: [],
        });
      }
    } else {
      // Users without TICKET_VIEW_ALL should not access this endpoint
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view all tickets',
      });
    }

    console.log(`🔍 [VIEW_TICKETS] Final query:`, JSON.stringify(query));

    // Find tickets based on query
    const tickets = await Ticket.find(query)
      .populate('assignedTo', 'firstName lastName email')
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    console.log(`🔍 [VIEW_TICKETS] Tickets found: ${tickets.length}`);

    // Manually populate project data
    const ticketsWithProject = await Promise.all(
      tickets.map(async (ticket) => {
        const ticketObj = ticket.toObject();
        if (ticketObj.metadata?.projectId) {
          const project = await Project.findById(ticketObj.metadata.projectId).select('name code');
          if (project) {
            ticketObj.metadata.projectId = {
              _id: project._id,
              name: project.name,
              code: project.code,
            };
          }
        }
        return ticketObj;
      })
    );

    console.log(`📋 Retrieved ${tickets.length} tickets for View Tickets`);

    return res.status(200).json({
      success: true,
      data: ticketsWithProject,
    });

  } catch (error) {
    console.error('Get all tickets error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get tickets assigned to the current agent
 */
export const getAgentAssignedTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Build query to find tickets assigned to this agent
    const query: any = {
      assignedTo: userId,
    };

    // Filter by project if projectId is provided
    if (req.query.projectId) {
      query['metadata.projectId'] = req.query.projectId;
    }

    // Find all tickets assigned to this agent
    const tickets = await Ticket.find(query)
      .select('+submissionSource') // Explicitly select submissionSource field
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: tickets,
    });

  } catch (error) {
    console.error('Get agent assigned tickets error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned tickets',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Multer configuration for file uploads
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/tickets');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  }
});

/**
 * Get single ticket by ID
 */
export const getTicketById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get user to verify permissions
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id)
      .populate('assignedTo', 'firstName lastName email')
      .populate({
        path: 'threads.createdBy',
        select: 'firstName lastName email role',
        populate: {
          path: 'role',
          select: 'name code'
        }
      });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Check permissions:
    // 1. Student can view their own ticket (email matches)
    // 2. Agent can view tickets assigned to them
    // 3. Admin/Super Admin can view any ticket
    const isStudent = (user.role as any)?.code === 'STUDENT';
    const isAgent = ['AGENT', 'ADMIN', 'SUPERADMIN'].includes((user.role as any)?.code);
    const isAssignedAgent = ticket.assignedTo && ticket.assignedTo._id.toString() === userId;
    const ownsTicket = ticket.metadata?.studentEmail === user.email;

    if (isStudent && !ownsTicket) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this ticket',
      });
    }

    if (isAgent && !isAssignedAgent && !['ADMIN', 'SUPERADMIN'].includes((user.role as any)?.code)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this ticket',
      });
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });

  } catch (error) {
    console.error('Get ticket by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Add reply to ticket
 */
export const replyToTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get user to verify ownership
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id).populate('assignedTo', '_id email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Check if user has permission to reply:
    // 1. Student who created the ticket
    // 2. Assigned agent
    // 3. User with appropriate role permissions (Super Admin, Support Manager, etc.)
    const isTicketCreator = ticket.metadata?.studentEmail === user.email;
    const isAssignedAgent = ticket.assignedTo && ticket.assignedTo._id.toString() === userId;
    const userRole = user.role?.toString();
    
    // Get user's role to check permissions
    const populatedUser = await User.findById(userId).populate('role', 'code');
    const roleCode = (populatedUser?.role as any)?.code;
    const hasAgentPermission = ['SUPER_ADMIN', 'SUPPORT_MANAGER', 'AGENT', 'SUPPORT_AGENT'].includes(roleCode || '');
    
    if (!isTicketCreator && !isAssignedAgent && !hasAgentPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reply to this ticket',
      });
    }

    // Check if ticket is closed
    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reply to a closed ticket',
      });
    }

    // Handle file attachments
    const attachments: any[] = [];
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file: Express.Multer.File) => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: `/uploads/tickets/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size,
        });
      });
    }

    // Add thread to ticket
    if (!ticket.threads) {
      ticket.threads = [];
    }

    ticket.threads.push({
      message,
      createdBy: userId,
      attachments,
      createdAt: new Date(),
    } as any);

    ticket.updatedAt = new Date();
    await ticket.save();

    // Populate the new thread's createdBy field with role information
    await ticket.populate({
      path: 'threads.createdBy',
      select: 'firstName lastName email role',
      populate: {
        path: 'role',
        select: 'name code'
      }
    });

    console.log(`✅ Reply added to ticket: ${ticket._id} by user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Reply added successfully',
      data: ticket.threads,
    });

  } catch (error) {
    console.error('Reply to ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add reply',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Close ticket by student
 */
export const closeTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get user to verify ownership
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find ticket
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Verify student owns this ticket
    if (ticket.metadata?.studentEmail !== user.email) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to close this ticket',
      });
    }

    // Check if ticket is already closed
    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Ticket is already closed',
      });
    }

    // Get project to check if student can close tickets
    const project = await Project.findById(ticket.metadata?.projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check if student is allowed to close tickets
    if (!project.configuration?.ticketSubmissionSettings?.allowStudentToCloseTicket) {
      return res.status(403).json({
        success: false,
        message: 'Students are not allowed to close tickets for this project',
      });
    }

    // Close the ticket
    ticket.status = 'closed';
    ticket.updatedAt = new Date();

    // Add system thread
    if (!ticket.threads) {
      ticket.threads = [];
    }

    ticket.threads.push({
      message: 'Ticket closed by student',
      createdBy: userId,
      isSystemMessage: true,
      createdAt: new Date(),
    } as any);

    await ticket.save();

    console.log(`✅ Ticket closed by student: ${ticket._id} by ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Ticket closed successfully',
      data: ticket,
    });

  } catch (error) {
    console.error('Close ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to close ticket',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Authorization check
    if (!await canModifyTicket(userId, ticket, user)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this ticket',
      });
    }

    const oldStatus = ticket.status;
    ticket.status = status;
    ticket.updatedAt = new Date();
    await ticket.save();
    
    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          userEmail: user.email,
          action: 'update',
          entity: 'ticket',
          entityId: ticket._id.toString(),
          entityName: ticket.title,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [{ field: 'status', oldValue: oldStatus, newValue: status }],
          description: `Ticket ${ticket.ticketNumber} status changed from ${oldStatus} to ${status}`,
          req
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update status',
    });
  }
};

/**
 * Update ticket category
 */
export const updateTicketCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Authorization check
    if (!await canModifyTicket(userId, ticket, user)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this ticket',
      });
    }

    const oldCategory = ticket.category;
    ticket.category = category;
    ticket.updatedAt = new Date();
    await ticket.save();
    
    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          userEmail: user.email,
          action: 'update',
          entity: 'ticket',
          entityId: ticket._id.toString(),
          entityName: ticket.title,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [{ field: 'category', oldValue: oldCategory, newValue: category }],
          description: `Ticket ${ticket.ticketNumber} category changed from ${oldCategory} to ${category}`,
          req
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update category',
    });
  }
};

/**
 * Update ticket priority
 */
export const updateTicketPriority = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Authorization check
    if (!await canModifyTicket(userId, ticket, user)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this ticket',
      });
    }

    const oldPriority = ticket.priority;
    ticket.priority = priority;
    ticket.updatedAt = new Date();
    await ticket.save();
    
    // Log activity
    if (user) {
      try {
        const projectData = await Project.findById(ticket.metadata?.projectId);
        await logActivity({
          userId: user.userId,
          userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          userEmail: user.email,
          action: 'update',
          entity: 'ticket',
          entityId: ticket._id.toString(),
          entityName: ticket.title,
          projectId: ticket.metadata?.projectId,
          projectName: projectData?.name,
          changes: [{ field: 'priority', oldValue: oldPriority, newValue: priority }],
          description: `Ticket ${ticket.ticketNumber} priority changed from ${oldPriority} to ${priority}`,
          req
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Update priority error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update priority',
    });
  }
};

/**
 * Add tag to ticket
 */
export const addTicketTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    if (!ticket.tags) {
      ticket.tags = [];
    }

    if (!ticket.tags.includes(tag)) {
      ticket.tags.push(tag);
      ticket.updatedAt = new Date();
      await ticket.save();
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Add tag error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add tag',
    });
  }
};

/**
 * Remove tag from ticket
 */
export const removeTicketTag = async (req: Request, res: Response) => {
  try {
    const { id, tag } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    if (ticket.tags) {
      ticket.tags = ticket.tags.filter(t => t !== tag);
      ticket.updatedAt = new Date();
      await ticket.save();
    }

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Remove tag error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove tag',
    });
  }
};

/**
 * Add internal note to ticket
 */
export const addInternalNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = (req as any).user?.userId;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!ticket.internalNotes) {
      ticket.internalNotes = [];
    }

    ticket.internalNotes.push({
      _id: new mongoose.Types.ObjectId(),
      note,
      createdBy: {
        firstName: user.firstName,
        lastName: user.lastName,
      },
      createdAt: new Date(),
    } as any);

    ticket.updatedAt = new Date();
    await ticket.save();

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Add note error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add internal note',
    });
  }
};

/**
 * Escalate ticket
 */
export const escalateTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { escalateTo, reason } = req.body;
    const userId = (req as any).user?.userId;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Extract user ID from escalation level format: "policyId-levelName-userId"
    let escalatedUserId = escalateTo;
    if (typeof escalateTo === 'string' && escalateTo.includes('-')) {
      const parts = escalateTo.split('-');
      // Last part is the user ID
      escalatedUserId = parts[parts.length - 1];
    }

    const escalatedUser = await User.findById(escalatedUserId);
    if (!escalatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Escalation user not found',
      });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found',
      });
    }

    if (!ticket.escalationHistory) {
      ticket.escalationHistory = [];
    }

    ticket.escalationHistory.push({
      _id: new mongoose.Types.ObjectId(),
      escalatedTo: new mongoose.Types.ObjectId(escalatedUserId),
      escalatedBy: new mongoose.Types.ObjectId(userId),
      reason,
      escalatedAt: new Date(),
    } as any);

    // Update assigned agent
    ticket.assignedTo = new mongoose.Types.ObjectId(escalatedUserId);
    ticket.updatedAt = new Date();
    await ticket.save();

    return res.status(200).json({
      success: true,
      message: 'Ticket escalated successfully',
      data: ticket,
    });
  } catch (error) {
    console.error('Escalate ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to escalate ticket',
    });
  }
};

/**
 * Assign ticket to agent
 */
export const assignTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    // Get current user info from auth middleware
    const currentUser = await User.findById((req as any).user.userId).populate('role');
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Validate ticket exists
    const ticket = await Ticket.findById(id).populate('metadata.projectId', 'name');
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Validate agent exists and is active
    const agent = await User.findById(agentId).populate('role');
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    if (!agent.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign to inactive agent',
      });
    }

    // Store old assignment for logging
    const oldAssignedTo = ticket.assignedTo;

    // Update ticket assignment
    ticket.assignedTo = new mongoose.Types.ObjectId(agentId);
    ticket.updatedAt = new Date();
    await ticket.save();

    // Log activity
    const agentName = `${agent.firstName} ${agent.lastName}`;
    const projectInfo = ticket.metadata?.projectId as any;
    
    await logActivity({
      userId: currentUser._id.toString(),
      userName: `${currentUser.firstName} ${currentUser.lastName}`,
      userEmail: currentUser.email,
      action: 'update',
      entity: 'ticket',
      entityId: ticket._id.toString(),
      entityName: `Ticket #${ticket.ticketNumber}`,
      changes: [{
        field: 'assignedTo',
        oldValue: oldAssignedTo ? oldAssignedTo.toString() : 'Unassigned',
        newValue: agentName
      }],
      description: `Assigned ticket #${ticket.ticketNumber} to ${agentName}`,
      req,
      projectId: projectInfo?._id?.toString(),
      projectName: projectInfo?.name,
      role: (currentUser.role as any)?.name,
      metadata: {
        ticketId: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        agentId: agent._id.toString(),
        agentName: agentName,
        agentEmail: agent.email
      }
    });

    // Populate assignedTo for response
    const updatedTicket = await Ticket.findById(id)
      .populate('assignedTo', 'firstName lastName email')
      .populate('metadata.projectId', 'name');

    return res.status(200).json({
      success: true,
      message: 'Ticket assigned successfully',
      data: updatedTicket,
    });
  } catch (error) {
    console.error('Assign ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign ticket',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all available tags
 */
export const getAllTags = async (req: Request, res: Response) => {
  try {
    const tickets = await Ticket.find({ tags: { $exists: true, $ne: [] } }).select('tags');
    const tagsSet = new Set<string>();
    
    tickets.forEach(ticket => {
      if (ticket.tags) {
        ticket.tags.forEach(tag => tagsSet.add(tag));
      }
    });

    const tags = Array.from(tagsSet).sort();

    return res.status(200).json({
      success: true,
      data: tags,
    });
  } catch (error) {
    console.error('Get tags error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tags',
    });
  }
};

/**
 * Bulk update tickets by tags
 */
export const bulkUpdateByTags = async (req: Request, res: Response) => {
  try {
    const { tags, updates } = req.body;

    const result = await Ticket.updateMany(
      { tags: { $in: tags } },
      { 
        $set: { 
          ...updates,
          updatedAt: new Date()
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} tickets`,
      data: result,
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk update tickets',
    });
  }
};

/**
 * Get dashboard statistics for the logged-in user
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const user = await User.findById(userId).populate('role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const roleCode = (user.role as any)?.code;
    const userPermissions = (user.role as any)?.permissions || [];

    // Build query based on user permissions (not role)
    let query: any = {};
    
    // Check permissions instead of hardcoded role checks
    const hasViewAllTickets = userPermissions.includes('TICKET_VIEW_ALL');
    const hasViewOwnTickets = userPermissions.includes('TICKET_VIEW_OWN');
    
    if (hasViewAllTickets) {
      // Users with TICKET_VIEW_ALL see all tickets (no query filter)
    } else if (hasViewOwnTickets) {
      // Users with TICKET_VIEW_OWN see tickets from their mapped projects OR assigned to them
      const userProjects = user.projects || [];
      
      if (userProjects.length > 0) {
        // User mapped to specific projects - show tickets from those projects
        const projectIds = userProjects.map(p => p.toString());
        query.$or = [
          { 'metadata.projectId': { $in: projectIds } },
          { assignedTo: userId },
          { 'metadata.studentEmail': user.email } // Also show tickets they created as student
        ];
      } else {
        // User not mapped to any project - show only assigned tickets or created by them
        query.$or = [
          { assignedTo: userId },
          { 'metadata.studentEmail': user.email }
        ];
      }
    } else {
      // No ticket view permissions - show only tickets created by this user
      query['metadata.studentEmail'] = user.email;
    }

    // Get total tickets count
    const total = await Ticket.countDocuments(query);

    // Get pending tickets count (open, in-progress, pending statuses)
    const pending = await Ticket.countDocuments({
      ...query,
      status: { $in: ['open', 'in-progress', 'pending'] }
    });

    // Get resolved tickets count
    const resolved = await Ticket.countDocuments({
      ...query,
      status: 'resolved'
    });

    // Get recent activity (last 5 tickets)
    const recentActivity = await Ticket.find(query)
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('ticketNumber title status updatedAt')
      .lean();

    const formattedActivity = recentActivity.map(ticket => ({
      ticketId: ticket._id.toString(),
      title: ticket.title,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
    }));

    return res.status(200).json({
      total,
      pending,
      resolved,
      recentActivity: formattedActivity,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
    });
  }
};

/**
 * Get project-specific dashboard statistics
 * Returns ticket counts by priority and SLA status for a specific project
 */
export const getProjectDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required',
      });
    }

    const user = await User.findById(userId).populate('role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const userPermissions = (user.role as any)?.permissions || [];
    const userRole = user.role as any;
    const isAgent = userRole?.isAgent || false;

    // Check permissions - handle both string codes and ObjectId references
    const checkPermission = async (permCode: string): Promise<boolean> => {
      // First check if permission exists as string code
      const hasStringPermission = userPermissions.some((p: any) => {
        if (typeof p === 'string') {
          return p === permCode;
        }
        return false;
      });
      
      if (hasStringPermission) {
        return true;
      }
      
      // Check by ObjectId - look up the permission and compare IDs
      const perm = await Permission.findOne({ $or: [{ code: permCode }, { name: permCode }] });
      if (!perm) {
        return false;
      }
      
      const permId = perm._id.toString();
      return userPermissions.some((p: any) => {
        try {
          return p.toString() === permId;
        } catch (e) {
          return false;
        }
      });
    };

    console.log('🔍 Project Dashboard Stats Debug:', {
      userId,
      userEmail: user.email,
      roleName: userRole?.name,
      isAgent,
      projectId,
      permissionCount: userPermissions.length
    });

    // Build query based on user permissions
    let query: any = { 'metadata.projectId': projectId };
    
    const hasViewAllTickets = await checkPermission('TICKET_VIEW_ALL');
    
    console.log('🔑 Permission Check Result:', { hasViewAllTickets });
    
    // For agents or users with TICKET_VIEW_OWN, show only their assigned tickets
    if (hasViewAllTickets) {
      // Users with TICKET_VIEW_ALL see all tickets for the project
      console.log('✅ User has TICKET_VIEW_ALL - showing all project tickets');
    } else if (isAgent || await checkPermission('TICKET_VIEW_OWN')) {
      // Agents see only their assigned tickets within the project
      const userObjectId = new mongoose.Types.ObjectId(userId);
      query.assignedTo = userObjectId;
      console.log('✅ User is agent or has TICKET_VIEW_OWN - showing assigned tickets only');
      console.log('Query filter:', JSON.stringify(query, null, 2));
    } else {
      // No ticket view permissions - show only tickets created by this user
      query['metadata.studentEmail'] = user.email;
      console.log('⚠️ User has no ticket view permissions - showing only created tickets');
    }

    // Get total tickets count
    const totalTickets = await Ticket.countDocuments(query);

    console.log('📊 Dashboard Stats Results:', {
      totalTickets,
      query
    });

    // Get counts by priority
    const highPriority = await Ticket.countDocuments({
      ...query,
      priority: 'high'
    });

    const mediumPriority = await Ticket.countDocuments({
      ...query,
      priority: 'medium'
    });

    const lowPriority = await Ticket.countDocuments({
      ...query,
      priority: 'low'
    });

    // Calculate SLA status
    // For now, count resolved vs open/in-progress tickets as SLA metric
    // TODO: Add proper SLA fields (sla, resolvedAt) to Ticket model for accurate tracking
    const resolvedTickets = await Ticket.countDocuments({
      ...query,
      status: 'resolved'
    });

    const openOrInProgressTickets = await Ticket.countDocuments({
      ...query,
      status: { $in: ['open', 'in-progress', 'pending'] }
    });

    // Simplified SLA calculation - resolved = within SLA, open/pending = outside SLA
    const withinSLA = resolvedTickets;
    const outsideSLA = openOrInProgressTickets;

    return res.status(200).json({
      success: true,
      data: {
        totalTickets,
        highPriority,
        mediumPriority,
        lowPriority,
        withinSLA,
        outsideSLA,
      },
    });
  } catch (error) {
    console.error('Project dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch project dashboard statistics',
    });
  }
};

/**
 * Create offline ticket submission (by agent on behalf of student)
 */
export const createOfflineTicket = async (req: Request, res: Response) => {
  try {
    const agent = (req as any).user;
    
    console.log('=== OFFLINE TICKET SUBMISSION ===');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    
    const {
      studentId,
      description,
      category,
      priority,
      projectId,
      submissionType,
      status: initialStatus,
      resolvedAtCreation,
      escalateTo,
      escalationReason,
    } = req.body;

    console.log('Extracted values:');
    console.log('  studentId:', studentId);
    console.log('  description:', description);
    console.log('  category:', category);
    console.log('  projectId:', projectId);

    // Validate required fields
    if (!studentId || !description || !category || !projectId) {
      console.log('❌ Validation failed - missing fields');
      console.log('  studentId present:', !!studentId);
      console.log('  description present:', !!description);
      console.log('  category present:', !!category);
      console.log('  projectId present:', !!projectId);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Verify student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Generate ticket number
    const ticketCount = await Ticket.countDocuments();
    const ticketNumber = `TKT-${String(ticketCount + 1).padStart(6, '0')}`;

    // Handle file attachments
    const attachments: any[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        attachments.push({
          fieldName: 'offline-attachment',
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
        });
      }
    }

    // Determine initial status
    const ticketStatus = resolvedAtCreation === 'true' ? 'resolved' : (initialStatus || 'open');

    // Determine assignment: If escalated, assign to escalateTo; otherwise assign to creating agent
    const assignedToAgentId = escalateTo || agent.userId;

    // Create ticket (priority defaults to 'medium' if not provided - agent will set it later based on SLA)
    const ticket = await Ticket.create({
      ticketNumber,
      title: description.substring(0, 100), // Use first 100 chars of description as title
      description,
      category,
      priority: priority || 'medium', // Default to medium, agent will update based on SLA rules
      status: ticketStatus,
      createdBy: new mongoose.Types.ObjectId(studentId), // Ticket owned by student
      assignedTo: new mongoose.Types.ObjectId(assignedToAgentId), // Assign to escalated agent or creating agent
      submissionSource: 'offline', // Mark as offline submission
      attachments,
      metadata: {
        projectId,
        submissionType: submissionType || 'offline',
        studentEmail: student.email,
        studentName: `${student.firstName} ${student.lastName}`,
        studentPhone: (student as any).phone,
        createdByAgent: agent.userId,
        createdByAgentEmail: agent.email,
        resolvedAtCreation: resolvedAtCreation === 'true',
      },
      threads: [],
      escalationHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add system message about offline creation
    ticket.threads!.push({
      message: `Ticket created by ${agent.firstName} ${agent.lastName} (Agent) on behalf of student during offline support.`,
      createdBy: new mongoose.Types.ObjectId(agent.userId),
      isSystemMessage: true,
      attachments: [],
      createdAt: new Date(),
    } as any);

    // Add assignment message
    if (!escalateTo) {
      // Ticket assigned to creating agent
      ticket.threads!.push({
        message: `Ticket assigned to ${agent.firstName} ${agent.lastName} (Creating Agent).`,
        createdBy: new mongoose.Types.ObjectId(agent.userId),
        isSystemMessage: true,
        attachments: [],
        createdAt: new Date(),
      } as any);
    }

    // If marked as resolved, add resolution message
    if (resolvedAtCreation === 'true') {
      ticket.threads!.push({
        message: `Issue resolved during offline support session by ${agent.firstName} ${agent.lastName}.`,
        createdBy: new mongoose.Types.ObjectId(agent.userId),
        isSystemMessage: true,
        attachments: [],
        createdAt: new Date(),
      } as any);
    }

    // If escalated, add escalation record
    if (escalateTo && escalationReason) {
      ticket.escalationHistory!.push({
        escalatedTo: new mongoose.Types.ObjectId(escalateTo),
        escalatedBy: new mongoose.Types.ObjectId(agent.userId),
        reason: escalationReason,
        escalatedAt: new Date(),
      } as any);

      ticket.threads!.push({
        message: `Ticket escalated to another agent. Reason: ${escalationReason}`,
        createdBy: new mongoose.Types.ObjectId(agent.userId),
        isSystemMessage: true,
        attachments: [],
        createdAt: new Date(),
      } as any);
    }

    await ticket.save();

    console.log(`✅ Offline ticket created: ${ticket._id} | ${ticketNumber} | Agent: ${agent.email} | Student: ${student.email}`);
    
    // Log activity
    try {
      const projectData = await Project.findById(projectId);
      await logActivity({
        userId: agent.userId,
        userName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim(),
        userEmail: agent.email,
        action: 'create',
        entity: 'ticket',
        entityId: ticket._id.toString(),
        entityName: ticket.title,
        projectId: projectId,
        projectName: projectData?.name,
        description: `Offline ticket ${ticketNumber} created on behalf of ${student.firstName} ${student.lastName}`,
        req,
        metadata: { 
          ticketNumber, 
          source: 'offline', 
          studentId, 
          resolvedAtCreation: resolvedAtCreation === 'true' 
        }
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.status(201).json({
      success: true,
      message: 'Offline ticket created successfully',
      data: {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      },
    });

  } catch (error: any) {
    console.error('Create offline ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create offline ticket',
      error: error.message,
    });
  }
};

/**
 * Get assignable agents for ticket assignment
 * Returns users with isAgent=true roles from the same project(s) as the current user
 */
export const getAssignableAgents = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    // Get current user with their projects
    const currentUser = await User.findById(userId).populate('role');
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const userProjectIds = (currentUser.projects || []).map((p: any) => 
      typeof p === 'string' ? p : p._id.toString()
    );
    
    console.log('🔍 Fetching assignable agents for user:', {
      userId,
      email: currentUser.email,
      projects: userProjectIds
    });
    
    // Find all roles where isAgent = true
    const agentRoles = await Role.find({ isAgent: true, isActive: true });
    const agentRoleIds = agentRoles.map(role => role._id.toString());
    
    console.log('📋 Found agent roles:', agentRoles.map(r => r.name));
    
    // Find all active users who:
    // 1. Have a role with isAgent = true
    // 2. Share at least one project with the current user
    const agents = await User.find({
      isActive: true,
      role: { $in: agentRoleIds },
      projects: { $in: userProjectIds }
    })
    .populate('role', 'name isAgent')
    .select('_id firstName lastName email role projects')
    .sort({ firstName: 1, lastName: 1 });
    
    console.log('✅ Found assignable agents:', {
      count: agents.length,
      agents: agents.map(a => `${a.firstName} ${a.lastName} (${(a.role as any)?.name})`)
    });
    
    return res.status(200).json({
      success: true,
      data: agents,
    });
    
  } catch (error: any) {
    console.error('Get assignable agents error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch assignable agents',
      error: error.message,
    });
  }
};
