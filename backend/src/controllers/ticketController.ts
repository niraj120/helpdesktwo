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

// Helper: Convert status code to name for emails/display
const getStatusName = (statusCode: number): string => {
  const statusMap: Record<number, string> = {
    1: 'Open',
    2: 'In Progress',
    3: 'On Hold',
    4: 'Resolved',
    5: 'Closed'
  };
  return statusMap[statusCode] || `Status ${statusCode}`;
};

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
 * Helper function to track changes in ticket history
 */
const trackChange = async (
  ticket: any,
  field: string,
  oldValue: string,
  newValue: string,
  userId: string,
  changeType: 'update' | 'add' | 'remove' = 'update'
) => {
  if (!ticket.changeHistory) {
    ticket.changeHistory = [];
  }

  ticket.changeHistory.push({
    _id: new mongoose.Types.ObjectId(),
    field,
    oldValue: oldValue || 'None',
    newValue: newValue || 'None',
    changedBy: userId,
    changedAt: new Date(),
    changeType,
  });
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
        status: { $in: [1, 2, 3] } // 1=Open, 2=In Progress, 3=On Hold
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
          
          // Check feedback triggers for student registration (non-blocking)
          (async () => {
            try {
              const { checkAndTriggerFeedback } = require('../services/feedbackTriggerService');
              await checkAndTriggerFeedback('student_registered', {
                projectId: projectId,
                studentId: newStudent._id.toString()
              });
            } catch (error) {
              console.error('Error checking student_registered feedback triggers:', error);
            }
          })();
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
      status: 1, // 1 = Open (numeric code)
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
    
    // Check feedback triggers for ticket creation (non-blocking)
    (async () => {
      try {
        const { checkAndTriggerFeedback } = require('../services/feedbackTriggerService');
        await checkAndTriggerFeedback('ticket_created', {
          projectId: projectId,
          ticketId: ticket._id.toString()
        });
      } catch (error) {
        console.error('Error checking ticket_created feedback triggers:', error);
      }
    })();
    
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
          entityName: ticket.subject,
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
            ticket.subject,
            projectId,
            {
              studentName: studentName,
              status: getStatusName(ticket.status),
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
      .populate('category', 'name code')
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
 * - Users with TICKET_VIEW_ALL: Tickets from their assigned projects
 * - Agents (isAgent=true): Tickets assigned to them in their assigned projects
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
    const isAgent = role?.isAgent || false;
    const permissions = role?.permissions || [];
    const permissionCodes = permissions.map((p: any) => p.code).filter((c: any) => c);
    const hasViewAll = permissionCodes.includes('TICKET_VIEW_ALL');
    const hasViewOwn = permissionCodes.includes('TICKET_VIEW_OWN');

    console.log(`🔍 [VIEW_TICKETS] User: ${user.email}`);
    console.log(`🔍 [VIEW_TICKETS] Role: ${role?.name} (${role?.code})`);
    console.log(`🔍 [VIEW_TICKETS] isSuperAdmin: ${isSuperAdmin}, hasViewAll: ${hasViewAll}, isAgent: ${isAgent}, hasViewOwn: ${hasViewOwn}`);

    let query: any = {};
    const assignedProjectIds = ((user as any).projects as any[])?.map(p => p._id) || [];

    // Super Admin sees ALL tickets across all projects
    if (isSuperAdmin) {
      console.log(`🔍 [VIEW_TICKETS] Super Admin - showing all tickets`);
      // No filter - show everything
    } else if (hasViewAll) {
      // Users with TICKET_VIEW_ALL see tickets from their assigned projects
      if (assignedProjectIds.length > 0) {
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
    } else if (isAgent || hasViewOwn) {
      // Agents or users with TICKET_VIEW_OWN see tickets assigned to them within their projects
      if (assignedProjectIds.length > 0) {
        query = {
          $and: [
            { 'metadata.projectId': { $in: [...assignedProjectIds, ...assignedProjectIds.map(id => id.toString())] } },
            { 
              $or: [
                { assignedTo: new mongoose.Types.ObjectId(userId) },
                { 'metadata.studentEmail': user.email } // Also show tickets created by them
              ]
            }
          ]
        };
        console.log(`🔍 [VIEW_TICKETS] Agent/ViewOwn user - showing assigned tickets in their projects`);
      } else {
        // No projects assigned - show only assigned tickets
        query = { 
          $or: [
            { assignedTo: new mongoose.Types.ObjectId(userId) },
            { 'metadata.studentEmail': user.email }
          ]
        };
        console.log(`🔍 [VIEW_TICKETS] Agent with no projects - showing only assigned tickets`);
      }
    } else {
      // Users without proper permissions - show only tickets they created
      query['metadata.studentEmail'] = user.email;
      console.log(`🔍 [VIEW_TICKETS] Regular user - showing only created tickets`);
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
      })
      .populate({
        path: 'internalNotes.createdBy',
        select: 'firstName lastName email'
      })
      .populate('escalationHistory.escalatedTo', 'firstName lastName email')
      .populate('escalationHistory.escalatedBy', 'firstName lastName email')
      .populate('changeHistory.changedBy', 'firstName lastName email');

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

    // Remove internal notes if user is a student (not staff)
    const ticketData = ticket.toObject();
    if (isStudent) {
      ticketData.internalNotes = []; // Hide internal notes from students
    }

    return res.status(200).json({
      success: true,
      data: ticketData,
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

    // Check if ticket is closed (status 5 = closed)
    if (ticket.status === 5) {
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

    // Add thread to ticket using atomic update to avoid full document validation
    const newThread = {
      message,
      createdBy: new mongoose.Types.ObjectId(userId),
      attachments,
      createdAt: new Date(),
    };

    const updatedTicket = await Ticket.findByIdAndUpdate(
      id,
      {
        $push: { threads: newThread },
        $set: { updatedAt: new Date() }
      },
      { 
        new: true,
        runValidators: false // Skip validation to avoid issues with missing subject field
      }
    ).populate({
      path: 'threads.createdBy',
      select: 'firstName lastName email role',
      populate: {
        path: 'role',
        select: 'name code'
      }
    });

    if (!updatedTicket) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update ticket',
      });
    }

    console.log(`✅ Reply added to ticket: ${updatedTicket._id} by user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Reply added successfully',
      data: updatedTicket.threads,
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

    // Check if ticket is already closed (status 5 = closed)
    if (ticket.status === 5) {
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

    // Close the ticket (5 = closed)
    ticket.status = 5;
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

    // Validate status is a valid number (1-5)
    const statusNum = Number(status);
    const validStatusCodes = [1, 2, 3, 4, 5]; // 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
    console.log(`🔍 Attempting to change status to: ${statusNum} (type: ${typeof statusNum})`);
    
    if (isNaN(statusNum) || !validStatusCodes.includes(statusNum)) {
      console.log(`❌ Invalid status: "${status}". Valid codes: ${validStatusCodes.join(', ')}`);
      return res.status(400).json({
        success: false,
        message: `Invalid status code "${status}". Must be one of: ${validStatusCodes.join(', ')} (1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed)`
      });
    }

    const oldStatus = ticket.status;
    ticket.status = statusNum;
    ticket.updatedAt = new Date();
    
    // Track change in history
    await trackChange(ticket, 'Status', String(oldStatus), String(statusNum), userId);
    
    await ticket.save();
    
    // Check feedback triggers for status change
    try {
      const Status = require('../models/Status').Status;
      console.log(`🔍 Looking up status with code: ${statusNum} (type: ${typeof statusNum}) for project: ${ticket.metadata?.projectId}`);
      
      const statusDoc = await Status.findOne({ 
        code: statusNum, 
        projectId: ticket.metadata?.projectId 
      });
      
      console.log(`📊 Status Doc found: ${statusDoc ? 'YES' : 'NO'}`);
      if (statusDoc) {
        console.log(`   Name: ${statusDoc.name}, Code: ${statusDoc.code}, isClosed: ${statusDoc.isClosed}`);
      }
      
      const { checkAndTriggerFeedback } = require('../services/feedbackTriggerService');
      
      // Trigger for status change
      await checkAndTriggerFeedback('ticket_status_changed', {
        projectId: ticket.metadata?.projectId,
        ticketId: ticket._id.toString(),
        statusId: statusDoc?._id.toString()
      });
      
      // Also trigger for ticket closed if status is closed
      if (statusDoc && statusDoc.isClosed) {
        console.log(`🚪 Ticket is being closed - triggering ticket_closed feedback`);
        await checkAndTriggerFeedback('ticket_closed', {
          projectId: ticket.metadata?.projectId,
          ticketId: ticket._id.toString()
        });
      } else {
        console.log(`ℹ️  Status is not marked as closed (isClosed: ${statusDoc?.isClosed})`);
      }
    } catch (feedbackError) {
      console.error('Error checking feedback triggers:', feedbackError);
      // Don't fail the status update if feedback fails
    }
    
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
          entityName: ticket.subject,
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
    
    // Track change in history
    await trackChange(ticket, 'Category', oldCategory || 'None', category, userId);
    
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
          entityName: ticket.subject,
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
    // Convert priority to uppercase code (e.g., MEDIUM -> MEDIUM, medium -> MEDIUM)
    ticket.priority = priority.toUpperCase().trim();
    ticket.updatedAt = new Date();
    
    // Track change in history
    await trackChange(ticket, 'Priority', oldPriority, ticket.priority, userId);
    
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
          entityName: ticket.subject,
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
    const userId = (req as any).user?.userId;

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
      
      // Track change in history
      await trackChange(ticket, 'Tags', '', tag, userId, 'add');
      
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
    const userId = (req as any).user?.userId;

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
      
      // Track change in history
      await trackChange(ticket, 'Tags', tag, '', userId, 'remove');
      
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
      createdBy: userId, // Store userId directly as ObjectId reference
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
    const user = (req as any).user;

    console.log(`🔄 Escalation attempt - User: ${userId}, Ticket: ${id}`);

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    // Get user details
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found',
      });
    }

    // Check if user has permission to escalate
    // Allow if: user is an agent (has isAgent role)
    const userRole = currentUser.role as any;
    const isAgent = userRole?.isAgent || false;
    
    console.log(`🔍 Escalation auth check:`, {
      userId,
      userEmail: currentUser.email,
      roleName: userRole?.name,
      roleCode: userRole?.code,
      isAgent,
      ticketAssignedTo: ticket.assignedTo?.toString(),
      isAssignedAgent: ticket.assignedTo?.toString() === userId
    });

    // Allow escalation if user is an agent
    if (!isAgent) {
      console.log(`❌ Escalation denied: User ${userId} (${currentUser.email}) is not an agent`);
      return res.status(403).json({
        success: false,
        message: 'Only agents can escalate tickets',
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

    console.log(`✅ Ticket ${id} escalated by ${currentUser.email} to ${escalatedUser.email}`);

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

    // Check feedback triggers for agent assignment (non-blocking)
    (async () => {
      try {
        const { checkAndTriggerFeedback } = require('../services/feedbackTriggerService');
        await checkAndTriggerFeedback('agent_assigned', {
          projectId: projectInfo?._id?.toString(),
          ticketId: ticket._id.toString(),
          agentId: agentId
        });
      } catch (error) {
        console.error('Error checking agent_assigned feedback triggers:', error);
      }
    })();

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
      status: { $in: [1, 2, 3] } // 1=Open, 2=In Progress, 3=On Hold
    });

    // Get resolved tickets count
    const resolved = await Ticket.countDocuments({
      ...query,
      status: 4 // 4=Resolved
    });

    // Get recent activity (last 5 tickets)
    const recentActivity = await Ticket.find(query)
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('ticketNumber title status updatedAt')
      .lean();

    const formattedActivity = recentActivity.map(ticket => ({
      ticketId: ticket._id.toString(),
      subject: ticket.subject,
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
    
    // Check if user is a student (students create tickets, not get assigned)
    const isStudent = userRole?.code === 'STUDENT';
    
    // For agents or users with TICKET_VIEW_OWN, show only their assigned tickets
    if (hasViewAllTickets) {
      // Users with TICKET_VIEW_ALL see all tickets for the project
      console.log('✅ User has TICKET_VIEW_ALL - showing all project tickets');
    } else if (isStudent && await checkPermission('TICKET_VIEW_OWN')) {
      // Students see only tickets they created (not assigned)
      query['metadata.studentEmail'] = user.email;
      console.log('✅ Student user - showing tickets created by:', user.email);
      console.log('Query filter:', JSON.stringify(query, null, 2));
    } else if (isAgent || await checkPermission('TICKET_VIEW_OWN')) {
      // Agents see only their assigned tickets within the project
      const userObjectId = new mongoose.Types.ObjectId(userId);
      query.assignedTo = userObjectId;
      console.log('✅ Agent/Staff user - showing assigned tickets only');
      console.log('Query filter:', JSON.stringify(query, null, 2));
    } else {
      // No ticket view permissions - show only tickets created by this user
      query['metadata.studentEmail'] = user.email;
      console.log('⚠️ User has no ticket view permissions - showing only created tickets');
    }

    // Get Priority model for SLA calculations
    const Priority = require('../models/master-data/Priority').Priority;
    
    // First, check if ANY priorities exist in the database
    const allPriorities = await Priority.find({}).limit(10);
    console.log('🔍 Total priorities in database:', await Priority.countDocuments({}));
    console.log('🔍 Sample priorities:', allPriorities.map((p: any) => ({
      name: p.name,
      code: p.code,
      projectId: p.projectId?.toString(),
      projectIds: p.projectIds?.map((id: any) => id.toString()),
      isActive: p.isActive
    })));
    
    // Get all priorities for this project to calculate SLA deadlines
    // Try multiple query strategies
    console.log('🔍 Searching for priorities with projectId:', projectId);
    
    let priorities = await Priority.find({ 
      $or: [
        { projectId: projectId },
        { projectIds: { $in: [projectId] } },
        { projectId: new mongoose.Types.ObjectId(projectId as string) },
        { projectIds: new mongoose.Types.ObjectId(projectId as string) }
      ],
      isActive: true 
    });
    
    // If no priorities found with isActive filter, try without it
    if (priorities.length === 0) {
      console.log('⚠️ No active priorities found, trying without isActive filter...');
      priorities = await Priority.find({ 
        $or: [
          { projectId: projectId },
          { projectIds: { $in: [projectId] } },
          { projectId: new mongoose.Types.ObjectId(projectId as string) },
          { projectIds: new mongoose.Types.ObjectId(projectId as string) }
        ]
      });
    }
    
    console.log('📋 Found priorities for project:', priorities.length);
    console.log('📋 Available priorities:', priorities.map((p: any) => `${p.name} (${p.code}) [ID: ${p._id}] - Resolution: ${p.resolutionTime?.value} ${p.resolutionTime?.unit}`));
    
    const priorityMap = new Map(priorities.map((p: any) => [p.code.toUpperCase().trim(), p]));
    const priorityIdMap = new Map(priorities.map((p: any) => [p._id.toString(), p]));

    // Get ObjectIds for each priority level for matching
    const highPriorityIds = priorities
      .filter((p: any) => ['HIGH', 'CRITICAL'].includes(p.code.toUpperCase()))
      .map((p: any) => p._id);
    
    const mediumPriorityIds = priorities
      .filter((p: any) => p.code.toUpperCase() === 'MEDIUM')
      .map((p: any) => p._id);
    
    const lowPriorityIds = priorities
      .filter((p: any) => p.code.toUpperCase() === 'LOW')
      .map((p: any) => p._id);

    console.log('🎯 Priority ObjectIds:', {
      high: highPriorityIds.map((id: any) => id.toString()),
      medium: mediumPriorityIds.map((id: any) => id.toString()),
      low: lowPriorityIds.map((id: any) => id.toString())
    });

    // Debug: Get actual tickets to see priority values
    const sampleTickets = await Ticket.find(query).limit(5).select('ticketNumber priority').lean();
    console.log('🔍 Sample tickets with priority values:', sampleTickets.map(t => ({
      ticketNumber: t.ticketNumber,
      priority: t.priority,
      priorityType: typeof t.priority,
      priorityString: String(t.priority)
    })));

    // Optimized: Use single aggregate query with SLA calculation
    const stats = await Ticket.aggregate([
      { $match: query },
      {
        $facet: {
          total: [{ $count: 'count' }],
          // Priority counts - match by ObjectId, string codes, or numeric values
          highPriority: [{ 
            $match: { 
              $or: [
                { priority: { $in: highPriorityIds } }, // Match by ObjectId
                { priority: { $regex: /^(high|critical)$/i } }, // Match by string
                { priority: { $in: [3, 4, '3', '4'] } } // Match by number
              ]
            } 
          }, { $count: 'count' }],
          mediumPriority: [{ 
            $match: { 
              $or: [
                { priority: { $in: mediumPriorityIds } }, // Match by ObjectId
                { priority: { $regex: /^medium$/i } }, // Match by string
                { priority: { $in: [2, '2'] } } // Match by number
              ]
            } 
          }, { $count: 'count' }],
          lowPriority: [{ 
            $match: { 
              $or: [
                { priority: { $in: lowPriorityIds } }, // Match by ObjectId
                { priority: { $regex: /^low$/i } }, // Match by string
                { priority: { $in: [1, '1'] } } // Match by number
              ]
            } 
          }, { $count: 'count' }],
          resolved: [{ $match: { status: 4 } }, { $count: 'count' }], // 4=Resolved
          openOrPending: [
            { $match: { status: { $in: [1, 2, 3] } } }, // 1=Open, 2=In Progress, 3=On Hold
            { $count: 'count' }
          ],
          // Get all tickets for SLA calculation
          allTickets: [
            {
              $project: {
                _id: 1,
                priority: 1,
                status: 1,
                createdAt: 1
              }
            }
          ]
        }
      }
    ]);

    const result = stats[0];
    const totalTickets = result.total[0]?.count || 0;
    const highPriority = result.highPriority[0]?.count || 0;
    const mediumPriority = result.mediumPriority[0]?.count || 0;
    const lowPriority = result.lowPriority[0]?.count || 0;
    const resolvedTickets = result.resolved[0]?.count || 0;
    const openOrInProgressTickets = result.openOrPending[0]?.count || 0;

    // Debug: Log actual priority values from tickets
    const allTickets = result.allTickets || [];
    const uniquePriorities = [...new Set(allTickets.map((t: any) => t.priority))];
    console.log('🔍 Unique priority values in DB:', uniquePriorities.map((p: any) => `"${p}" (type: ${typeof p})`));

    console.log('📊 Dashboard Stats Results:', {
      totalTickets,
      highPriority,
      mediumPriority,
      lowPriority,
      resolved: resolvedTickets,
      openOrPending: openOrInProgressTickets,
      query
    });

    // Calculate SLA compliance for each ticket
    let withinSLA = 0;
    let outsideSLA = 0;
    
    const now = new Date();
    
    console.log('🕐 Starting SLA calculation at:', now.toISOString());
    
    for (const ticket of allTickets) {
      // Get priority settings for this ticket
      // Priority could be: ObjectId, string code (HIGH, MEDIUM, LOW), numeric (1,2,3,4), or order number
      let prioritySettings = null;
      
      // Try matching by ObjectId first
      if (ticket.priority && typeof ticket.priority === 'object' && ticket.priority._id) {
        const priorityId = ticket.priority._id.toString();
        prioritySettings = priorityIdMap.get(priorityId);
      } else if (ticket.priority && mongoose.Types.ObjectId.isValid(ticket.priority.toString())) {
        // Priority is an ObjectId
        const priorityId = ticket.priority.toString();
        prioritySettings = priorityIdMap.get(priorityId);
      } else if (typeof ticket.priority === 'string') {
        // Priority is a string code
        const priorityCode = ticket.priority.toUpperCase();
        prioritySettings = priorityMap.get(priorityCode);
      } else if (typeof ticket.priority === 'number') {
        // Map numeric priority to string code
        const priorityNumMap: Record<number, string> = {
          1: 'LOW',
          2: 'MEDIUM',
          3: 'HIGH',
          4: 'CRITICAL'
        };
        const priorityCode = priorityNumMap[ticket.priority] || 'MEDIUM';
        prioritySettings = priorityMap.get(priorityCode);
      }
      
      if (!prioritySettings) {
        // Try to find by order if all else failed
        prioritySettings = priorities.find((p: any) => p.order === ticket.priority);
        if (!prioritySettings) {
          console.log(`⚠️ No priority settings found for ticket ${ticket._id}, priority: ${JSON.stringify(ticket.priority)} (type: ${typeof ticket.priority}) - Skipping SLA calculation`);
          // Skip this ticket from SLA calculation if no priority found
          continue;
        }
      }
      
      // Convert resolution time to milliseconds
      let resolutionTimeMs = 0;
      const resTime = prioritySettings.resolutionTime;
      if (!resTime || !resTime.value || !resTime.unit) {
        console.log(`⚠️ Invalid resolution time settings for priority ${prioritySettings.name} - Skipping ticket ${ticket._id}`);
        continue;
      }
      
      if (resTime.unit === 'minutes') {
        resolutionTimeMs = resTime.value * 60 * 1000;
      } else if (resTime.unit === 'hours') {
        resolutionTimeMs = resTime.value * 60 * 60 * 1000;
      } else if (resTime.unit === 'days') {
        resolutionTimeMs = resTime.value * 24 * 60 * 60 * 1000;
      }
      
      // Calculate SLA deadline (from ticket creation time)
      const createdAt = new Date(ticket.createdAt);
      const slaDeadline = new Date(createdAt.getTime() + resolutionTimeMs);
      
      // Determine SLA status based on ticket state:
      // 1. If ticket is resolved/closed: Check if it was resolved within SLA deadline
      // 2. If ticket is still open: Check if current time is within SLA deadline
      const isResolved = ticket.status === 4; // 4 = Resolved
      const isClosed = ticket.status === 5;   // 5 = Closed
      
      if (isResolved || isClosed) {
        // For resolved/closed tickets, check when it was resolved (use updatedAt as proxy)
        const resolvedAt = new Date(ticket.updatedAt || ticket.createdAt);
        const wasResolvedWithinSLA = resolvedAt <= slaDeadline;
        
        if (wasResolvedWithinSLA) {
          withinSLA++;
          const timeTaken = resolvedAt.getTime() - createdAt.getTime();
          const hoursTaken = Math.floor(timeTaken / (1000 * 60 * 60));
          const minutesTaken = Math.floor((timeTaken % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`✅ Ticket ${ticket._id}: ${isResolved ? 'RESOLVED' : 'CLOSED'} within SLA - Took ${hoursTaken}h ${minutesTaken}m (Deadline: ${slaDeadline.toISOString()})`);
        } else {
          outsideSLA++;
          const overdueTime = resolvedAt.getTime() - slaDeadline.getTime();
          const hoursOverdue = Math.floor(overdueTime / (1000 * 60 * 60));
          const minutesOverdue = Math.floor((overdueTime % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`❌ Ticket ${ticket._id}: ${isResolved ? 'RESOLVED' : 'CLOSED'} AFTER SLA - ${hoursOverdue}h ${minutesOverdue}m late (Deadline: ${slaDeadline.toISOString()})`);
        }
      } else {
        // For open tickets, check current time against deadline
        const isWithinDeadline = now <= slaDeadline;
        
        if (isWithinDeadline) {
          withinSLA++;
          const timeRemaining = slaDeadline.getTime() - now.getTime();
          const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`✅ Ticket ${ticket._id}: OPEN - Within SLA - ${hoursRemaining}h ${minutesRemaining}m remaining (Priority: ${prioritySettings.name}, Deadline: ${slaDeadline.toISOString()})`);
        } else {
          outsideSLA++;
          const overdueTime = now.getTime() - slaDeadline.getTime();
          const hoursOverdue = Math.floor(overdueTime / (1000 * 60 * 60));
          const minutesOverdue = Math.floor((overdueTime % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`❌ Ticket ${ticket._id}: OPEN - Outside SLA - ${hoursOverdue}h ${minutesOverdue}m overdue (Status: ${ticket.status}, Priority: ${prioritySettings.name}, Deadline: ${slaDeadline.toISOString()})`);
        }
      }
    }
    
    console.log('📊 SLA Calculation:', {
      totalTicketsChecked: allTickets.length,
      withinSLA,
      outsideSLA
    });

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
    console.log('req.body keys:', Object.keys(req.body));
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    
    const {
      studentId,
      Title,        // Title field from form (mapped to subject)
      Subject,      // Subject field from form
      subject,      // Alternative field name
      description,
      Description,  // Alternative field name for description
      category,
      Category,     // Alternative field name for category
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
    console.log('  Subject:', Subject);
    console.log('  Title:', Title);
    console.log('  Description:', Description);
    console.log('  description:', description);
    console.log('  category:', category);
    console.log('  Category:', Category);
    console.log('  projectId:', projectId);

    // Validate required fields (handle both capitalized and lowercase field names)
    const hasDescription = Description || description;
    const categoryId = Category || category;
    
    if (!studentId || !hasDescription || !categoryId || !projectId) {
      console.log('❌ Validation failed - missing fields');
      console.log('  studentId present:', !!studentId);
      console.log('  Subject present:', !!Subject);
      console.log('  Title present:', !!Title);
      console.log('  Description present:', !!Description);
      console.log('  description present:', !!description);
      console.log('  category present:', !!category);
      console.log('  Category present:', !!Category);
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

    // Get project and offline ticket numbering configuration
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Generate ticket number using offline configuration
    const offlineConfig = project.configuration?.offlineModuleSettings?.offlineTicketNumbering;
    console.log('🔧 Offline Ticket Number Config:', JSON.stringify(offlineConfig, null, 2));
    
    const prefix = offlineConfig?.prefix || 'OFF';
    const separator = offlineConfig?.separator || '-';
    const includeYear = offlineConfig?.includeYear !== false; // Default true
    const includeMonth = offlineConfig?.includeMonth || false;
    const resetFrequency = offlineConfig?.resetFrequency || 'yearly';
    const startingNumber = offlineConfig?.startingNumber || 1;
    
    const today = new Date();
    let ticketNumber = prefix;
    
    // Build search pattern for finding the latest ticket
    let searchPattern = `^${prefix.replace(/[-]/g, '\\-')}`;
    if (separator) {
      ticketNumber += separator;
      searchPattern += separator.replace(/[-]/g, '\\-');
    }
    
    // Add date parts based on configuration
    if (includeYear) {
      const year = today.getFullYear().toString();
      ticketNumber += year;
      searchPattern += year;
    }
    
    if (includeMonth) {
      const month = String(today.getMonth() + 1).padStart(2, '0');
      if (separator && includeYear) ticketNumber += separator;
      ticketNumber += month;
      if (includeYear) searchPattern += separator.replace(/[-]/g, '\\-');
      searchPattern += month;
    }
    
    // Add separator before number
    if (separator) {
      ticketNumber += separator;
      searchPattern += separator.replace(/[-]/g, '\\-');
    }
    
    // Find the highest ticket number for the current period
    const latestTicket = await Ticket.findOne({
      submissionSource: 'offline',
      ticketNumber: new RegExp(searchPattern)
    }).sort({ ticketNumber: -1 });
    
    let nextNumber = startingNumber;
    if (latestTicket && latestTicket.ticketNumber) {
      // Extract the sequence number from the last ticket
      const lastNumber = parseInt(latestTicket.ticketNumber.split(separator).pop() || '0');
      nextNumber = lastNumber + 1;
    }
    
    // Add the sequence number
    ticketNumber += String(nextNumber).padStart(4, '0');
    
    console.log(`🎫 Generated offline ticket number: ${ticketNumber}`);

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

    // Determine initial status (convert string to numeric if needed)
    let ticketStatus: number;
    if (resolvedAtCreation === 'true') {
      ticketStatus = 4; // 4=Resolved
    } else if (initialStatus) {
      // If initialStatus is provided, convert to number
      ticketStatus = typeof initialStatus === 'number' ? initialStatus : 1;
    } else {
      ticketStatus = 1; // 1=Open
    }

    // Determine assignment: If escalated, assign to escalateTo; otherwise assign to creating agent
    const assignedToAgentId = escalateTo || agent.userId;

    // Extract subject and description (handle both capitalized and lowercase field names)
    // Support Title, Subject, or subject field names from form
    const ticketSubject = Subject || Title || subject || description?.substring(0, 100) || 'No subject provided';
    const ticketDescription = Description || description || 'No description provided';

    // Create ticket (priority defaults to 'medium' if not provided - agent will set it later based on SLA)
    const ticket = await Ticket.create({
      ticketNumber,
      subject: ticketSubject,
      description: ticketDescription,
      category: categoryId,
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
        message: `Ticket assigned to ${agent.firstName} ${agent.lastName} (Counselor).`,
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
        entityName: ticket.subject,
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

    // Send email notifications (async, don't wait)
    if (student.email) {
      (async () => {
        try {
          const project = await Project.findById(projectId);
          if (!project) {
            console.error('Project not found for email notifications');
            return;
          }

          const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
          const studentEmail = student.email;

          // Check if this is the student's first ticket (welcome email)
          const isFirstTicket = await Ticket.countDocuments({ 
            createdBy: studentId 
          }) === 1;

          if (isFirstTicket) {
            // Generate login URL for project portal
            const loginUrl = (project as any).customUrlPath 
              ? `${process.env.FRONTEND_URL || 'http://localhost:3001'}/${(project as any).customUrlPath}/portal/login`
              : `${process.env.FRONTEND_URL || 'http://localhost:3001'}/login`;

            console.log('📧 Sending welcome email to new student:', studentEmail);
            await sendStudentWelcomeEmail(
              studentEmail,
              studentName,
              (project as any).name || 'SAC Helpdesk',
              loginUrl,
              projectId
            );
          }
          
          // Send ticket creation confirmation
          console.log('📧 Sending ticket creation email:', ticketNumber);
          await sendTicketCreatedEmail(
            studentEmail,
            ticket.ticketNumber,
            ticket.subject || description.substring(0, 100),
            projectId,
            {
              studentName: studentName,
              status: getStatusName(ticket.status),
              priority: ticket.priority || 'medium'
            }
          );

          console.log('✅ Email notifications sent successfully');
        } catch (emailError) {
          console.error('Failed to send email notifications:', emailError);
          // Don't fail the request if email fails
        }
      })();
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
