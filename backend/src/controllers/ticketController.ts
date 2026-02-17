import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Permission } from '../models/Permission';
import { Center } from '../models/Center';
import { Category } from '../models/Category';
import SLATracking from '../models/sla-module/SLATracking';
import EscalationPolicy from '../models/sla-module/EscalationPolicy';
import { UserReportingHierarchy } from '../models/UserReportingHierarchy';
import { UserDashboardConfig } from '../models/UserDashboardConfig';
import { Priority } from '../models/master-data/Priority';
import { WorkingCalendar } from '../models/WorkingCalendar';
import { EscalationMatrix } from '../models/escalation-matrix';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sendTicketCreatedEmail, sendStudentWelcomeEmail } from '../utils/emailService';
import { logActivity } from '../utils/logger';
import { config } from '../config';
import { initializeSLATracking } from '../services/slaHelperService';
import { autoAssignMatrixToTicket } from '../services/escalationMatrixService';
import * as slaService from '../services/slaService';
import { toObjectId, toObjectIdArray, ensureObjectId } from '../utils/objectIdUtils';

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
 * Optimized: Single aggregation instead of N countDocuments queries
 */
const getLeastLoadedAgent = async (eligibleUserIds: mongoose.Types.ObjectId[]): Promise<mongoose.Types.ObjectId | null> => {
  if (eligibleUserIds.length === 0) return null;
  
  // Single aggregation to count active tickets for all agents at once
  const ticketCounts = await Ticket.aggregate([
    {
      $match: {
        assignedTo: { $in: eligibleUserIds },
        status: { $in: [1, 2, 3] } // 1=Open, 2=In Progress, 3=On Hold
      }
    },
    {
      $group: {
        _id: '$assignedTo',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Create a map of userId -> ticket count
  const countMap = new Map(
    ticketCounts.map((tc: any) => [tc._id.toString(), tc.count])
  );
  
  // Find agent with least tickets (agents with 0 tickets won't be in aggregation result)
  let minCount = Infinity;
  let leastLoadedAgent = eligibleUserIds[0];
  
  for (const userId of eligibleUserIds) {
    const count = countMap.get(userId.toString()) || 0;
    if (count < minCount) {
      minCount = count;
      leastLoadedAgent = userId;
    }
  }
  
  return leastLoadedAgent;
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
    
    // Fetch category to get default priority
    console.time('⏱️ Category lookup');
    let ticketPriority = 'medium'; // Default fallback
    const categoryValue = ticketData.Category || 'General';
    
    try {
      // Use mongoose.models to ensure the model is available
      const CategoryModel = mongoose.models.Category || Category;
      
      let category;
      // Check if categoryValue is an ObjectId (24 hex chars) or a name string
      if (mongoose.Types.ObjectId.isValid(categoryValue) && categoryValue.length === 24) {
        // Search by ObjectId
        category = await CategoryModel.findOne({ 
          _id: categoryValue, 
          projectId: projectId,
          isActive: true 
        });
        console.log(`🔍 Looking up category by ID: ${categoryValue}`);
      } else {
        // Search by name
        category = await CategoryModel.findOne({ 
          name: categoryValue, 
          projectId: projectId,
          isActive: true 
        });
        console.log(`🔍 Looking up category by name: ${categoryValue}`);
      }
      
      console.log(`🔍 Category found:`, category ? {
        _id: category._id,
        name: category.name,
        defaultPriority: category.defaultPriority
      } : 'NOT FOUND');
      
      if (category && category.defaultPriority) {
        ticketPriority = category.defaultPriority.toLowerCase();
        console.log(`✅ Using category default priority: ${ticketPriority} (from category: ${category.name})`);
      } else if (category) {
        console.log(`⚠️ Category found but defaultPriority is not set: ${category.name}`);
      } else {
        console.log(`⚠️ Category not found: ${categoryValue}, using fallback: ${ticketPriority}`);
      }
    } catch (error) {
      console.error('Error fetching category:', error);
    }
    console.timeEnd('⏱️ Category lookup');
    
    // Create ticket (using actual student user ID)
    console.time('⏱️ Ticket save');
    
    // IMPORTANT: Always convert projectId to ObjectId to prevent String/ObjectId mismatch issues
    const projectObjectIdForMetadata = typeof projectId === 'string' 
      ? new mongoose.Types.ObjectId(projectId) 
      : projectId;
    
    const ticket = new Ticket({
      ticketNumber,
      title: ticketData.Subject || 'New Ticket',
      description: ticketData.Description || '',
      status: 1, // 1 = Open (numeric code)
      priority: ticketPriority, // Use priority from category default or fallback
      category: categoryValue,
      createdBy: studentUserId, // Use actual student user ID
      assignedTo: assignedAgent, // Auto-assigned agent (if enabled)
      submissionSource: 'online', // Mark as online submission
      attachments,
      tags: [`student-submission`, `project-${projectId}`, 'online'], // Add 'online' tag for online submissions
      // Store student contact info in custom metadata
      metadata: {
        studentName: ticketData.Name,
        studentEmail: ticketData.Email,
        studentPhone: ticketData.Phone,
        projectId: projectObjectIdForMetadata, // Always use ObjectId
        centerId: 'online', // Online tickets have center marked as 'online'
        submissionType: 'online',
        autoAssigned: !!assignedAgent,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    await ticket.save();
    console.timeEnd('⏱️ Ticket save');
    
    console.log(`✅ Ticket created successfully: ${ticket._id} | Created by: ${studentUserId}${assignedAgent ? ` | Assigned to: ${assignedAgent}` : ' | Unassigned'}`);
    
    // Initialize priority-level SLA tracking (non-blocking)
    (async () => {
      try {
        // Get working calendar for the project
        const calendar = await slaService.getDefaultWorkingCalendar(projectId);
        
        // Get priority details - first try Priority model, fallback to SLARule
        let priority = await Priority.findOne({ 
          code: ticketPriority.toUpperCase(),
          projectId: projectId 
        });
        
        // Fallback: If no Priority record exists, try to get resolution time from SLARule
        if (!priority) {
          const SLARule = (await import('../models/sla-module/SLARule')).default;
          const slaRule = await SLARule.findOne({
            projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
            priority: ticketPriority.toUpperCase(),
            isActive: true
          });
          
          if (slaRule) {
            // Create a virtual priority object from SLA rule
            priority = {
              code: ticketPriority.toUpperCase(),
              resolutionTime: slaRule.resolutionTime,
              responseTime: slaRule.responseTime || { value: 1, unit: 'hours' }
            } as any;
            console.log(`📋 Using SLARule for priority ${ticketPriority}: ${JSON.stringify(slaRule.resolutionTime)}`);
          }
        }
        
        if (priority && calendar) {
          // Calculate ticket-level SLA
          const ticketSLADueDate = await slaService.calculateTicketLevelSLA(
            ticket.createdAt,
            priority.code,
            project._id as mongoose.Types.ObjectId,
            calendar._id as mongoose.Types.ObjectId
          );
          
          if (ticketSLADueDate) {
            ticket.ticketLevelSLA = {
              dueAt: ticketSLADueDate,
              pausedDuration: 0,
            };
            
            // If ticket has escalation matrix, initialize role-level SLA
            if (ticket.escalationMatrixId) {
              const matrix = await EscalationMatrix.findById(ticket.escalationMatrixId);
              if (matrix && ticket.currentEscalationLevelNumber) {
                const roleSLADueDate = await slaService.calculateRoleLevelSLA(
                  ticket.createdAt,
                  matrix,
                  ticket.currentEscalationLevelNumber,
                  priority.code,
                  calendar._id as mongoose.Types.ObjectId
                );
                
                if (roleSLADueDate) {
                  ticket.roleLevelSLA = {
                    startedAt: ticket.createdAt,
                    dueAt: roleSLADueDate,
                    pausedDuration: 0,
                  };
                }
              }
            }
            
            ticket.workingCalendarId = calendar._id as any;
            await ticket.save();
            console.log(`✅ Priority-level SLA tracking initialized for ticket ${ticket.ticketNumber}`);
          }
        }
      } catch (error) {
        console.error('❌ Failed to initialize priority-level SLA tracking:', error);
      }
    })();
    
    // Initialize SLA tracking for the new ticket (non-blocking)
    (async () => {
      try {
        await initializeSLATracking(
          ticket._id,
          new mongoose.Types.ObjectId(projectId),
          ticketPriority,
          ticket.createdAt
        );
        console.log(`✅ SLA tracking initialized for ticket ${ticket.ticketNumber}`);
      } catch (error) {
        console.error('❌ Failed to initialize SLA tracking:', error);
      }
    })();
    
    // Auto-assign escalation matrix based on project and priority (non-blocking)
    (async () => {
      try {
        const result = await autoAssignMatrixToTicket(ticket._id, projectId, ticketPriority);
        if (result.success) {
          console.log(`✅ Escalation matrix auto-assigned for ticket ${ticket.ticketNumber}`);
        } else {
          console.log(`ℹ️ No escalation matrix for ticket ${ticket.ticketNumber}: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ Failed to auto-assign escalation matrix:', error);
      }
    })();
    
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

    // Convert userId to ObjectId for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(userId);

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
    // Agent roles: L1, L2, L3, PM, AGENT, or has isAgent flag, or has agent-like permissions
    const agentRoleCodes = ['L1', 'L2', 'L3', 'PM', 'AGENT ', 'COUNSELOR_L1', 'COUNSELOR', 'DISTRICT_NODAL_OFFICER', 'DNO', 'HUB_COORDINATOR', 'HC'];
    // Detect as agent if role has isAgent flag, role code is in the list, or user has agent-like permissions
    const agentPermissions = ['TICKET_ASSIGN', 'TICKET_ESCALATE', 'TICKET_RESPOND', 'TICKET_CLOSE'];
    const hasAgentPermission = agentPermissions.some(perm => permissionCodes.includes(perm));
    const isAgent = role?.isAgent === true || agentRoleCodes.includes(role?.code) || hasAgentPermission;

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
    } else if (isStudent) {
      // Students always see tickets by their email (tickets they created)
      query['metadata.studentEmail'] = user.email;
      console.log(`🔍 [QUERY] Student - filter by metadata.studentEmail: ${user.email}`);
    } else if (hasViewOwn) {
      // Everyone else with VIEW_OWN_TICKET permission sees tickets assigned to them
      query.assignedTo = userObjectId;
      console.log(`🔍 [QUERY] TICKET_VIEW_OWN - filter by assignedTo: ${userId}`);
    } else {
      // No specific permissions but not a student: show tickets assigned to them
      query.assignedTo = userObjectId;
      console.log(`🔍 [QUERY] Non-Student fallback - filter by assignedTo: ${userId}`);
    }

    console.log(`🔍 [TICKET QUERY] Final query (before project filter):`, JSON.stringify(query));

    // Filter by project if projectId is provided in query params
    if (req.query.projectId) {
      // Query for both ObjectId and string for backward compatibility
      // (older email-to-ticket stored as string, newer stores as ObjectId)
      const projectIdStr = req.query.projectId as string;
      try {
        const projectObjectId = new mongoose.Types.ObjectId(projectIdStr);
        // Match either ObjectId or string representation
        const existingQuery = { ...query };
        query = {
          $and: [
            existingQuery,
            {
              $or: [
                { 'metadata.projectId': projectObjectId },
                { 'metadata.projectId': projectIdStr }
              ]
            }
          ]
        };
        console.log(`🏢 [PROJECT FILTER] Filtering tickets by projectId (ObjectId + string fallback):`, projectIdStr);
      } catch (e) {
        // Fallback to string comparison if not a valid ObjectId
        query['metadata.projectId'] = projectIdStr;
        console.log(`🏢 [PROJECT FILTER] Filtering tickets by projectId (string only):`, projectIdStr);
      }
    } else {
      // If no specific projectId, filter by user's assigned projects (for "All Projects" mode)
      // Get user's assigned projects from both user.projects and role.projects
      const userProjectIds = (user.projects || []).map((p: any) => 
        typeof p === 'string' ? p : p._id?.toString() || p.toString()
      );
      const roleProjectIds = (role?.projects || []).map((p: any) => 
        typeof p === 'string' ? p : p._id?.toString() || p.toString()
      );
      const allUserProjectIds = [...new Set([...userProjectIds, ...roleProjectIds])];
      
      if (allUserProjectIds.length > 0) {
        // Convert string IDs to ObjectIds for proper comparison
        const projectObjectIds = allUserProjectIds.map(id => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch (e) {
            return id; // Keep as string if not valid ObjectId
          }
        });
        query['metadata.projectId'] = { $in: projectObjectIds };
        console.log(`🏢 [PROJECT FILTER] No projectId provided - filtering by user's ${allUserProjectIds.length} assigned project(s):`, allUserProjectIds);
      } else {
        console.warn(`⚠️  [PROJECT FILTER] No projectId provided and user has no assigned projects - tickets from ALL projects will be returned!`);
      }
    }

    console.log(`🔍 [TICKET QUERY] Final query (with project filter):`, JSON.stringify(query));

    // ============================================
    // CENTER FILTERING (based on project settings)
    // ============================================
    // Apply center filtering ONLY if project is in offline mode
    if (isAgent && (user.centers || []).length > 0) {
      // Determine which projects are being queried
      let projectIdsToCheck: string[] = [];
      
      if (req.query.projectId) {
        projectIdsToCheck = [req.query.projectId as string];
      } else {
        const userProjectIds = (user.projects || []).map((p: any) => 
          typeof p === 'string' ? p : p._id?.toString() || p.toString()
        );
        const roleProjectIds = (role?.projects || []).map((p: any) => 
          typeof p === 'string' ? p : p._id?.toString() || p.toString()
        );
        projectIdsToCheck = [...new Set([...userProjectIds, ...roleProjectIds])];
      }

      // Fetch project settings to check if offline mode is enabled
      const projects = await Project.find({ 
        _id: { $in: projectIdsToCheck.map(id => new mongoose.Types.ObjectId(id)) } 
      }).select('settings.mode settings.enableOfflineCenter').lean();

      // Check if ANY of the projects have offline mode enabled
      const hasOfflineProject = projects.some((proj: any) => {
        const mode = proj.settings?.mode;
        const enableOffline = proj.settings?.enableOfflineCenter;
        // Only apply center filtering if explicitly set to offline or both with offline enabled
        // If mode is not set or is 'online', don't apply center filtering
        if (!mode || mode === 'online') return false;
        if (mode === 'offline') return true;
        if (mode === 'both') return enableOffline !== false; // Default to true for 'both' mode
        return false;
      });

      if (hasOfflineProject) {
        // Apply center filtering only for offline projects
        const userCenterIds = (user.centers || []).map((c: any) => 
          typeof c === 'string' ? c : c._id?.toString() || c.toString()
        );
        
        const centerFilter = {
          $or: [
            { 'metadata.centerId': 'online' }, // Include all online tickets
            { 'metadata.centerId': { $in: userCenterIds } }, // Include offline tickets from assigned centers
            { 'metadata.centerId': { $exists: false } }, // Include tickets without center (legacy data)
            { 'metadata.createdByAgent': userId } // Include tickets created by this agent
          ]
        };
        
        // Merge center filter with existing query
        const existingQuery = { ...query };
        if (existingQuery.$and) {
          query = { $and: [...existingQuery.$and, centerFilter] };
        } else {
          query = { $and: [existingQuery, centerFilter] };
        }
        console.log(`🏢 [CENTER FILTER] Offline mode enabled - filtering by ${userCenterIds.length} center(s): ${userCenterIds.join(', ')}`);
      } else {
        console.log(`🏢 [CENTER FILTER] All projects are online mode - no center filtering applied`);
      }
    }

    console.log(`🔍 [TICKET QUERY] Final query (with center filter):`, JSON.stringify(query));

    // ============================================
    // ADDITIONAL FILTERS (status, priority, search, dates, category)
    // ============================================
    
    // Status filter (1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed)
    if (req.query.status) {
      const statusValues = String(req.query.status).split(',').map(s => parseInt(s.trim(), 10)).filter(s => [1,2,3,4,5].includes(s));
      if (statusValues.length > 0) {
        query.status = { $in: statusValues };
        console.log(`🔍 [FILTER] Status: ${statusValues.join(', ')}`);
      }
    }
    
    // Priority filter (low, medium, high, critical)
    if (req.query.priority) {
      const priorityValues = String(req.query.priority).split(',').map(p => p.trim().toLowerCase()).filter(p => ['low', 'medium', 'high', 'critical'].includes(p));
      if (priorityValues.length > 0) {
        query.priority = { $in: priorityValues };
        console.log(`🔍 [FILTER] Priority: ${priorityValues.join(', ')}`);
      }
    }
    
    // Search filter (searches ticketNumber, subject)
    if (req.query.search) {
      const searchTerm = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
      if (searchTerm) {
        query.$or = [
          { ticketNumber: { $regex: searchTerm, $options: 'i' } },
          { subject: { $regex: searchTerm, $options: 'i' } },
        ];
        console.log(`🔍 [FILTER] Search: "${searchTerm}"`);
      }
    }
    
    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) {
          query.createdAt.$gte = afterDate;
        }
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }
    
    // Category filter
    if (req.query.categoryId) {
      query.category = req.query.categoryId;
      console.log(`🔍 [FILTER] Category: ${req.query.categoryId}`);
    }

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber'];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string) ? req.query.sortBy as string : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Get pagination parameters with max limit enforcement
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalTickets = await Ticket.countDocuments(query);

    // Find tickets based on query with pagination
    // OPTIMIZED: Exclude heavy fields (threads, comments, history) from list view
    const tickets = await Ticket.find(query)
      .select('-threads -comments -internalNotes -changeHistory -escalationHistory -description')
      .populate('assignedTo', 'firstName lastName email')
      .populate('category', 'name code')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(`🔍 [TICKET QUERY] Tickets found: ${tickets.length} (Page ${page}, Total: ${totalTickets})`);
    
    // Log sample ticket with project info for debugging
    if (tickets.length > 0) {
      console.log(`📋 [SAMPLE TICKET] First ticket:`, {
        ticketNumber: tickets[0].ticketNumber,
        subject: tickets[0].subject,
        projectId: (tickets[0] as any).metadata?.projectId,
        assignedTo: tickets[0].assignedTo
      });
    }

    // OPTIMIZED: Batch fetch all projects and centers instead of N+1 queries
    const projectIds = [...new Set(tickets.map(t => (t as any).metadata?.projectId?.toString()).filter(Boolean))];
    const centerIds = [...new Set(tickets.map(t => {
      const centerId = (t as any).metadata?.centerId;
      return centerId && centerId !== 'online' ? centerId.toString() : null;
    }).filter(Boolean))];

    const [projects, centers] = await Promise.all([
      projectIds.length > 0 ? Project.find({ _id: { $in: projectIds } }).select('name code').lean() : Promise.resolve([]),
      centerIds.length > 0 ? Center.find({ _id: { $in: centerIds } }).select('centerName city state').lean() : Promise.resolve([])
    ]);

    const projectMap = new Map(projects.map((p: any) => [p._id.toString(), { _id: p._id, name: p.name, code: p.code }]));
    const centerMap = new Map(centers.map((c: any) => [c._id.toString(), { _id: c._id, centerName: c.centerName, city: c.city, state: c.state }]));

    // Map tickets with populated data (no additional queries)
    // Note: Using lean() so tickets are already plain objects
    const ticketsWithProject = tickets.map((ticket: any) => {
      const ticketObj = { ...ticket };
      if (ticketObj.metadata?.projectId) {
        const project = projectMap.get(ticketObj.metadata.projectId.toString());
        if (project) {
          ticketObj.metadata.projectId = project;
        }
      }
      if (ticketObj.metadata?.centerId && ticketObj.metadata.centerId !== 'online') {
        const center = centerMap.get(ticketObj.metadata.centerId.toString());
        if (center) {
          ticketObj.metadata.centerId = center;
        }
      }
      return ticketObj;
    });

    console.log(`📋 Retrieved ${tickets.length} tickets for ${hasViewAll ? 'all users' : `student ${user.email}`}${req.query.projectId ? ` in project ${req.query.projectId}` : ''}`);

    return res.status(200).json({
      success: true,
      data: ticketsWithProject,
      pagination: {
        total: totalTickets,
        page,
        limit,
        totalPages: Math.ceil(totalTickets / limit)
      }
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

    // Get project context from middleware (if available)
    const projectContext = (req as any).projectContext;
    console.log(`🔍 [VIEW_TICKETS] Project context:`, projectContext);

    // Get pagination parameters with max limit enforcement
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100
    const skip = (page - 1) * limit;

    // Get filter parameters
    const statusFilter = req.query.status ? (req.query.status as string).split(',').map(Number) : null;
    const priorityFilter = req.query.priority ? (req.query.priority as string).split(',') : null;
    const searchQuery = req.query.search as string;
    const projectIdsFilter = req.query.projectIds ? (req.query.projectIds as string).split(',') : null;
    
    // NEW: Hierarchy-based filtering for "Assign Queries" page
    const forAssignment = req.query.forAssignment === 'true';

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
    console.log(`🔍 [VIEW_TICKETS] forAssignment: ${forAssignment}`);

    let query: any = {};
    
    // ============ HIERARCHY-BASED FILTERING FOR ASSIGN QUERIES ============
    // When forAssignment=true, filter to only show tickets assigned to:
    // 1. The current user (self)
    // 2. All users who report to the current user (subordinates)
    // Uses the 'reportingManager' field on User documents (NOT the userreportinghierarchies collection)
    if (forAssignment && !isSuperAdmin) {
      try {
        // Get all users who have current user as their reportingManager (direct + recursive)
        const getAllReporteesRecursive = async (managerId: mongoose.Types.ObjectId, visited = new Set<string>()): Promise<mongoose.Types.ObjectId[]> => {
          const managerIdStr = managerId.toString();
          if (visited.has(managerIdStr)) return []; // Prevent infinite loops
          visited.add(managerIdStr);
          
          // Find all users who report to this manager
          const directReportees = await User.find({ reportingManager: managerId }).select('_id').lean();
          const reporteeIds = directReportees.map((r: any) => r._id as mongoose.Types.ObjectId);
          
          // Recursively get reportees of reportees
          const allReportees: mongoose.Types.ObjectId[] = [...reporteeIds];
          for (const reporteeId of reporteeIds) {
            const subReportees = await getAllReporteesRecursive(reporteeId, visited);
            allReportees.push(...subReportees);
          }
          
          return allReportees;
        };
        
        const currentUserObjectId = new mongoose.Types.ObjectId(userId);
        const allReporteeIds = await getAllReporteesRecursive(currentUserObjectId);
        
        // Build list: current user (FIRST) + all reportees
        const assignableObjectIds = [currentUserObjectId, ...allReporteeIds];
        
        console.log(`📊 [ASSIGN QUERIES] Hierarchy-based filtering (using User.reportingManager):`);
        console.log(`   - Current user (SELF): ${userId}`);
        console.log(`   - Reportee count: ${allReporteeIds.length}`);
        console.log(`   - Total assignable users: ${assignableObjectIds.length}`);
        
        // Filter tickets assigned to these users (self + subordinates)
        query.assignedTo = { $in: assignableObjectIds };
        
      } catch (hierarchyError) {
        console.log('⚠️ Hierarchy fetch failed, showing only user\'s own tickets:', hierarchyError);
        // Fallback: show only tickets assigned to current user
        query.assignedTo = new mongoose.Types.ObjectId(userId);
      }
    }
    
    // Get user's role projects (projects assigned to their role)
    const Role = await mongoose.model('Role').findById(role?._id);
    const roleProjectIds = toObjectIdArray((Role as any)?.projects || []);

    // SIMPLIFIED LOGIC FOR ASSIGN QUERIES PAGE:
    // 1. Super Admin: Show ALL tickets (no filters)
    // 2. Single Project Mode: Show ALL tickets from selected project
    // 3. Unified Mode: Show ALL tickets from user's assigned projects
    // 4. If offline mode with center: Filter by project + center
    
    console.log(`🔍 [ASSIGN QUERIES] ==================== FILTER LOGIC START ====================`);
    console.log(`🔍 [ASSIGN QUERIES] User: ${user.email}, Role: ${role?.code}`);
    console.log(`🔍 [ASSIGN QUERIES] isSuperAdmin: ${isSuperAdmin}`);
    console.log(`🔍 [ASSIGN QUERIES] projectContext:`, JSON.stringify(projectContext, null, 2));
    console.log(`🔍 [ASSIGN QUERIES] roleProjectIds count: ${roleProjectIds.length}`);
    console.log(`🔍 [ASSIGN QUERIES] Query params - viewMode: ${req.query.viewMode}, projectId: ${req.query.projectId}`);
    
    if (isSuperAdmin) {
      // Super Admin: No filters - show ALL tickets
      console.log(`✅ [ASSIGN QUERIES] Super Admin - showing ALL tickets (no filters)`);
    } else if (projectContext?.viewMode === 'single' && projectContext.currentProjectId) {
      // Single Project Mode: Show ALL tickets from selected project
      // Database has mixed types (string and ObjectId), so query for BOTH
      const projectIdStr = projectContext.currentProjectId.toString();
      query['metadata.projectId'] = { 
        $in: [
          projectIdStr,
          new mongoose.Types.ObjectId(projectIdStr)
        ] 
      };
      console.log(`✅ [ASSIGN QUERIES] Single Project Mode - filtering by projectId (both string and ObjectId)`);
      console.log(`   Query filter:`, query['metadata.projectId']);
    } else if (projectContext?.viewMode === 'unified' || !projectContext?.currentProjectId) {
      // Unified/All Projects Mode: Show ALL tickets from user's role projects
      if (roleProjectIds.length > 0) {
        // Query for both string and ObjectId versions of each project ID
        const projectIdsWithBothTypes = roleProjectIds.flatMap((id: any) => {
          const idStr = id.toString();
          return [idStr, new mongoose.Types.ObjectId(idStr)];
        });
        query['metadata.projectId'] = { $in: projectIdsWithBothTypes };
        console.log(`✅ [ASSIGN QUERIES] Unified Mode - showing ALL tickets from ${roleProjectIds.length} project(s)`);
      } else {
        // User has no projects assigned - return empty
        console.log(`❌ [ASSIGN QUERIES] User has no assigned projects - returning empty`);
        return res.status(200).json({
          success: true,
          data: { tickets: [], pagination: { total: 0, page, limit, pages: 0 } },
        });
      }
    }
    
    console.log(`🔍 [ASSIGN QUERIES] Query after project filter:`, JSON.stringify(query, null, 2));

    // ONLY additional filter: Center filter for offline mode
    const additionalFilters: any[] = [];
    
    // Check if user has centers assigned (for offline mode)
    const userCenterIds = (user.centers || []).map((c: any) => {
      const centerId = typeof c === 'string' ? c : c._id?.toString() || c.toString();
      return centerId;
    });
    
    if (userCenterIds.length > 0) {
      // Filter by centers: show tickets from assigned centers OR online tickets
      const centerObjectIds = userCenterIds.map(id => new mongoose.Types.ObjectId(id));
      additionalFilters.push({
        $or: [
          { 'metadata.centerId': 'online' },
          { 'metadata.centerId': { $in: [...userCenterIds, ...centerObjectIds] } },
          { 'metadata.centerId': { $exists: false } },
          { 'metadata.centerId': null }
        ]
      });
      console.log(`✅ [ASSIGN QUERIES] Filtering by ${userCenterIds.length} assigned center(s) + online tickets`);
    }

    console.log(`🔍 [ASSIGN QUERIES] Additional filters count: ${additionalFilters.length}`);

    // Combine all filters
    if (additionalFilters.length > 0) {
      if (query.$and) {
        query.$and.push(...additionalFilters);
      } else {
        query = { $and: [query, ...additionalFilters] };
      }
      console.log(`🔍 [STEP 2] Query after combining filters:`, JSON.stringify(query, null, 2));
    }

    // Apply additional filters from query params
    if (statusFilter && statusFilter.length > 0) {
      query.status = { $in: statusFilter };
      console.log(`🔍 [VIEW_TICKETS] Filtering by status: ${statusFilter}`);
    }

    if (priorityFilter && priorityFilter.length > 0) {
      query.priority = { $in: priorityFilter };
      console.log(`🔍 [VIEW_TICKETS] Filtering by priority: ${priorityFilter}`);
    }

    if (searchQuery) {
      // Sanitize search to prevent regex injection
      const sanitizedSearch = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { ticketNumber: { $regex: sanitizedSearch, $options: 'i' } },
        { subject: { $regex: sanitizedSearch, $options: 'i' } }
      ];
      console.log(`🔍 [VIEW_TICKETS] Searching for: ${sanitizedSearch}`);
    }

    // ============================================
    // ADDITIONAL FILTERS (date range, category, assignment, center)
    // ============================================
    
    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = query.createdAt || {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) {
          query.createdAt.$gte = afterDate;
          console.log(`🔍 [VIEW_TICKETS] Created after: ${afterDate.toISOString()}`);
        }
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
          console.log(`🔍 [VIEW_TICKETS] Created before: ${beforeDate.toISOString()}`);
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }
    
    // Category filter
    if (req.query.categoryId) {
      query.category = req.query.categoryId;
      console.log(`🔍 [VIEW_TICKETS] Filtering by category: ${req.query.categoryId}`);
    }
    
    // Assigned agent filter
    if (req.query.assignedTo) {
      if (req.query.assignedTo === 'unassigned') {
        query.assignedTo = { $exists: false };
        console.log(`🔍 [VIEW_TICKETS] Filtering unassigned tickets`);
      } else {
        query.assignedTo = new mongoose.Types.ObjectId(req.query.assignedTo as string);
        console.log(`🔍 [VIEW_TICKETS] Filtering by assigned agent: ${req.query.assignedTo}`);
      }
    }
    
    // Submission source filter (online/offline/email/whatsapp)
    if (req.query.submissionSource) {
      query.submissionSource = req.query.submissionSource;
      console.log(`🔍 [VIEW_TICKETS] Filtering by source: ${req.query.submissionSource}`);
    }
    
    // Center filter
    if (req.query.centerId) {
      query['metadata.centerId'] = req.query.centerId;
      console.log(`🔍 [VIEW_TICKETS] Filtering by center: ${req.query.centerId}`);
    }

    // Additional project filter from query params (for unified view multi-select)
    if (projectIdsFilter && projectIdsFilter.length > 0 && projectContext?.viewMode === 'unified') {
      query['metadata.projectId'] = {
        $in: projectIdsFilter.map(id => new mongoose.Types.ObjectId(id))
      };
      console.log(`🔍 [VIEW_TICKETS] Filtering by specific projects: ${projectIdsFilter.length}`);
    }

    // Single projectId filter from query params (for reports page)
    // IMPORTANT: Super admins should NOT be restricted by projectId unless explicitly provided
    if (req.query.projectId && !query['metadata.projectId']) {
      // For super admins, only apply project filter if they explicitly selected one
      // (empty projectId or "all" means show all projects)
      const projectIdStr = req.query.projectId as string;
      
      if (projectIdStr && projectIdStr !== 'all' && projectIdStr !== '') {
        // Convert to ObjectId for comparison (metadata.projectId is stored as ObjectId)
        if (mongoose.Types.ObjectId.isValid(projectIdStr)) {
          query['metadata.projectId'] = new mongoose.Types.ObjectId(projectIdStr);
          console.log(`🔍 [VIEW_TICKETS] Filtering by single projectId (ObjectId): ${projectIdStr}`);
        } else {
          query['metadata.projectId'] = projectIdStr;
          console.log(`🔍 [VIEW_TICKETS] Filtering by single projectId (string): ${projectIdStr}`);
        }
      } else if (isSuperAdmin) {
        console.log(`✅ [VIEW_TICKETS] Super Admin with no/empty projectId - showing ALL projects`);
      }
    }

    // ============================================
    // RBAC: TICKET_VIEW_OWN vs TICKET_VIEW_ALL
    // ============================================
    // If user has ONLY TICKET_VIEW_OWN (not TICKET_VIEW_ALL), filter by assignedTo
    if (hasViewOwn && !hasViewAll && !isSuperAdmin) {
      if (isAgent) {
        // Agents with VIEW_OWN see only tickets assigned to them
        query.assignedTo = new mongoose.Types.ObjectId(userId);
        console.log(`🔒 [RBAC] TICKET_VIEW_OWN applied - filtering by assignedTo: ${userId}`);
      } else {
        // Students with VIEW_OWN see only tickets created by them
        query['metadata.studentEmail'] = user.email;
        console.log(`🔒 [RBAC] TICKET_VIEW_OWN applied - filtering by studentEmail: ${user.email}`);
      }
    } else if (!hasViewOwn && !hasViewAll && !isSuperAdmin) {
      // User has no viewing permissions - return empty
      console.log(`❌ [RBAC] User has no TICKET_VIEW_OWN or TICKET_VIEW_ALL permission`);
      return res.status(200).json({
        success: true,
        data: { tickets: [], pagination: { total: 0, page, limit, pages: 0 } },
      });
    }

    console.log(`🔍 [FINAL QUERY] Query object:`, JSON.stringify(query, null, 2));
    console.log(`🔍 [FINAL QUERY] Query keys:`, Object.keys(query));

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber', 'slaDeadline'];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string) ? req.query.sortBy as string : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Count total tickets
    const totalTickets = await Ticket.countDocuments(query);
    console.log(`📊 [DB RESULT] Total tickets matching query: ${totalTickets}`);

    // Find tickets based on query with pagination
    // OPTIMIZED: Exclude heavy fields (threads, comments, history) from list view
    const tickets = await Ticket.find(query)
      .select('-threads -comments -internalNotes -changeHistory -escalationHistory -description')
      .populate('assignedTo', 'firstName lastName email')
      .populate('category', 'name')
      .populate('metadata.projectId', 'name code')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(`📊 [DB RESULT] Tickets returned (paginated): ${tickets.length}`);

    // Get priorities for SLA calculation
    const Priority = require('../models/master-data/Priority').Priority;
    const priorities = await Priority.find({});
    console.log(`📊 [SLA] Found ${priorities.length} priorities in database`);
    const priorityMap = new Map();
    priorities.forEach((p: any) => {
      priorityMap.set(p.code.toUpperCase(), p);
      console.log(`📊 [SLA] Loaded priority: ${p.code} (${p.name}) - ResolutionTime: ${p.resolutionTime?.value} ${p.resolutionTime?.unit}`);
    });

    // OPTIMIZED: Batch fetch all projects and centers instead of N+1 queries
    const projectIds = [...new Set(tickets.map(t => (t as any).metadata?.projectId?.toString()).filter(Boolean))];
    const centerIds = [...new Set(tickets.map(t => {
      const centerId = (t as any).metadata?.centerId;
      return centerId && centerId !== 'online' ? centerId.toString() : null;
    }).filter(Boolean))];

    const [projects, centers] = await Promise.all([
      projectIds.length > 0 ? Project.find({ _id: { $in: projectIds } }).select('name code').lean() : Promise.resolve([]),
      centerIds.length > 0 ? Center.find({ _id: { $in: centerIds } }).select('centerName city state').lean() : Promise.resolve([])
    ]);

    const projectMap = new Map(projects.map((p: any) => [p._id.toString(), { _id: p._id, name: p.name, code: p.code }]));
    const centerMap = new Map(centers.map((c: any) => [c._id.toString(), { _id: c._id, centerName: c.centerName, city: c.city, state: c.state }]));

    // Map tickets with populated data and SLA calculation (no additional queries)
    // Note: Using lean() so tickets are already plain objects
    const ticketsWithProject = tickets.map((ticket: any) => {
      const ticketObj = { ...ticket };
      
      // Populate project data from batch query
      if (ticketObj.metadata?.projectId) {
        const project = projectMap.get(ticketObj.metadata.projectId.toString());
        if (project) {
          ticketObj.metadata.projectId = project;
        }
      }
      
      // Populate center data from batch query
      if (ticketObj.metadata?.centerId && ticketObj.metadata.centerId !== 'online') {
        const center = centerMap.get(ticketObj.metadata.centerId.toString());
        if (center) {
          ticketObj.metadata.centerId = center;
        }
      }
      
      // Calculate resolution time and SLA status for resolved/closed tickets
      if ((ticketObj.status === 4 || ticketObj.status === 5) && ticketObj.resolvedAt) {
        const createdDate = new Date(ticketObj.createdAt);
        const resolvedDate = new Date(ticketObj.resolvedAt);
        const timeDiffMs = resolvedDate.getTime() - createdDate.getTime();
        const hours = Math.floor(timeDiffMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        
        if (days > 0) {
          ticketObj.resolutionTime = `${days}d ${remainingHours}h`;
        } else {
          ticketObj.resolutionTime = `${hours}h`;
        }
        
        // Calculate SLA status
        let prioritySettings = null;
        if (typeof ticketObj.priority === 'string') {
          const priorityCode = ticketObj.priority.toUpperCase();
          prioritySettings = priorityMap.get(priorityCode);
        }
        
        if (prioritySettings && prioritySettings.resolutionTime) {
          const resTime = prioritySettings.resolutionTime;
          let resolutionTimeMs = 0;
          
          if (resTime.unit === 'minutes') {
            resolutionTimeMs = resTime.value * 60 * 1000;
          } else if (resTime.unit === 'hours') {
            resolutionTimeMs = resTime.value * 60 * 60 * 1000;
          } else if (resTime.unit === 'days') {
            resolutionTimeMs = resTime.value * 24 * 60 * 60 * 1000;
          }
          
          const slaDeadline = new Date(createdDate.getTime() + resolutionTimeMs);
          const withinSLA = resolvedDate <= slaDeadline;
          ticketObj.slaStatus = withinSLA ? 'Within SLA' : 'Outside SLA';
        } else {
          ticketObj.slaStatus = 'N/A';
        }
      } else {
        ticketObj.slaStatus = 'Pending';
      }
      
      return ticketObj;
    });

    console.log(`📋 Retrieved ${ticketsWithProject.length} tickets for View Tickets (Total: ${totalTickets})`);

    return res.status(200).json({
      success: true,
      data: {
        tickets: ticketsWithProject,
        pagination: {
          total: totalTickets,
          page,
          limit,
          totalPages: Math.ceil(totalTickets / limit)
        }
      }
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

    // Pagination parameters with max limit enforcement
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
    const skip = (page - 1) * limit;

    // Build query to find tickets assigned to this agent
    const query: any = {
      assignedTo: userId,
    };

    // Filter by project if projectId is provided (convert to ObjectId)
    if (req.query.projectId) {
      const projectIdStr = req.query.projectId as string;
      if (mongoose.Types.ObjectId.isValid(projectIdStr)) {
        query['metadata.projectId'] = new mongoose.Types.ObjectId(projectIdStr);
      } else {
        query['metadata.projectId'] = projectIdStr;
      }
    }

    // ============================================
    // ADDITIONAL FILTERS (status, priority, search, dates, category)
    // ============================================
    
    // Status filter (1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed)
    if (req.query.status) {
      const statusValues = String(req.query.status).split(',').map(s => parseInt(s.trim(), 10)).filter(s => [1,2,3,4,5].includes(s));
      if (statusValues.length > 0) {
        query.status = { $in: statusValues };
      }
    }
    
    // Priority filter (low, medium, high, critical)
    if (req.query.priority) {
      const priorityValues = String(req.query.priority).split(',').map(p => p.trim().toLowerCase()).filter(p => ['low', 'medium', 'high', 'critical'].includes(p));
      if (priorityValues.length > 0) {
        query.priority = { $in: priorityValues };
      }
    }
    
    // Search filter (searches ticketNumber, subject)
    if (req.query.search) {
      const searchTerm = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
      if (searchTerm) {
        query.$or = [
          { ticketNumber: { $regex: searchTerm, $options: 'i' } },
          { subject: { $regex: searchTerm, $options: 'i' } },
        ];
      }
    }
    
    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) query.createdAt.$gte = afterDate;
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }
    
    // Category filter
    if (req.query.categoryId) {
      query.category = req.query.categoryId;
    }

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber'];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string) ? req.query.sortBy as string : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Get total count for pagination
    const totalTickets = await Ticket.countDocuments(query);

    // Find tickets with pagination - using lean() for read-only access
    // OPTIMIZED: Exclude heavy fields (threads, comments, history) from list view
    const tickets = await Ticket.find(query)
      .select('-threads -comments -internalNotes -changeHistory -escalationHistory -description +submissionSource')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('category', 'name')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // OPTIMIZED: Batch fetch all projects and centers instead of N+1 queries
    const projectIds = [...new Set(tickets.map(t => (t as any).metadata?.projectId?.toString()).filter(Boolean))];
    const centerIds = [...new Set(tickets.map(t => {
      const centerId = (t as any).metadata?.centerId;
      return centerId && centerId !== 'online' ? centerId.toString() : null;
    }).filter(Boolean))];

    const [projects, centers] = await Promise.all([
      projectIds.length > 0 ? Project.find({ _id: { $in: projectIds } }).select('name code').lean() : Promise.resolve([]),
      centerIds.length > 0 ? Center.find({ _id: { $in: centerIds } }).select('centerName city state').lean() : Promise.resolve([])
    ]);

    const projectMap = new Map(projects.map((p: any) => [p._id.toString(), { _id: p._id, name: p.name, code: p.code }]));
    const centerMap = new Map(centers.map((c: any) => [c._id.toString(), { _id: c._id, centerName: c.centerName, city: c.city, state: c.state }]));

    // Map tickets with populated data (no additional queries)
    const ticketsWithDetails = tickets.map(ticket => {
      const ticketObj = { ...ticket };
      
      // Populate project data from batch query
      if (ticketObj.metadata?.projectId) {
        const project = projectMap.get(ticketObj.metadata.projectId.toString());
        if (project) {
          ticketObj.metadata.projectId = project as any;
        }
      }
      
      // Populate center data from batch query
      if (ticketObj.metadata?.centerId && ticketObj.metadata.centerId !== 'online') {
        const center = centerMap.get(ticketObj.metadata.centerId.toString());
        if (center) {
          ticketObj.metadata.centerId = center as any;
        }
      }
      
      return ticketObj;
    });

    return res.status(200).json({
      success: true,
      data: ticketsWithDetails,
      pagination: {
        total: totalTickets,
        page,
        limit,
        totalPages: Math.ceil(totalTickets / limit)
      }
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
      .populate('category', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('escalationMatrixId', 'name') // Populate escalation matrix name
      .populate({
        path: 'threads.createdBy',
        select: 'firstName lastName email role',
        populate: {
          path: 'role',
          select: 'name code'
        }
      })
      .populate({
        path: 'comments.createdBy',
        select: 'firstName lastName email'
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

    // Add escalation matrix name if available
    if (ticketData.escalationMatrixId && typeof ticketData.escalationMatrixId === 'object') {
      (ticketData as any).escalationMatrixName = (ticketData.escalationMatrixId as any).name;
    }

    console.log('🔍 [getTicketById] Fetching SLA tracking for ticket:', ticket._id);
    
    // Fetch SLA tracking data for this ticket
    const slaTracking = await SLATracking.findOne({ ticketId: ticket._id })
      .populate('escalationPolicyId')
      .lean();
    
    console.log('🔍 [getTicketById] SLA tracking found:', !!slaTracking);
    if (slaTracking) {
      console.log('🔍 [getTicketById] SLA tracking details:', {
        currentLevel: slaTracking.currentEscalationLevel,
        resolutionDeadline: slaTracking.resolutionDeadline,
        resolutionStatus: slaTracking.resolutionStatus
      });
    }
    
    // Add SLA tracking info to response
    if (slaTracking) {
      (ticketData as any).slaTracking = {
        currentEscalationLevel: slaTracking.currentEscalationLevel || 0,
        resolutionDeadline: slaTracking.resolutionDeadline,
        nextEscalationDue: slaTracking.nextEscalationDue,
        resolutionStatus: slaTracking.resolutionStatus,
        isPaused: slaTracking.isPaused,
        pausedDuration: slaTracking.pausedDuration || 0,
        lastEscalationAt: slaTracking.lastEscalationAt,
        escalationHistory: slaTracking.escalationHistory || [],
        escalationPolicy: slaTracking.escalationPolicyId || null
      };
      console.log('✅ [getTicketById] Added slaTracking to response');
    } else {
      console.log('⚠️ [getTicketById] No SLA tracking found for ticket');
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
        message: 'Cannot reply to a closed ticket. Please reopen the ticket first.',
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
    ticket.closedAt = new Date();
    // If closed without being resolved, also set resolvedAt
    if (!ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
    }
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
    });
  }
};

// Reopen a closed ticket (students only)
export const reopenTicket = async (req: Request, res: Response) => {
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
        message: 'You do not have permission to reopen this ticket',
      });
    }

    // Check if ticket is actually closed (status 5 = closed)
    if (ticket.status !== 5) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is not closed',
      });
    }

    // Reopen the ticket (1 = open)
    ticket.status = 1;
    ticket.updatedAt = new Date();

    // Add system thread
    if (!ticket.threads) {
      ticket.threads = [];
    }

    ticket.threads.push({
      message: `Ticket reopened by ${user.firstName} ${user.lastName} (Student)`,
      createdBy: userId,
      isSystemMessage: true,
      createdAt: new Date(),
    } as any);

    await ticket.save();

    console.log(`✅ Ticket reopened by student: ${ticket._id} by ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Ticket reopened successfully',
      data: ticket,
    });

  } catch (error) {
    console.error('Reopen ticket error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reopen ticket',
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
    
    // Set resolvedAt timestamp when status changes to Resolved (4)
    if (statusNum === 4 && oldStatus !== 4) {
      ticket.resolvedAt = new Date();
    }
    
    // Set closedAt timestamp when status changes to Closed (5)
    if (statusNum === 5 && oldStatus !== 5) {
      ticket.closedAt = new Date();
      // If closed directly without being resolved, also set resolvedAt
      if (!ticket.resolvedAt) {
        ticket.resolvedAt = new Date();
      }
    }
    
    // Track change in history
    await trackChange(ticket, 'status', String(oldStatus), String(statusNum), userId);
    
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
    await trackChange(ticket, 'category', String(oldCategory || 'None'), String(category), userId);
    
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
 * Update ticket category hierarchy (for multi-level category systems)
 */
export const updateTicketCategoryHierarchy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { categoryHierarchy } = req.body;
    const userId = (req as any).user?.userId;
    const user = (req as any).user;

    if (!categoryHierarchy) {
      return res.status(400).json({
        success: false,
        message: 'Category hierarchy is required',
      });
    }

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

    const oldHierarchy = ticket.categoryHierarchy?.displayPath || 'None';
    
    // Update category hierarchy
    ticket.categoryHierarchy = {
      level1: categoryHierarchy.level1,
      level2: categoryHierarchy.level2,
      level3: categoryHierarchy.level3,
      level4: categoryHierarchy.level4,
      displayPath: categoryHierarchy.displayPath,
    };
    
    // Also update the legacy category field with level1 for backward compatibility
    if (categoryHierarchy.level1) {
      ticket.category = categoryHierarchy.level1;
    }
    
    ticket.updatedAt = new Date();
    
    // Track change in history
    await trackChange(ticket, 'categoryHierarchy', oldHierarchy, categoryHierarchy.displayPath || 'Updated', userId);
    
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
          changes: [{ field: 'categoryHierarchy', oldValue: oldHierarchy, newValue: categoryHierarchy.displayPath }],
          description: `Ticket ${ticket.ticketNumber} category hierarchy changed from "${oldHierarchy}" to "${categoryHierarchy.displayPath || 'Updated'}"`,
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
    console.error('Update category hierarchy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update category hierarchy',
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
    await trackChange(ticket, 'priority', oldPriority, ticket.priority, userId);
    
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

    // Store old assignedTo for change tracking
    const oldAssignedTo = ticket.assignedTo;
    const oldAssignedToUser = oldAssignedTo ? await User.findById(oldAssignedTo) : null;

    // Update assigned agent
    ticket.assignedTo = new mongoose.Types.ObjectId(escalatedUserId);
    ticket.updatedAt = new Date();
    
    // Track assignment change in history
    const oldAssignedName = oldAssignedToUser ? `${oldAssignedToUser.firstName} ${oldAssignedToUser.lastName}` : 'Unassigned';
    const newAssignedName = `${escalatedUser.firstName} ${escalatedUser.lastName}`;
    await trackChange(ticket, 'assignedTo', oldAssignedName, newAssignedName, userId);
    
    await ticket.save();

    // Update SLA tracking with new escalation level and deadline
    const slaTracking = await SLATracking.findOne({ ticketId: ticket._id })
      .populate('escalationPolicyId');
    
    if (slaTracking && slaTracking.escalationPolicyId) {
      const policy = slaTracking.escalationPolicyId as any;
      const newLevel = ticket.escalationHistory.length; // Escalation level based on history count
      // When at level N (e.g., L2 = level 1), use level N+1 config for SLA time
      const levelConfig = policy.levels?.find((l: any) => l.level === newLevel + 1);
      
      if (levelConfig && levelConfig.escalateAfter) {
        console.log(`📅 Updating SLA for manual escalation to L${newLevel + 1} (using level ${newLevel + 1} config)`);
        
        // Calculate new resolution deadline from NOW + level's SLA time
        const now = new Date();
        let minutes = 0;
        switch (levelConfig.escalateAfter.unit) {
          case 'minutes':
            minutes = levelConfig.escalateAfter.value;
            break;
          case 'hours':
            minutes = levelConfig.escalateAfter.value * 60;
            break;
          case 'days':
            minutes = levelConfig.escalateAfter.value * 24 * 60;
            break;
        }
        
        const newResolutionDeadline = new Date(now.getTime() + minutes * 60 * 1000);
        slaTracking.currentEscalationLevel = newLevel;
        slaTracking.resolutionDeadline = newResolutionDeadline;
        slaTracking.lastEscalationAt = now;
        
        // Add to SLA escalation history
        slaTracking.escalationHistory.push({
          level: newLevel,
          escalatedAt: now,
          escalatedTo: new mongoose.Types.ObjectId(escalatedUserId),
          escalatedBy: new mongoose.Types.ObjectId(userId),
          mode: 'manual',
          reason: reason,
        } as any);
        
        // Set next escalation due if there's another level
        const nextLevel = policy.levels?.find((l: any) => l.level === newLevel + 1);
        if (nextLevel && levelConfig.escalationMode === 'auto') {
          slaTracking.nextEscalationDue = newResolutionDeadline;
          console.log(`📅 Next auto-escalation due: ${newResolutionDeadline.toISOString()}`);
        } else {
          slaTracking.nextEscalationDue = undefined;
        }
        
        await slaTracking.save();
        
        console.log(`📅 Manual Escalation SLA Updated:`);
        console.log(`   ↳ Escalation Time: ${now.toISOString()}`);
        console.log(`   ↳ Level: L${newLevel}`);
        console.log(`   ↳ SLA Duration: ${levelConfig.escalateAfter.value} ${levelConfig.escalateAfter.unit}`);
        console.log(`   ↳ New Resolution Deadline: ${newResolutionDeadline.toISOString()}`);
      }
    }

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

    // Check if user has access to this ticket based on centers
    const userCenterIds = (currentUser.centers || []).map((c: any) => 
      typeof c === 'string' ? c : c._id?.toString() || c.toString()
    );
    
    if (userCenterIds.length > 0) {
      // User has centers - check if ticket's center matches
      const ticketCenterId = ticket.metadata?.centerId;
      
      // Allow if ticket is online OR ticket center matches user's centers
      const hasAccess = ticketCenterId === 'online' || 
                       !ticketCenterId || 
                       userCenterIds.includes(ticketCenterId?.toString());
      
      if (!hasAccess) {
        console.log(`❌ Access denied: User centers [${userCenterIds.join(', ')}] don't match ticket center [${ticketCenterId}]`);
        return res.status(403).json({
          success: false,
          message: 'You do not have access to assign this ticket. Ticket center does not match your assigned centers.',
        });
      }
      
      console.log(`✅ Access granted: Ticket center [${ticketCenterId}] matches user centers`);
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
    const oldAssignedToUser = oldAssignedTo ? await User.findById(oldAssignedTo) : null;

    // Update ticket assignment
    ticket.assignedTo = new mongoose.Types.ObjectId(agentId);
    ticket.updatedAt = new Date();
    
    // Track change in history
    const oldAssignedName = oldAssignedToUser ? `${oldAssignedToUser.firstName} ${oldAssignedToUser.lastName}` : 'Unassigned';
    const newAssignedName = `${agent.firstName} ${agent.lastName}`;
    await trackChange(ticket, 'assignedTo', oldAssignedName, newAssignedName, currentUser._id.toString());
    
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
    // Optimized: Use distinct() instead of fetching all tickets with tags
    // This reduces data transfer by 95%+ and is handled entirely by MongoDB
    const tags = await Ticket.distinct('tags', { tags: { $exists: true, $ne: [] } });
    
    // Sort alphabetically
    const sortedTags = tags.filter(Boolean).sort();

    return res.status(200).json({
      success: true,
      data: sortedTags,
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
 * Supports filtering by projectId query parameter
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { projectId, viewMode } = req.query; // Get projectId and viewMode from query params
    
    // Populate user with role, and populate role.permissions to get permission codes
    const user = await User.findById(userId)
      .populate({
        path: 'role',
        populate: {
          path: 'permissions',
          select: 'code'
        }
      })
      .populate('centers')
      .populate('projects');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const roleCode = (user.role as any)?.code;
    
    // Check if user is Super Admin - they should see ALL data across all projects
    const isSuperAdmin = roleCode === 'SUPER_ADMIN';
    
    // Extract permission codes from populated permissions
    const permissions = (user.role as any)?.permissions || [];
    const permissionCodes = permissions.map((p: any) => 
      typeof p === 'string' ? p : p.code
    ).filter(Boolean);

    console.log(`📊 [DASHBOARD] User: ${user.email}, Role: ${roleCode}, IsSuperAdmin: ${isSuperAdmin}`);
    console.log(`📊 [DASHBOARD] Permission codes:`, permissionCodes);

    // ===== HIERARCHICAL DASHBOARD ENHANCEMENT =====
    // Determine which view mode to use and which users' tickets to show
    let appliedViewMode: string = 'self'; // Default to self
    let targetUserIds: mongoose.Types.ObjectId[] = [new mongoose.Types.ObjectId(userId)];
    let teamMembers: any[] = []; // For team breakdown

    // Check hierarchical dashboard permissions
    const hasDashboardViewAll = permissionCodes.includes('DASHBOARD_VIEW_ALL');
    const hasDashboardViewHierarchy = permissionCodes.includes('DASHBOARD_VIEW_HIERARCHY');
    const hasDashboardViewTeam = permissionCodes.includes('DASHBOARD_VIEW_TEAM');
    const hasDashboardViewOWN = permissionCodes.includes('DASHBOARD_VIEW_OWN');
    const hasDashboardViewTeamBreakdown = permissionCodes.includes('DASHBOARD_VIEW_TEAM_BREAKDOWN');

    // Fetch user's dashboard config for default view mode
    const dashboardConfig = await UserDashboardConfig.findOne({ userId });
    const defaultViewMode = dashboardConfig?.defaultViewMode || 'self';
    
    // Use provided viewMode from query, or fall back to user's config, or default to 'self'
    let requestedViewMode = (viewMode as string) || defaultViewMode;
    console.log(`📊 [DASHBOARD] Requested view mode: ${requestedViewMode}, Default: ${defaultViewMode}`);

    // Validate and apply view mode based on permissions
    if (requestedViewMode === 'all' && (hasDashboardViewAll || isSuperAdmin)) {
      appliedViewMode = 'all';
      targetUserIds = []; // No user filter means show all tickets
      console.log(`📊 [DASHBOARD] View mode: ALL (no user filter)`);
    } else if (requestedViewMode === 'hierarchy' && (hasDashboardViewHierarchy || isSuperAdmin)) {
      appliedViewMode = 'hierarchy';
      // Get all reportees recursively (multi-level)
      const maxDepth = dashboardConfig?.maxHierarchyDepth || 10;
      const reportees = await UserReportingHierarchy.getAllReporteesRecursive(
        userId,
        projectId as string | undefined,
        maxDepth
      );
      targetUserIds = [
        new mongoose.Types.ObjectId(userId),
        ...reportees.map((r: any) => new mongoose.Types.ObjectId(r.userId))
      ];
      teamMembers = reportees;
      console.log(`📊 [DASHBOARD] View mode: HIERARCHY (${reportees.length} reportees across ${maxDepth} levels)`);
    } else if (requestedViewMode === 'team' && (hasDashboardViewTeam || isSuperAdmin)) {
      appliedViewMode = 'team';
      // Get only direct reportees (level 1)
      const reportees = await UserReportingHierarchy.getDirectReportees(
        userId,
        projectId as string | undefined
      );
      targetUserIds = [
        new mongoose.Types.ObjectId(userId),
        ...reportees.map((r: any) => new mongoose.Types.ObjectId(r.userId))
      ];
      teamMembers = reportees;
      console.log(`📊 [DASHBOARD] View mode: TEAM (${reportees.length} direct reportees)`);
    } else {
      // Default to 'self' - show only user's own tickets
      appliedViewMode = 'self';
      targetUserIds = [new mongoose.Types.ObjectId(userId)];
      console.log(`📊 [DASHBOARD] View mode: SELF (user's own tickets only)`);
    }
    // ===== END HIERARCHICAL ENHANCEMENT =====

    // Build query based on user permissions (not role)
    let query: any = {};
    
    // Check permissions using extracted codes
    const hasViewAllTickets = permissionCodes.includes('TICKET_VIEW_ALL');
    const hasViewOwnTickets = permissionCodes.includes('TICKET_VIEW_OWN');
    
    console.log(`📊 [DASHBOARD] TICKET_VIEW_ALL: ${hasViewAllTickets}, TICKET_VIEW_OWN: ${hasViewOwnTickets}`);
    
    // First, apply project filter based on projectId param or user's assigned projects
    // SUPER_ADMIN sees ALL projects - no project filter needed unless specific project selected
    if (projectId) {
      // Specific project selected - convert string to ObjectId for proper comparison
      try {
        query['metadata.projectId'] = new mongoose.Types.ObjectId(projectId as string);
        console.log(`📊 [DASHBOARD] Filtering by specific projectId (ObjectId): ${projectId}`);
      } catch (e) {
        query['metadata.projectId'] = projectId;
        console.log(`📊 [DASHBOARD] Filtering by specific projectId (string): ${projectId}`);
      }
    } else if (isSuperAdmin) {
      // Super Admin with no specific project - see ALL tickets across all projects
      console.log(`📊 [DASHBOARD] Super Admin - no project filter applied (sees all projects)`);
      // query remains empty - no project filter
    } else {
      // No specific project - use user's assigned projects (for "All Projects" mode)
      const userProjectIds = (user.projects || []).map((p: any) => 
        typeof p === 'string' ? p : p._id?.toString() || p.toString()
      );
      const roleProjectIds = ((user.role as any)?.projects || []).map((p: any) => 
        typeof p === 'string' ? p : p._id?.toString() || p.toString()
      );
      const allUserProjectIds = [...new Set([...userProjectIds, ...roleProjectIds])];
      
      console.log(`📊 [DASHBOARD] User: ${user.email}`);
      console.log(`📊 [DASHBOARD] User projects:`, userProjectIds);
      console.log(`📊 [DASHBOARD] Role projects:`, roleProjectIds);
      console.log(`📊 [DASHBOARD] Combined projects:`, allUserProjectIds);
      
      if (allUserProjectIds.length > 0) {
        query['metadata.projectId'] = { $in: allUserProjectIds };
        console.log(`📊 [DASHBOARD] Filtering by user's ${allUserProjectIds.length} assigned projects:`, allUserProjectIds);
      } else {
        console.warn(`⚠️ [DASHBOARD] No projects found for user ${user.email}. Will return empty stats.`);
      }
    }
    
    // Then apply additional filters based on permissions
    if (hasViewAllTickets) {
      // Users with TICKET_VIEW_ALL see all tickets in the filtered projects
      // (project filter already applied above)
      
      // Apply hierarchical filtering for team/hierarchy views (even with TICKET_VIEW_ALL)
      if (appliedViewMode !== 'all' && targetUserIds.length > 0) {
        const userFilter = { assignedTo: { $in: targetUserIds } };
        if (query['metadata.projectId']) {
          query = { $and: [{ 'metadata.projectId': query['metadata.projectId'] }, userFilter] };
        } else {
          query = userFilter;
        }
      }
      
      // Add center filtering for TICKET_VIEW_ALL users with centers
      const userCenterIds = (user.centers || []).map((c: any) => {
        const centerId = typeof c === 'string' ? c : c._id?.toString() || c.toString();
        return new mongoose.Types.ObjectId(centerId);
      });
      
      if (userCenterIds.length > 0) {
        const centerFilter = {
          $or: [
            { 'metadata.centerId': 'online' },
            { 'metadata.centerId': { $in: userCenterIds } },
            { 'metadata.centerId': { $exists: false } },
            { 'metadata.centerId': null }
          ]
        };
        
        if (query.$and) {
          query.$and.push(centerFilter);
        } else if (query['metadata.projectId']) {
          query = { $and: [{ 'metadata.projectId': query['metadata.projectId'] }, centerFilter] };
        } else {
          query = centerFilter;
        }
      }
    } else if (hasViewOwnTickets) {
      // Users with TICKET_VIEW_OWN see tickets assigned to them within the filtered projects
      const projectFilter = query['metadata.projectId'] ? { 'metadata.projectId': query['metadata.projectId'] } : {};
      
      // Apply hierarchical filtering: if viewMode is team/hierarchy, include team member tickets
      const userFilter = appliedViewMode === 'self' 
        ? { $or: [{ assignedTo: userId }, { 'metadata.studentEmail': user.email }] }
        : targetUserIds.length > 0
          ? { assignedTo: { $in: targetUserIds } }
          : {};
      
      query = {
        $and: [
          projectFilter,
          userFilter
        ].filter(f => Object.keys(f).length > 0)
      };
      
      // If $and is empty, just use the user filter
      if (query.$and && query.$and.length === 0) {
        query = userFilter;

      }

      // Add center filtering for VIEW_OWN users with centers
      const userCenterIds = (user.centers || []).map((c: any) => 
        typeof c === 'string' ? c : c._id?.toString() || c.toString()
      );
      
      if (userCenterIds.length > 0) {
        const centerFilter = {
          $or: [
            { 'metadata.centerId': 'online' },
            { 'metadata.centerId': { $in: userCenterIds } },
            { 'metadata.centerId': { $exists: false } }
          ]
        };
        
        if (query.$and) {
          query.$and.push(centerFilter);
        } else {
          query = { $and: [query, centerFilter] };
        }
      }
    } else {
      // No ticket view permissions - show only tickets created by this user
      const projectFilter = query['metadata.projectId'] ? { 'metadata.projectId': query['metadata.projectId'] } : {};
      query = { ...projectFilter, 'metadata.studentEmail': user.email };
    }

    console.log(`📊 [DASHBOARD] Final query:`, JSON.stringify(query));

    // ===== SLA FIELD SELECTION BASED ON VIEW MODE =====
    // For 'self' view (My Ticket Dashboard): Use role-level SLA (resets on escalation)
    // For 'team'/'hierarchy' views: Use ticket-level SLA (overall from creation)
    const useRoleLevelSLA = appliedViewMode === 'self';
    const slaBreachedField = useRoleLevelSLA ? 'roleLevelSLA.breachedAt' : 'ticketLevelSLA.breachedAt';
    console.log(`📊 [DASHBOARD] Using ${useRoleLevelSLA ? 'ROLE-LEVEL' : 'TICKET-LEVEL'} SLA for viewMode: ${appliedViewMode}`);
    // ===== END SLA FIELD SELECTION =====

    // Optimized: Single aggregation instead of 11 sequential countDocuments calls
    // This reduces database round-trips from 12 to 2 (aggregation + recent activity)
    const [statsResult, recentActivity] = await Promise.all([
      Ticket.aggregate([
        { $match: query },
        {
          $facet: {
            // Total count
            total: [{ $count: 'count' }],
            
            // Status breakdown
            statusCounts: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ],
            
            // Priority breakdown
            priorityCounts: [
              {
                $group: {
                  _id: '$priority',
                  count: { $sum: 1 }
                }
              }
            ],
            
            // SLA stats for closed/resolved tickets - use appropriate SLA field
            closedSLA: [
              { $match: { status: { $in: [4, 5] } } },
              {
                $group: {
                  _id: {
                    $cond: {
                      if: { $ifNull: [useRoleLevelSLA ? '$roleLevelSLA.breachedAt' : '$ticketLevelSLA.breachedAt', null] },
                      then: true,
                      else: false
                    }
                  },
                  count: { $sum: 1 }
                }
              }
            ],
            
            // SLA stats for pending tickets - use appropriate SLA field
            pendingSLA: [
              { $match: { status: { $in: [1, 2, 3] } } },
              {
                $group: {
                  _id: {
                    $cond: {
                      if: { $ifNull: [useRoleLevelSLA ? '$roleLevelSLA.breachedAt' : '$ticketLevelSLA.breachedAt', null] },
                      then: true,
                      else: false
                    }
                  },
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]),
      
      // Get recent activity (last 5 tickets)
      Ticket.find(query)
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('ticketNumber title status updatedAt')
        .lean()
    ]);

    // Extract stats from aggregation result
    const stats = statsResult[0];
    const total = stats.total[0]?.count || 0;
    
    // Status counts
    const statusMap = new Map<number, number>(stats.statusCounts.map((s: any) => [s._id, s.count]));
    const pending = (statusMap.get(1) || 0) + (statusMap.get(2) || 0) + (statusMap.get(3) || 0);
    const resolved = statusMap.get(4) || 0;
    const closed = statusMap.get(5) || 0;
    
    // Priority counts
    const priorityMap = new Map<number, number>(stats.priorityCounts.map((p: any) => [p._id, p.count]));
    const highPriority = priorityMap.get(3) || 0;
    const mediumPriority = priorityMap.get(2) || 0;
    const lowPriority = priorityMap.get(1) || 0;
    
    // SLA stats for closed/resolved
    const closedSLAMap = new Map<boolean, number>(stats.closedSLA.map((s: any) => [s._id, s.count]));
    const closedWithinSLA = closedSLAMap.get(false) || 0;
    const closedOutsideSLA = closedSLAMap.get(true) || 0;
    
    // SLA stats for pending
    const pendingSLAMap = new Map<boolean, number>(stats.pendingSLA.map((s: any) => [s._id, s.count]));
    const pendingWithinSLA = pendingSLAMap.get(false) || 0;
    const pendingOutsideSLA = pendingSLAMap.get(true) || 0;

    const formattedActivity = recentActivity.map(ticket => ({
      ticketId: ticket._id.toString(),
      subject: ticket.subject,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
    }));

    // ===== TEAM BREAKDOWN (if permission exists and viewing team/hierarchy) =====
    let teamBreakdown: any[] | undefined = undefined;
    if (hasDashboardViewTeamBreakdown && (appliedViewMode === 'team' || appliedViewMode === 'hierarchy')) {
      // Fetch individual stats for each team member
      const breakdownPromises = [
        // Include the supervisor's own stats
        { userId, name: user.fullName || user.email, email: user.email },
        // Include reportees
        ...teamMembers.map(m => ({ userId: m.userId, name: m.fullName || m.name || m.email, email: m.email }))
      ].map(async (member) => {
        const memberQuery = { ...query, assignedTo: new mongoose.Types.ObjectId(member.userId) };
        const memberStats = await Ticket.aggregate([
          { $match: memberQuery },
          {
            $facet: {
              total: [{ $count: 'count' }],
              statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
              priorityCounts: [{ $group: { _id: '$priority', count: { $sum: 1 } } }]
            }
          }
        ]);

        const memberStatsData = memberStats[0];
        const total = memberStatsData.total[0]?.count || 0;
        const statusMap = new Map<number, number>(memberStatsData.statusCounts.map((s: any) => [s._id, s.count]));
        const pending = (statusMap.get(1) || 0) + (statusMap.get(2) || 0) + (statusMap.get(3) || 0);
        const resolved = statusMap.get(4) || 0;
        const closed = statusMap.get(5) || 0;
        const priorityMap = new Map<number, number>(memberStatsData.priorityCounts.map((p: any) => [p._id, p.count]));
        const highPriority = priorityMap.get(3) || 0;
        const mediumPriority = priorityMap.get(2) || 0;
        const lowPriority = priorityMap.get(1) || 0;

        return {
          userId: member.userId,
          name: member.name,
          email: member.email,
          stats: {
            total,
            pending,
            resolved,
            closed,
            highPriority,
            mediumPriority,
            lowPriority
          }
        };
      });

      teamBreakdown = await Promise.all(breakdownPromises);
    }
    // ===== END TEAM BREAKDOWN =====

    return res.status(200).json({
      success: true,
      viewMode: appliedViewMode, // Return which view mode was applied
      total,
      pending,
      resolved,
      closed,
      highPriority,
      mediumPriority,
      lowPriority,
      withinSLA: closedWithinSLA,
      outsideSLA: closedOutsideSLA,
      pendingWithinSLA,
      pendingOutsideSLA,
      recentActivity: formattedActivity,
      teamBreakdown, // Include team breakdown if applicable
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
    const { projectId, centerId, viewMode } = req.query;
    
    // viewMode: 'self' (own tickets), 'team' (direct reports), 'hierarchy' (all levels), 'all' (everything)
    const effectiveViewMode = (viewMode as string) || 'self';

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
      centerId,
      viewMode: effectiveViewMode,
      permissionCount: userPermissions.length
    });

    // Build query based on user permissions
    // Handle both ObjectId and string for metadata.projectId (some tickets may have string, others ObjectId)
    let projectIdFilter: any;
    try {
      const projectObjectId = new mongoose.Types.ObjectId(projectId as string);
      // Query both ObjectId and string representations
      projectIdFilter = {
        $or: [
          { 'metadata.projectId': projectObjectId },
          { 'metadata.projectId': projectId as string }
        ]
      };
    } catch (e) {
      projectIdFilter = { 'metadata.projectId': projectId }; // Fallback to string only
    }
    let query: any = projectIdFilter;
    
    // Apply center filter if provided (for offline mode)
    if (centerId) {
      query['metadata.centerId'] = centerId;
      console.log('🏢 Filtering dashboard stats by center:', centerId);
    }
    
    // ✅ DASHBOARD USES DASHBOARD_VIEW_HIERARCHY PERMISSION (NOT TICKET_VIEW_ALL)
    // This ensures: 
    // - My Queries shows only assigned tickets (uses assignedTo filter)
    // - Ticket Lists uses TICKET_VIEW_ALL (for assignment/viewing all)
    // - Dashboard uses DASHBOARD_VIEW_HIERARCHY (for hierarchy view)
    const hasDashboardHierarchyPermission = await checkPermission('DASHBOARD_VIEW_HIERARCHY');
    
    console.log('🔑 Dashboard Permission Check:', { 
      hasDashboardHierarchyPermission, 
      isAgent, 
      userId,
      userEmail: user.email 
    });
    
    // Check if user is a student (students create tickets, not get assigned)
    const isStudent = userRole?.code === 'STUDENT';
    
    if (isStudent) {
      // Students see only tickets they created (not assigned)
      query['metadata.studentEmail'] = user.email;
      console.log('✅ Student user - showing tickets created by:', user.email);
      console.log('Query filter:', JSON.stringify(query, null, 2));
    } else if (effectiveViewMode === 'self') {
      // Self mode: show only own assigned tickets, regardless of permissions
      query.assignedTo = new mongoose.Types.ObjectId(userId);
      console.log('✅ viewMode=self - showing only own assigned tickets');
    } else if (effectiveViewMode === 'hierarchy' && hasDashboardHierarchyPermission) {
      // Hierarchy mode: show own tickets + reportee tickets (only if user has permission)
      console.log('✅ viewMode=hierarchy with DASHBOARD_VIEW_HIERARCHY - fetching self + reportee tickets');
      
      try {
        const { UserReportingHierarchy } = require('../models/UserReportingHierarchy');
        const allReportees = await UserReportingHierarchy.getAllReporteesRecursive(userId);
        const reporteeIds = allReportees.map((r: any) => new mongoose.Types.ObjectId(r._id));
        
        console.log('📊 Found reportees:', reporteeIds.length);
        console.log('📊 Reportee IDs:', reporteeIds.map((id: any) => id.toString()));
        
        // Include self + all reportees (hierarchy = self + below)
        const allUserIds = [new mongoose.Types.ObjectId(userId), ...reporteeIds];
        query.assignedTo = { $in: allUserIds };
        console.log('✅ Dashboard showing tickets assigned to self + reportees (total:', allUserIds.length, 'users)');
      } catch (error) {
        console.error('❌ Error fetching reportees:', error);
        // Fallback to own tickets on error
        query.assignedTo = new mongoose.Types.ObjectId(userId);
        console.log('⚠️ Error fetching reportees - fallback to own tickets');
      }
    } else {
      // Other modes or no hierarchy permission - show only own assigned tickets
      query.assignedTo = new mongoose.Types.ObjectId(userId);
      console.log('✅ Dashboard showing only own assigned tickets (viewMode:', effectiveViewMode, ')');
      console.log('Query filter:', JSON.stringify(query, null, 2));
    }

    // Get SLARule model for SLA calculations (SLA Rules contain priority settings)
    let priorities: any[] = [];
    let priorityMap = new Map();
    let priorityIdMap = new Map();
    
    try {
      const SLARule = require('../models/sla-module/SLARule').SLARule;
      
      // Get all SLA Rules for this project to calculate SLA deadlines
      console.log('🔍 Searching for SLA Rules with projectId:', projectId);
      
      const slaRules = await SLARule.find({ 
        projectIds: { $in: [projectId] },
        isActive: true 
      });
      
      console.log('📋 Found SLA Rules for project:', slaRules.length);
      console.log('📋 Available SLA Rules:', slaRules.map((s: any) => `${s.name} (${s.priority}) [ID: ${s._id}] - Resolution: ${s.resolutionTime?.value} ${s.resolutionTime?.unit}`));
      
      // Map SLA Rules by priority name
      priorities = slaRules;
      priorityMap = new Map(slaRules.map((s: any) => [
        s.priority ? s.priority.toUpperCase().trim() : s.name.toUpperCase().trim(),
        {
          name: s.priority || s.name,
          resolutionTime: s.resolutionTime,
          _id: s._id
        }
      ]));
      priorityIdMap = new Map(slaRules.map((s: any) => [
        s._id.toString(), 
        {
          name: s.priority || s.name,
          resolutionTime: s.resolutionTime,
          _id: s._id
        }
      ]));
    } catch (error) {
      console.error('❌ Error loading SLA Rules:', error);
      console.log('⚠️ Continuing without SLA Rules - will use defaults');
    }

    // Get ObjectIds for each priority level for matching
    // SLA Rules use priority field (High, Medium, Low, Critical, Urgent) or name
    const highPriorityIds = priorities
      .filter((s: any) => {
        const prio = (s.priority || s.name || '').toUpperCase();
        return ['HIGH', 'CRITICAL', 'URGENT'].includes(prio);
      })
      .map((s: any) => s._id);
    
    const mediumPriorityIds = priorities
      .filter((s: any) => {
        const prio = (s.priority || s.name || '').toUpperCase();
        return ['MEDIUM', 'NORMAL'].includes(prio);
      })
      .map((s: any) => s._id);
    
    const lowPriorityIds = priorities
      .filter((s: any) => {
        const prio = (s.priority || s.name || '').toUpperCase();
        return prio === 'LOW';
      })
      .map((s: any) => s._id);

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
                ticketNumber: 1,
                priority: 1,
                status: 1,
                createdAt: 1,
                updatedAt: 1,
                resolvedAt: 1,
                closedAt: 1,
                changeHistory: 1
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
    let pendingWithinSLA = 0;
    let pendingOutsideSLA = 0;
    
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
          console.log(`⚠️ No priority settings found for ticket ${ticket._id}, priority: ${JSON.stringify(ticket.priority)} (type: ${typeof ticket.priority}) - Using default SLA times`);
          // Use default SLA times when no Priority document exists
          const priorityStr = typeof ticket.priority === 'string' ? ticket.priority.toUpperCase() : 'MEDIUM';
          const defaultSLATimes: Record<string, { value: number; unit: string }> = {
            'CRITICAL': { value: 4, unit: 'hours' },
            'HIGH': { value: 24, unit: 'hours' },
            'MEDIUM': { value: 72, unit: 'hours' },
            'LOW': { value: 168, unit: 'hours' } // 7 days
          };
          prioritySettings = {
            name: priorityStr,
            resolutionTime: defaultSLATimes[priorityStr] || defaultSLATimes['MEDIUM']
          };
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
      
      // SLA Calculation Logic:
      // For resolved/closed tickets (status 4 or 5): Check actual resolution/closure time against SLA deadline
      // For open/pending tickets (status 1, 2, or 3): Check current time against SLA deadline
      const isResolved = ticket.status === 4; // 4 = Resolved
      const isClosed = ticket.status === 5;   // 5 = Closed
      const isPending = ticket.status === 1 || ticket.status === 2 || ticket.status === 3; // 1=Open, 2=In Progress, 3=On Hold
      
      if (isResolved || isClosed) {
        // Determine completion time - try multiple sources:
        // 1. Use resolvedAt/closedAt if available (new tickets)
        // 2. Look in changeHistory for status change (existing tickets)
        // 3. Fall back to updatedAt (least accurate but better than nothing)
        let completionTime: Date | null = null;
        
        if (isResolved && ticket.resolvedAt) {
          completionTime = new Date(ticket.resolvedAt);
        } else if (isClosed && ticket.closedAt) {
          completionTime = new Date(ticket.closedAt);
        } else if (ticket.changeHistory && ticket.changeHistory.length > 0) {
          // Find the status change to Resolved (4) or Closed (5) in changeHistory
          const statusChange = ticket.changeHistory.find((change: any) => 
            change.field === 'Status' && 
            (change.newValue === '4' || change.newValue === '5')
          );
          if (statusChange && statusChange.changedAt) {
            completionTime = new Date(statusChange.changedAt);
          }
        }
        
        // If still no completion time, fall back to updatedAt
        if (!completionTime) {
          completionTime = new Date(ticket.updatedAt || ticket.createdAt);
        }
        
        const wasCompletedWithinSLA = completionTime <= slaDeadline;
        
        if (wasCompletedWithinSLA) {
          withinSLA++;
          const timeTaken = completionTime.getTime() - createdAt.getTime();
          const hoursTaken = Math.floor(timeTaken / (1000 * 60 * 60));
          const minutesTaken = Math.floor((timeTaken % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`✅ Ticket ${ticket.ticketNumber || ticket._id}: ${isResolved ? 'RESOLVED' : 'CLOSED'} within SLA - Took ${hoursTaken}h ${minutesTaken}m (Deadline: ${slaDeadline.toISOString()})`);
        } else {
          outsideSLA++;
          const overdueTime = completionTime.getTime() - slaDeadline.getTime();
          const hoursOverdue = Math.floor(overdueTime / (1000 * 60 * 60));
          const minutesOverdue = Math.floor((overdueTime % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`❌ Ticket ${ticket.ticketNumber || ticket._id}: ${isResolved ? 'RESOLVED' : 'CLOSED'} AFTER SLA - ${hoursOverdue}h ${minutesOverdue}m late (Deadline: ${slaDeadline.toISOString()}, Completed: ${completionTime.toISOString()})`);
        }
      } else if (isPending) {
        // For open/pending tickets, check if current time has crossed SLA deadline
        const isPendingWithinSLA = now <= slaDeadline;
        
        if (isPendingWithinSLA) {
          pendingWithinSLA++;
          const remainingTime = slaDeadline.getTime() - now.getTime();
          const hoursRemaining = Math.floor(remainingTime / (1000 * 60 * 60));
          const minutesRemaining = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`⏳ Ticket ${ticket.ticketNumber || ticket._id}: PENDING within SLA - ${hoursRemaining}h ${minutesRemaining}m remaining (Deadline: ${slaDeadline.toISOString()})`);
        } else {
          pendingOutsideSLA++;
          const overdueTime = now.getTime() - slaDeadline.getTime();
          const hoursOverdue = Math.floor(overdueTime / (1000 * 60 * 60));
          const minutesOverdue = Math.floor((overdueTime % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`🔥 Ticket ${ticket.ticketNumber || ticket._id}: PENDING OUTSIDE SLA - ${hoursOverdue}h ${minutesOverdue}m overdue (Deadline: ${slaDeadline.toISOString()})`);
        }
      }
    }
    
    console.log('📊 SLA Calculation:', {
      totalTicketsChecked: allTickets.length,
      closedWithinSLA: withinSLA,
      closedOutsideSLA: outsideSLA,
      pendingWithinSLA,
      pendingOutsideSLA
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
        pendingWithinSLA,
        pendingOutsideSLA,
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
      categoryHierarchy, // Hierarchical category data (JSON string with level1, level2, level3, level4)
      priority,
      projectId,
      centerId,     // Center ID for offline ticket
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
    console.log('  categoryHierarchy:', categoryHierarchy);
    console.log('  projectId:', projectId);

    // Validate required fields (handle both capitalized and lowercase field names)
    const hasDescription = Description || description;
    // Category can come from either direct field OR from categoryHierarchy
    const hasCategoryData = Category || category || categoryHierarchy;
    
    if (!studentId || !hasDescription || !hasCategoryData || !projectId) {
      console.log('❌ Validation failed - missing fields');
      console.log('  studentId present:', !!studentId);
      console.log('  Subject present:', !!Subject);
      console.log('  Title present:', !!Title);
      console.log('  Description present:', !!Description);
      console.log('  description present:', !!description);
      console.log('  category present:', !!category);
      console.log('  Category present:', !!Category);
      console.log('  categoryHierarchy present:', !!categoryHierarchy);
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

    // Get the agent's full details including centers
    const agentDetails = await User.findById(agent.userId).select('centers firstName lastName email');
    if (!agentDetails) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    // Use the agent's first center (if available) as the ticket's center
    // This ensures the ticket is mapped to the same center as the agent creating it
    let ticketCenterId: any = null;
    
    if (agentDetails.centers && agentDetails.centers.length > 0) {
      // Agent has centers assigned - use the first one
      ticketCenterId = agentDetails.centers[0];
      console.log(`📍 Using agent's first center: ${ticketCenterId}`);
    } else if (centerId) {
      // No agent centers, but centerId provided in request
      ticketCenterId = centerId;
      console.log(`📍 Using centerId from request: ${ticketCenterId}`);
    } else {
      // No center available - this will be an online ticket
      ticketCenterId = null;
      console.log(`📍 No center available - ticket will be marked as online`);
    }
    
    console.log(`📍 Agent Center Mapping: Agent ${agent.email} has ${agentDetails.centers?.length || 0} center(s)`);
    console.log(`📍 Final Center ID for ticket: ${ticketCenterId}`);

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

    // Parse categoryHierarchy and determine final category ID
    // With hierarchical categories, the deepest selected level is used as the ticket's category
    console.time('⏱️ Category & Priority lookup (offline)');
    let ticketPriority = 'medium'; // Default fallback
    let finalCategoryId: string | null = null;
    let parsedHierarchy: { level1?: string; level2?: string; level3?: string; level4?: string; displayPath?: string } = {};
    
    try {
      // Use mongoose.models to ensure the model is available
      const CategoryModel = mongoose.models.Category || Category;
      
      // Parse categoryHierarchy if provided (JSON string from frontend)
      if (categoryHierarchy) {
        try {
          parsedHierarchy = typeof categoryHierarchy === 'string' 
            ? JSON.parse(categoryHierarchy) 
            : categoryHierarchy;
          console.log('📋 Parsed categoryHierarchy:', parsedHierarchy);
        } catch (parseError) {
          console.error('Error parsing categoryHierarchy:', parseError);
        }
      }
      
      // Determine final category ID: use deepest level from hierarchy OR fallback to category field
      finalCategoryId = parsedHierarchy.level4 || parsedHierarchy.level3 || parsedHierarchy.level2 || parsedHierarchy.level1 || category || Category;
      
      if (!finalCategoryId) {
        console.log('⚠️ No category ID found from hierarchy or direct field');
      } else {
        console.log(`📌 Final category ID: ${finalCategoryId}`);
      }
      
      // Look up priority from hierarchy levels (deepest with priority wins)
      // Also collect category names to build displayPath
      // Check levels in order: level1 -> level2 -> level3 -> level4 for names, but deepest priority wins
      const hierarchyLevelsForPriority = [
        parsedHierarchy.level4,
        parsedHierarchy.level3,
        parsedHierarchy.level2,
        parsedHierarchy.level1
      ].filter(Boolean);
      
      const hierarchyLevelsForNames = [
        parsedHierarchy.level1,
        parsedHierarchy.level2,
        parsedHierarchy.level3,
        parsedHierarchy.level4
      ].filter(Boolean);
      
      console.log(`🔍 Checking ${hierarchyLevelsForPriority.length} hierarchy levels for priority`);
      
      let priorityFound = false;
      const categoryNames: string[] = [];
      
      // First, collect all category names in order (level1 -> level4)
      for (const levelId of hierarchyLevelsForNames) {
        if (!levelId || !mongoose.Types.ObjectId.isValid(levelId)) continue;
        
        const levelCategory = await CategoryModel.findOne({
          _id: levelId,
          projectId: new mongoose.Types.ObjectId(projectId),
          isActive: true
        });
        
        if (levelCategory) {
          categoryNames.push(levelCategory.name);
        }
      }
      
      // Build displayPath from category names
      if (categoryNames.length > 0) {
        parsedHierarchy.displayPath = categoryNames.join(' > ');
        console.log(`📝 Built displayPath: ${parsedHierarchy.displayPath}`);
      }
      
      // Now check for priority (deepest with priority wins)
      for (const levelId of hierarchyLevelsForPriority) {
        if (!levelId || !mongoose.Types.ObjectId.isValid(levelId)) continue;
        
        const levelCategory = await CategoryModel.findOne({
          _id: levelId,
          projectId: new mongoose.Types.ObjectId(projectId),
          isActive: true
        });
        
        if (levelCategory) {
          console.log(`  Level ${levelId}: ${levelCategory.name}, defaultPriority: ${levelCategory.defaultPriority || 'not set'}`);
          
          if (levelCategory.defaultPriority && !priorityFound) {
            ticketPriority = levelCategory.defaultPriority.toLowerCase();
            priorityFound = true;
            console.log(`  ✅ Found priority '${ticketPriority}' from level: ${levelCategory.name}`);
          }
        }
      }
      
      // Fallback: If no priority found in hierarchy, try the direct category field
      if (!priorityFound && finalCategoryId && mongoose.Types.ObjectId.isValid(finalCategoryId)) {
        const directCategory = await CategoryModel.findOne({
          _id: finalCategoryId,
          projectId: new mongoose.Types.ObjectId(projectId),
          isActive: true
        });
        
        if (directCategory && directCategory.defaultPriority) {
          ticketPriority = directCategory.defaultPriority.toLowerCase();
          console.log(`✅ Using priority from direct category: ${ticketPriority} (${directCategory.name})`);
        }
      }
      
      if (!priorityFound) {
        console.log(`⚠️ No priority found in hierarchy, using fallback: ${ticketPriority}`);
      }
    } catch (error) {
      console.error('Error fetching category/priority for offline ticket:', error);
    }
    console.timeEnd('⏱️ Category & Priority lookup (offline)');

    // Create ticket (priority is now dynamic based on hierarchy level defaultPriority)
    const ticket = await Ticket.create({
      ticketNumber,
      subject: ticketSubject,
      description: ticketDescription,
      category: finalCategoryId,
      categoryHierarchy: Object.keys(parsedHierarchy).length > 0 ? parsedHierarchy : undefined, // Store hierarchy at root level for display
      priority: ticketPriority, // Now dynamic based on category defaultPriority
      status: ticketStatus,
      createdBy: new mongoose.Types.ObjectId(studentId), // Ticket owned by student
      assignedTo: new mongoose.Types.ObjectId(assignedToAgentId), // Assign to escalated agent or creating agent
      submissionSource: 'offline', // Mark as offline submission
      attachments,
      tags: [`agent-submission`, `project-${projectId}`, 'offline'], // Add 'offline' tag for offline submissions
      metadata: {
        projectId,
        centerId: ticketCenterId, // Associate ticket with agent's center
        submissionType: submissionType || 'offline',
        studentEmail: student.email,
        studentName: `${student.firstName} ${student.lastName}`,
        studentPhone: (student as any).phone,
        createdByAgent: agent.userId,
        createdByAgentEmail: agent.email,
        resolvedAtCreation: resolvedAtCreation === 'true',
        categoryHierarchy: parsedHierarchy, // Store full hierarchy for reference
      },
      threads: [],
      escalationHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add system message about offline creation
    ticket.threads!.push({
      message: `Query created by ${agent.firstName} ${agent.lastName} (Agent) on behalf of student during offline support.`,
      createdBy: new mongoose.Types.ObjectId(agent.userId),
      isSystemMessage: true,
      attachments: [],
      createdAt: new Date(),
    } as any);

    // Add assignment message
    if (!escalateTo) {
      // Query assigned to creating agent
      ticket.threads!.push({
        message: `Query assigned to ${agent.firstName} ${agent.lastName} (Counselor).`,
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
    
    // Initialize priority-level SLA tracking (non-blocking) - sets embedded ticketLevelSLA and roleLevelSLA
    (async () => {
      try {
        // Get working calendar for the project
        const calendar = await slaService.getDefaultWorkingCalendar(projectId);
        
        // Get priority details - first try Priority model, fallback to SLARule
        let priority = await Priority.findOne({ 
          code: ticketPriority.toUpperCase(),
          projectId: projectId 
        });
        
        // Fallback: If no Priority record exists, try to get resolution time from SLARule
        if (!priority) {
          const SLARule = (await import('../models/sla-module/SLARule')).default;
          const slaRule = await SLARule.findOne({
            projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
            priority: ticketPriority.toUpperCase(),
            isActive: true
          });
          
          if (slaRule) {
            // Create a virtual priority object from SLA rule
            priority = {
              code: ticketPriority.toUpperCase(),
              resolutionTime: slaRule.resolutionTime,
              responseTime: slaRule.responseTime || { value: 1, unit: 'hours' }
            } as any;
            console.log(`📋 Using SLARule for priority ${ticketPriority}: ${JSON.stringify(slaRule.resolutionTime)}`);
          }
        }
        
        if (priority && calendar) {
          // Calculate ticket-level SLA
          const ticketSLADueDate = await slaService.calculateTicketLevelSLA(
            ticket.createdAt,
            priority.code,
            project._id as mongoose.Types.ObjectId,
            calendar._id as mongoose.Types.ObjectId
          );
          
          if (ticketSLADueDate) {
            ticket.ticketLevelSLA = {
              dueAt: ticketSLADueDate,
              pausedDuration: 0,
            };
            
            // If ticket has escalation matrix, initialize role-level SLA
            if (ticket.escalationMatrixId) {
              const matrix = await EscalationMatrix.findById(ticket.escalationMatrixId);
              if (matrix && ticket.currentEscalationLevelNumber) {
                const roleSLADueDate = await slaService.calculateRoleLevelSLA(
                  ticket.createdAt,
                  matrix,
                  ticket.currentEscalationLevelNumber,
                  priority.code,
                  calendar._id as mongoose.Types.ObjectId
                );
                
                if (roleSLADueDate) {
                  ticket.roleLevelSLA = {
                    startedAt: ticket.createdAt,
                    dueAt: roleSLADueDate,
                    pausedDuration: 0,
                  };
                }
              }
            }
            
            ticket.workingCalendarId = calendar._id as any;
            await ticket.save();
            console.log(`✅ Priority-level SLA tracking initialized for offline ticket ${ticket.ticketNumber}`);
          }
        }
      } catch (error) {
        console.error('❌ Failed to initialize priority-level SLA tracking for offline ticket:', error);
      }
    })();
    
    // Initialize SLA tracking for the new ticket (non-blocking) - legacy SLATracking model
    (async () => {
      try {
        await initializeSLATracking(
          ticket._id,
          new mongoose.Types.ObjectId(projectId),
          ticketPriority,
          ticket.createdAt
        );
        console.log(`✅ SLA tracking initialized for offline ticket ${ticketNumber}`);
      } catch (error) {
        console.error('❌ Failed to initialize SLA tracking for offline ticket:', error);
      }
    })();
    
    // Auto-assign escalation matrix based on project and priority (BLOCKING - needed for SLA timer)
    let escalationMatrixAssigned = false;
    try {
      const result = await autoAssignMatrixToTicket(ticket._id, projectId, ticketPriority);
      if (result.success) {
        console.log(`✅ Escalation matrix auto-assigned for offline ticket ${ticketNumber}`);
        escalationMatrixAssigned = true;
        // Refresh ticket to get updated escalation matrix fields
        const updatedTicket = await Ticket.findById(ticket._id);
        if (updatedTicket) {
          // Copy escalation matrix fields to our ticket object for response
          (ticket as any).escalationMatrixId = updatedTicket.escalationMatrixId;
          (ticket as any).currentEscalationLevelId = updatedTicket.currentEscalationLevelId;
          (ticket as any).currentEscalationLevelNumber = updatedTicket.currentEscalationLevelNumber;
          (ticket as any).roleLevelSLA = updatedTicket.roleLevelSLA;
        }
      } else {
        console.log(`ℹ️ No escalation matrix for offline ticket ${ticketNumber}: ${result.message}`);
      }
    } catch (error) {
      console.error('❌ Failed to auto-assign escalation matrix for offline ticket:', error);
    }
    
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
        escalationMatrixId: (ticket as any).escalationMatrixId,
        currentEscalationLevelNumber: (ticket as any).currentEscalationLevelNumber,
        roleLevelSLA: (ticket as any).roleLevelSLA,
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
 * Returns users based on hierarchy:
 * - The current user themselves (so they can self-assign)
 * - All reportees under the current user (from UserReportingHierarchy)
 * Falls back to project-based filtering if no hierarchy is configured
 */
export const getAssignableAgents = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { projectId, useHierarchy } = req.query; // useHierarchy defaults to true
    
    // Get current user with their role (which contains projects)
    const currentUser = await User.findById(userId).populate('role');
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Get projects from user's role (new standardized approach)
    const userRole = await Role.findById(currentUser.role).populate('projects');
    
    if (!userRole) {
      console.log('❌ User role not found');
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
    
    // Check if user is Super Admin - they can see all agents
    const isSuperAdmin = (userRole as any).code === 'SUPER_ADMIN';
    
    console.log('🔍 Fetching assignable agents for user:', {
      userId,
      email: currentUser.email,
      role: userRole?.name,
      roleCode: userRole?.code,
      isSuperAdmin,
      projectId,
      useHierarchy: useHierarchy !== 'false' // Default to true
    });
    
    // ============ HIERARCHY-BASED FILTERING ============
    // If hierarchy mode is enabled (default), use reporting hierarchy from User.reportingManager
    if (useHierarchy !== 'false' && !isSuperAdmin) {
      try {
        // Get all users who have current user as their reportingManager (direct + recursive)
        const getAllReporteesRecursive = async (managerId: mongoose.Types.ObjectId, visited = new Set<string>()): Promise<mongoose.Types.ObjectId[]> => {
          const managerIdStr = managerId.toString();
          if (visited.has(managerIdStr)) return []; // Prevent infinite loops
          visited.add(managerIdStr);
          
          // Find all users who report to this manager
          const directReportees = await User.find({ reportingManager: managerId }).select('_id').lean();
          const reporteeIds = directReportees.map((r: any) => r._id as mongoose.Types.ObjectId);
          
          // Recursively get reportees of reportees
          const allReportees: mongoose.Types.ObjectId[] = [...reporteeIds];
          for (const reporteeId of reporteeIds) {
            const subReportees = await getAllReporteesRecursive(reporteeId, visited);
            allReportees.push(...subReportees);
          }
          
          return allReportees;
        };
        
        const currentUserObjectId = new mongoose.Types.ObjectId(userId);
        const allReporteeIds = await getAllReporteesRecursive(currentUserObjectId);
        
        console.log('📊 Hierarchy found (using User.reportingManager) - reportees:', allReporteeIds.length);
        
        // Build list: current user + all reportees
        const assignableUserIds = [currentUserObjectId, ...allReporteeIds];
        
        // Fetch user details for these IDs
        let assignableQuery: any = {
          _id: { $in: assignableUserIds },
          isActive: true
        };
        
        // If projectId is provided, ensure users have access to that project via their role
        if (projectId) {
          const projectObjectId = new mongoose.Types.ObjectId(projectId as string);
          const rolesInProject = await Role.find({
            projects: projectObjectId,
            isActive: true
          }).select('_id');
          const roleIdsInProject = rolesInProject.map(r => r._id);
          assignableQuery.role = { $in: roleIdsInProject };
          console.log('🎯 Filtering by project:', projectId, '- roles found:', roleIdsInProject.length);
        }
        
        const agents = await User.find(assignableQuery)
          .populate('role', 'name isAgent code')
          .populate('centers', 'centerName')
          .select('_id firstName lastName email role centers')
          .sort({ firstName: 1, lastName: 1 });
        
        console.log('✅ Found assignable agents (hierarchy mode):', {
          count: agents.length,
          agents: agents.map(a => `${a.firstName} ${a.lastName} (${(a.role as any)?.name}) - Centers: ${(a as any).centers?.map((c: any) => c.centerName).join(', ') || 'None'}`)
        });
        
        return res.status(200).json({
          success: true,
          data: agents,
          mode: 'hierarchy'
        });
        
      } catch (hierarchyError) {
        console.log('⚠️ Hierarchy fetch failed, falling back to project-based:', hierarchyError);
        // Fall through to project-based filtering
      }
    }
    
    // ============ FALLBACK: PROJECT-BASED FILTERING ============
    // For Super Admin or when hierarchy is disabled/fails
    
    const userProjectIds = (userRole?.projects || []).map((p: any) => 
      typeof p === 'string' ? p : p._id?.toString() || p.toString()
    );
    
    // Super Admin can see all agents regardless of project assignment
    if (userProjectIds.length === 0 && !isSuperAdmin) {
      console.log('⚠️ User role has no projects assigned');
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
    
    // For Super Admin without specific projects, get ALL agents
    let targetProjectIds = userProjectIds;
    if (isSuperAdmin && userProjectIds.length === 0) {
      // Get all active projects
      const allProjects = await Project.find({ status: 'active' }).select('_id');
      targetProjectIds = allProjects.map(p => p._id.toString());
      console.log('👑 Super Admin - fetching agents from all projects:', targetProjectIds.length);
    }
    
    // If projectId is provided, filter to only that project
    if (projectId) {
      const projectIdStr = projectId.toString();
      // Super Admin can access any project
      if (isSuperAdmin || userProjectIds.includes(projectIdStr)) {
        targetProjectIds = [projectIdStr];
        console.log('🎯 Filtering agents for specific project:', projectIdStr);
      } else {
        console.log('⚠️ User does not have access to requested project:', projectIdStr);
        return res.status(200).json({
          success: true,
          data: [],
        });
      }
    }
    
    const userCenterIds = (currentUser.centers || []).map((c: any) => 
      typeof c === 'string' ? c : c._id?.toString() || c.toString()
    );
    
    console.log('🔍 Project-based agent filtering:', {
      targetProjectIds,
      centers: userCenterIds
    });
    
    // Find all roles where isAgent = true AND are mapped to the target projects
    // Convert targetProjectIds to ObjectIds for proper comparison
    const projectObjectIds = targetProjectIds.map(id => new mongoose.Types.ObjectId(id));
    
    const agentRoles = await Role.find({ 
      isAgent: true, 
      isActive: true,
      projects: { $in: projectObjectIds } // Only roles mapped to user's projects
    }).populate('projects', 'name code');
    
    const agentRoleIds = agentRoles.map(role => role._id);
    
    console.log('📋 Found agent roles in current project(s):', {
      count: agentRoles.length,
      roles: agentRoles.map(r => ({
        name: r.name,
        code: r.code,
        projects: (r.projects as any[])?.map((p: any) => p.name || p)
      }))
    });
    
    if (agentRoleIds.length === 0) {
      console.log('✅ No agent roles found in current project - returning empty list');
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
    
    // Build agent query - find users with agent roles
    const agentQuery: any = {
      isActive: true,
      role: { $in: agentRoleIds }
    };
    
    // If user has centers assigned (and is NOT Super Admin), also filter agents by shared centers (for offline mode)
    // Super Admin should see all agents regardless of center assignment
    if (userCenterIds.length > 0 && !isSuperAdmin) {
      agentQuery.centers = { $in: userCenterIds };
      console.log('🏢 Filtering agents by shared centers:', userCenterIds);
    } else if (isSuperAdmin) {
      console.log('👑 Super Admin - not filtering by centers');
    }
    
    // Find all active users who:
    // 1. Have a role with isAgent = true
    // 2. Role is mapped to the same project(s) as current user
    // 3. Share at least one center with the current user (if user has centers)
    const agents = await User.find(agentQuery)
    .populate('role', 'name isAgent code')
    .populate('centers', 'centerName')
    .select('_id firstName lastName email role centers')
    .sort({ firstName: 1, lastName: 1 });
    
    console.log('✅ Found assignable agents (project mode):', {
      count: agents.length,
      agents: agents.map(a => `${a.firstName} ${a.lastName} (${(a.role as any)?.name}) - Centers: ${(a as any).centers?.map((c: any) => c.centerName).join(', ') || 'None'}`)
    });
    
    return res.status(200).json({
      success: true,
      data: agents,
      mode: 'project'
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

/**
 * Get SLA status for a ticket
 * GET /api/tickets/:id/sla-status
 */
export const getSLAStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const ticket = await Ticket.findById(id)
      .populate('metadata.projectId')
      .populate('workingCalendarId');
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }
    
    const now = new Date();
    const result: any = {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      ticketLevelSLA: null,
      roleLevelSLA: null,
    };
    
    // Calculate ticket-level SLA remaining time
    if (ticket.ticketLevelSLA?.dueAt) {
      const calendar = ticket.workingCalendarId as any;
      const remainingMinutes = await slaService.calculateRemainingTime(
        ticket.ticketLevelSLA.dueAt,
        ticket.ticketLevelSLA.pausedAt,
        ticket.ticketLevelSLA.pausedDuration || 0,
        calendar
      );
      
      result.ticketLevelSLA = {
        startedAt: ticket.createdAt,
        dueAt: ticket.ticketLevelSLA.dueAt,
        breachedAt: ticket.ticketLevelSLA.breachedAt,
        isPaused: !!ticket.ticketLevelSLA.pausedAt,
        pausedAt: ticket.ticketLevelSLA.pausedAt,
        pausedDuration: ticket.ticketLevelSLA.pausedDuration,
        remainingMinutes: remainingMinutes,
        isBreached: remainingMinutes < 0,
        breachInMinutes: remainingMinutes < 0 ? Math.abs(remainingMinutes) : 0,
      };
    }
    
    // Calculate role-level SLA remaining time
    if (ticket.roleLevelSLA?.dueAt) {
      const calendar = ticket.workingCalendarId as any;
      const roleRemainingMinutes = await slaService.calculateRemainingTime(
        ticket.roleLevelSLA.dueAt,
        ticket.roleLevelSLA.pausedAt,
        ticket.roleLevelSLA.pausedDuration || 0,
        calendar
      );
      
      result.roleLevelSLA = {
        startedAt: ticket.roleLevelSLA.startedAt,
        dueAt: ticket.roleLevelSLA.dueAt,
        breachedAt: ticket.roleLevelSLA.breachedAt,
        isPaused: !!ticket.roleLevelSLA.pausedAt,
        pausedAt: ticket.roleLevelSLA.pausedAt,
        pausedDuration: ticket.roleLevelSLA.pausedDuration,
        remainingMinutes: roleRemainingMinutes,
        isBreached: roleRemainingMinutes < 0,
        breachInMinutes: roleRemainingMinutes < 0 ? Math.abs(roleRemainingMinutes) : 0,
      };
    }
    
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Get SLA status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get SLA status',
      error: error.message,
    });
  }
};

/**
 * Pause SLA for a ticket
 * POST /api/tickets/:id/pause-sla
 */
export const pauseSLA = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userName = (req as any).user?.userName || (req as any).user?.name || 'Unknown';
    const userEmail = (req as any).user?.email || 'unknown@email.com';
    
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }
    
    const now = new Date();
    
    // Pause ticket-level SLA
    if (ticket.ticketLevelSLA && !ticket.ticketLevelSLA.pausedAt) {
      ticket.ticketLevelSLA.pausedAt = now;
    }
    
    // Pause role-level SLA
    if (ticket.roleLevelSLA && !ticket.roleLevelSLA.pausedAt) {
      ticket.roleLevelSLA.pausedAt = now;
    }
    
    await ticket.save();
    
    // Log activity
    await logActivity({
      action: 'update',
      entity: 'Ticket',
      entityId: ticket._id.toString(),
      userId,
      userName,
      userEmail,
      description: `SLA paused for ticket ${ticket.ticketNumber}`,
    });
    
    return res.status(200).json({
      success: true,
      message: 'SLA paused successfully',
      data: {
        ticketLevelSLA: ticket.ticketLevelSLA,
        roleLevelSLA: ticket.roleLevelSLA,
      },
    });
  } catch (error: any) {
    console.error('Pause SLA error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to pause SLA',
      error: error.message,
    });
  }
};

/**
 * Resume SLA for a ticket
 * POST /api/tickets/:id/resume-sla
 */
export const resumeSLA = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userName = (req as any).user?.userName || (req as any).user?.name || 'Unknown';
    const userEmail = (req as any).user?.email || 'unknown@email.com';
    
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }
    
    const now = new Date();
    
    // Resume ticket-level SLA
    if (ticket.ticketLevelSLA?.pausedAt) {
      const pausedDuration = now.getTime() - ticket.ticketLevelSLA.pausedAt.getTime();
      ticket.ticketLevelSLA.pausedDuration = 
        (ticket.ticketLevelSLA.pausedDuration || 0) + pausedDuration;
      ticket.ticketLevelSLA.pausedAt = undefined;
    }
    
    // Resume role-level SLA
    if (ticket.roleLevelSLA?.pausedAt) {
      const pausedDuration = now.getTime() - ticket.roleLevelSLA.pausedAt.getTime();
      ticket.roleLevelSLA.pausedDuration = 
        (ticket.roleLevelSLA.pausedDuration || 0) + pausedDuration;
      ticket.roleLevelSLA.pausedAt = undefined;
    }
    
    await ticket.save();
    
    // Log activity
    await logActivity({
      action: 'update',
      entity: 'Ticket',
      entityId: ticket._id.toString(),
      userId,
      userName,
      userEmail,
      description: `SLA resumed for ticket ${ticket.ticketNumber}`,
    });
    
    return res.status(200).json({
      success: true,
      message: 'SLA resumed successfully',
      data: {
        ticketLevelSLA: ticket.ticketLevelSLA,
        roleLevelSLA: ticket.roleLevelSLA,
      },
    });
  } catch (error: any) {
    console.error('Resume SLA error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resume SLA',
      error: error.message,
    });
  }
};
