import mongoose from 'mongoose';
import { EscalationMatrix, IEscalationMatrix, IEscalationLevel } from '../models/escalation-matrix';
import { Ticket, ITicket } from '../models/Ticket';
import { User } from '../models/User';
import SLATracking from '../models/sla-module/SLATracking';
import { calculateRoleLevelSLA } from './slaService';
import { WorkingCalendar } from '../models/WorkingCalendar';
import { toObjectId, toObjectIdStrict, newObjectId } from '../utils/objectIdUtils';

/**
 * Convert slaHours value to milliseconds based on slaUnit
 * slaUnit can be: 'mins', 'minutes', 'hrs', 'hours', 'days'
 */
function slaToMs(slaValue: number, slaUnit?: string): number {
  const unit = slaUnit || 'hrs';
  if (unit === 'mins' || unit === 'minutes') {
    return slaValue * 60 * 1000; // minutes to ms
  } else if (unit === 'days') {
    return slaValue * 24 * 60 * 60 * 1000; // days to ms
  } else {
    return slaValue * 60 * 60 * 1000; // hours to ms (default)
  }
}

/**
 * Get active escalation matrix for a project and priority
 * Returns the matrix that:
 * 1. Matches the projectId
 * 2. Matches the priority in applicablePriorities (if priority is provided)
 * 3. Falls back to any active matrix for the project if no priority-specific match
 */
export async function getMatrixByProjectId(
  projectId: string,
  priority?: string
): Promise<IEscalationMatrix | null> {
  try {
    // First try to find a matrix matching both project and priority
    if (priority) {
      const priorityUpper = priority.toUpperCase();
      const priorityMatrix = await EscalationMatrix.findOne({
        projectIds: toObjectIdStrict(projectId, 'projectId'),
        applicablePriorities: priorityUpper,
        isActive: true,
      }).lean();
      
      if (priorityMatrix) {
        console.log(`✅ Found priority-specific matrix for ${priorityUpper}: ${(priorityMatrix as any).name}`);
        return priorityMatrix as IEscalationMatrix;
      }
    }
    
    // Fallback: find any active matrix for this project (without priority restriction)
    const matrix = await EscalationMatrix.findOne({
      projectIds: toObjectIdStrict(projectId, 'projectId'),
      isActive: true,
    }).lean();
    
    if (matrix) {
      console.log(`⚠️ Using fallback matrix (no priority match): ${(matrix as any).name}`);
    }
    
    return matrix as IEscalationMatrix | null;
  } catch (error) {
    console.error('Error getting escalation matrix by project:', error);
    return null;
  }
}

/**
 * Auto-assign escalation matrix to a ticket based on its project and priority
 * Should be called during ticket creation
 */
export async function autoAssignMatrixToTicket(
  ticketId: string | mongoose.Types.ObjectId,
  projectId: string | mongoose.Types.ObjectId,
  ticketPriority?: string
): Promise<{ success: boolean; matrixId?: string; message: string }> {
  try {
    // If priority not provided, fetch ticket to get it
    let priority = ticketPriority;
    if (!priority) {
      const existingTicket = await Ticket.findById(ticketId).select('priority').lean();
      priority = existingTicket?.priority;
      console.log(`📋 Fetched ticket priority: ${priority}`);
    }
    
    const matrix = await getMatrixByProjectId(projectId.toString(), priority);
    
    if (!matrix) {
      return { success: false, message: 'No escalation matrix configured for this project' };
    }
    
    // Sort levels and get the first level
    const sortedLevels = [...matrix.levels]
      .filter((l) => l.isActive)
      .sort((a, b) => a.levelNumber - b.levelNumber);
    
    if (sortedLevels.length === 0) {
      return { success: false, message: 'No active levels in escalation matrix' };
    }
    
    const startLevel = sortedLevels[0];
    const now = new Date();
    
    // Calculate role-level SLA deadline
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return { success: false, message: 'Ticket not found' };
    }
    
    const ticketCreatedAt = ticket.createdAt || now;
    
    // Calculate SLA deadline using working calendar if available
    // IMPORTANT: Look up working calendar from project if not set on ticket
    let workingCalendarId = ticket.workingCalendarId;
    if (!workingCalendarId && ticket.metadata?.projectId) {
      const projectCalendar = await WorkingCalendar.findOne({
        projectId: typeof ticket.metadata.projectId === 'string' 
          ? new mongoose.Types.ObjectId(ticket.metadata.projectId)
          : ticket.metadata.projectId,
        isActive: true,
      });
      if (projectCalendar) {
        workingCalendarId = projectCalendar._id as mongoose.Types.ObjectId;
        // Also save it to ticket for future use
        ticket.workingCalendarId = workingCalendarId;
        console.log(`📅 Working calendar found for project: ${projectCalendar.name} (${workingCalendarId})`);
      } else {
        console.log(`⚠️ No working calendar found for project ${ticket.metadata.projectId} - SLA will use simple time calculation`);
      }
    }
    
    // CRITICAL: Determine actual SLA start time based on working hours
    // If ticket created outside working hours, SLA starts at next working time
    let escalationStartTime = ticketCreatedAt;
    if (workingCalendarId) {
      const calendar = await WorkingCalendar.findById(workingCalendarId);
      if (calendar && calendar.isActive) {
        if (!calendar.isWorkingTime(ticketCreatedAt)) {
          // Created outside working hours - start SLA at next working time
          escalationStartTime = calendar.getNextWorkingTime(ticketCreatedAt);
          console.log(`⏰ Ticket created outside working hours. SLA starts at: ${escalationStartTime.toISOString()} (${escalationStartTime.toLocaleString('en-IN', {timeZone: calendar.timezone || 'Asia/Kolkata'})})`);
        } else {
          console.log(`✅ Ticket created during working hours. SLA starts immediately.`);
        }
      }
    }
    
    let roleLevelDueAt: Date;
    try {
      // Use working calendar aware calculation
      const ticketPriorityStr = typeof priority === 'string' ? priority : 'MEDIUM';
      roleLevelDueAt = await calculateRoleLevelSLA(
        escalationStartTime,
        matrix as IEscalationMatrix,
        startLevel.levelNumber,
        ticketPriorityStr,
        workingCalendarId
      );
    } catch (err) {
      // Fallback to simple calculation - respect slaUnit
      roleLevelDueAt = new Date(new Date(escalationStartTime).getTime() + slaToMs(startLevel.slaHours, startLevel.slaUnit));
    }
    
    // Update ticket with escalation matrix AND roleLevelSLA
    ticket.escalationMatrixId = new mongoose.Types.ObjectId(matrix._id);
    ticket.currentEscalationLevelId = startLevel._id;
    ticket.currentEscalationLevelNumber = startLevel.levelNumber;
    ticket.roleLevelSLA = {
      startedAt: escalationStartTime,
      dueAt: roleLevelDueAt,
      breachedAt: undefined,
      pausedAt: undefined,
      pausedDuration: 0,
    };
    await ticket.save();
    
    console.log(`🎯 Role-level SLA initialized: L${startLevel.levelNumber} deadline = ${roleLevelDueAt.toISOString()} (${startLevel.slaHours} ${startLevel.slaUnit || 'hrs'})`);
    
    // Also update legacy SLA tracking for backward compatibility
    if (startLevel.slaHours > 0) {
      const resolutionDeadline = new Date(new Date(escalationStartTime).getTime() + slaToMs(startLevel.slaHours, startLevel.slaUnit));
      
      await SLATracking.findOneAndUpdate(
        { ticketId: new mongoose.Types.ObjectId(ticketId.toString()) },
        {
          $set: {
            resolutionDeadline: resolutionDeadline,
            currentEscalationLevel: startLevel.levelNumber - 1, // 0-indexed for compatibility
            nextEscalationDue: resolutionDeadline,
          },
          $setOnInsert: {
            ticketId: new mongoose.Types.ObjectId(ticketId.toString()),
            projectId: new mongoose.Types.ObjectId(projectId.toString()),
            responseStatus: 'pending',
            resolutionStatus: 'pending',
            escalationHistory: [],
            isPaused: false,
            pausedDuration: 0,
          }
        },
        { upsert: true, new: true }
      );
      
      console.log(`✅ Legacy SLA tracking updated with Level ${startLevel.levelNumber} SLA: ${startLevel.slaHours}h`);
    }
    
    console.log(`✅ Auto-assigned escalation matrix "${matrix.name}" to ticket ${ticketId}`);
    
    return {
      success: true,
      matrixId: matrix._id.toString(),
      message: `Assigned to escalation matrix "${matrix.name}" at level ${startLevel.levelNumber}`,
    };
  } catch (error) {
    console.error('Error auto-assigning escalation matrix:', error);
    return { success: false, message: `Failed to auto-assign escalation matrix: ${(error as Error).message}` };
  }
}

/**
 * Escalation Validation Service
 * 
 * Provides backend validation for escalation operations.
 * This service enforces the following core rules:
 * 1. Escalation must be based on level_number, NOT role names
 * 2. Role names must never be hardcoded
 * 3. Backend validation is mandatory
 * 4. UI restrictions alone are not sufficient
 * 5. System must function even if roles differ across portals
 */

export interface AllowedEscalationLevel {
  levelId: string;
  levelNumber: number;
  levelName: string;
  roleId: string;
  roleName?: string;
  slaHours: number;
  slaUnit?: string; // 'mins', 'hrs', 'days'
  // For de-escalation: the specific previous handler at this level
  previousHandlerId?: string;
  previousHandlerName?: string;
  previousHandlerEmail?: string;
  isDeEscalation?: boolean; // True if this is a backward/de-escalation option
}

export interface EscalationValidationResult {
  allowed: boolean;
  reason?: string;
  targetLevel?: AllowedEscalationLevel;
}

export interface EscalationContext {
  ticket: ITicket;
  matrix: IEscalationMatrix;
  currentLevel?: IEscalationLevel;
  currentLevelNumber: number;
}

/**
 * Get escalation context for a ticket
 */
export async function getEscalationContext(ticketId: string): Promise<EscalationContext | null> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return null;
  }

  if (!ticket.escalationMatrixId) {
    return null;
  }

  const matrix = await EscalationMatrix.findById(ticket.escalationMatrixId)
    .populate('levels.roleId', 'name code');
  
  if (!matrix) {
    return null;
  }

  const currentLevelNumber = ticket.currentEscalationLevelNumber || 0;
  let currentLevel: IEscalationLevel | undefined;

  if (ticket.currentEscalationLevelId) {
    currentLevel = matrix.levels.find(
      (l) => l._id?.toString() === ticket.currentEscalationLevelId?.toString()
    );
  } else if (currentLevelNumber > 0) {
    currentLevel = matrix.levels.find((l) => l.levelNumber === currentLevelNumber);
  }

  return {
    ticket,
    matrix,
    currentLevel,
    currentLevelNumber,
  };
}

/**
 * Get all allowed escalation levels for a ticket
 * 
 * Function: getAllowedEscalationLevels(ticket_id)
 * 
 * Sequential Mode Logic:
 * - Forward: can only escalate to immediate next level (no skipping)
 * - Backward: only to immediate previous level (if allowBackward is true)
 * 
 * Random Mode Logic:
 * - Forward escalation always allowed (unless skip is disabled)
 * - Backward escalation to any level (if allowBackward is true)
 */
export async function getAllowedEscalationLevels(
  ticketId: string
): Promise<AllowedEscalationLevel[]> {
  const context = await getEscalationContext(ticketId);
  if (!context) {
    return [];
  }

  const { matrix, currentLevelNumber, ticket } = context;
  const allowedLevels: AllowedEscalationLevel[] = [];
  
  // Helper to find who was the handler at a specific level
  // We look for escalation history where fromLevel = targetLevel (person who escalated FROM that level)
  const findHandlerAtLevel = async (targetLevel: number): Promise<{id?: string, name?: string, email?: string}> => {
    const escalationHistory = ticket.escalationHistory || [];
    
    // Sort by date descending to get most recent first
    const sortedHistory = [...escalationHistory].sort(
      (a, b) => new Date(b.escalatedAt).getTime() - new Date(a.escalatedAt).getTime()
    );
    
    // Find escalation that happened FROM the target level
    // The escalatedBy is the person who had the ticket at that level
    for (const record of sortedHistory) {
      if (record.fromLevelNumber === targetLevel) {
        const handler = await User.findById(record.escalatedBy).select('firstName lastName email');
        if (handler) {
          return {
            id: handler._id.toString(),
            name: `${handler.firstName || ''} ${handler.lastName || ''}`.trim(),
            email: handler.email,
          };
        }
      }
    }
    
    // Fallback: If no fromLevel info, use older logic for backwards compatibility
    // For target level N, find the (currentLevel - N)th escalation in reverse order
    // E.g., if at L3 and want to go to L2, we need the most recent escalation's escalatedBy
    // If at L3 and want to go to L1, we need the 2nd most recent escalation's escalatedBy
    const stepsBack = currentLevelNumber - targetLevel;
    const historyIndex = stepsBack - 1;
    
    if (historyIndex >= 0 && historyIndex < sortedHistory.length) {
      const record = sortedHistory[historyIndex];
      if (record.escalatedBy) {
        const handler = await User.findById(record.escalatedBy).select('firstName lastName email');
        if (handler) {
          return {
            id: handler._id.toString(),
            name: `${handler.firstName || ''} ${handler.lastName || ''}`.trim(),
            email: handler.email,
          };
        }
      }
    }
    
    // Ultimate fallback: use ticket creator for L1
    if (targetLevel === 1 && ticket.createdBy) {
      const creator = await User.findById(ticket.createdBy).select('firstName lastName email');
      if (creator) {
        return {
          id: creator._id.toString(),
          name: `${creator.firstName || ''} ${creator.lastName || ''}`.trim(),
          email: creator.email,
        };
      }
    }
    
    return {};
  };

  // Sort levels by levelNumber
  const sortedLevels = [...matrix.levels]
    .filter((l) => l.isActive)
    .sort((a, b) => a.levelNumber - b.levelNumber);

  if (sortedLevels.length === 0) {
    return [];
  }

  if (matrix.escalationMode === 'SEQUENTIAL') {
    // SEQUENTIAL mode: Only allow immediate next level (forward)
    const nextLevel = sortedLevels.find((l) => l.levelNumber === currentLevelNumber + 1);
    
    if (nextLevel) {
      const roleData = nextLevel.roleId as any;
      // Handle both populated and non-populated roleId
      const roleIdStr = roleData?._id?.toString() || roleData?.toString() || '';
      allowedLevels.push({
        levelId: nextLevel._id?.toString() || '',
        levelNumber: nextLevel.levelNumber,
        levelName: nextLevel.levelName,
        roleId: roleIdStr,
        roleName: roleData?.name || undefined,
        slaHours: nextLevel.slaHours,
        slaUnit: nextLevel.slaUnit || 'hrs',
      });
    }

    // SEQUENTIAL mode: Also allow immediate previous level (backward) if allowBackward is true
    if (matrix.allowBackward && currentLevelNumber > 1) {
      const prevLevel = sortedLevels.find((l) => l.levelNumber === currentLevelNumber - 1);
      
      if (prevLevel) {
        const roleData = prevLevel.roleId as any;
        // Handle both populated and non-populated roleId
        const roleIdStr = roleData?._id?.toString() || roleData?.toString() || '';
        
        // Find who was the handler at this specific level
        const handler = await findHandlerAtLevel(prevLevel.levelNumber);
        
        allowedLevels.push({
          levelId: prevLevel._id?.toString() || '',
          levelNumber: prevLevel.levelNumber,
          levelName: prevLevel.levelName,
          roleId: roleIdStr,
          roleName: roleData?.name || undefined,
          slaHours: prevLevel.slaHours,
          slaUnit: prevLevel.slaUnit || 'hrs',
          isDeEscalation: true, // Mark as de-escalation
          // Use the handler who was at THIS specific level
          previousHandlerId: handler.id,
          previousHandlerName: handler.name,
          previousHandlerEmail: handler.email,
        });
      }
    }
  } else {
    // RANDOM mode: Allow based on configuration
    for (const level of sortedLevels) {
      if (level.levelNumber === currentLevelNumber) {
        // Cannot escalate to same level
        continue;
      }

      if (level.levelNumber > currentLevelNumber) {
        // Forward escalation
        if (!matrix.allowSkipLevel && level.levelNumber > currentLevelNumber + 1) {
          // Skip level not allowed - only add immediate next
          if (allowedLevels.length === 0) {
            const roleData = level.roleId as any;
            // Handle both populated and non-populated roleId
            const roleIdStr = roleData?._id?.toString() || roleData?.toString() || '';
            allowedLevels.push({
              levelId: level._id?.toString() || '',
              levelNumber: level.levelNumber,
              levelName: level.levelName,
              roleId: roleIdStr,
              roleName: roleData?.name || undefined,
              slaHours: level.slaHours,
              slaUnit: level.slaUnit || 'hrs',
            });
          }
        } else {
          // Add all forward levels
          const roleData = level.roleId as any;
          // Handle both populated and non-populated roleId
          const roleIdStr = roleData?._id?.toString() || roleData?.toString() || '';
          allowedLevels.push({
            levelId: level._id?.toString() || '',
            levelNumber: level.levelNumber,
            levelName: level.levelName,
            roleId: roleIdStr,
            roleName: roleData?.name || undefined,
            slaHours: level.slaHours,
            slaUnit: level.slaUnit || 'hrs',
          });
        }
      } else if (level.levelNumber < currentLevelNumber && matrix.allowBackward) {
        // Backward escalation allowed
        const roleData = level.roleId as any;
        // Handle both populated and non-populated roleId
        const roleIdStr = roleData?._id?.toString() || roleData?.toString() || '';
        
        // Find who was the handler at this specific level
        const handler = await findHandlerAtLevel(level.levelNumber);
        
        allowedLevels.push({
          levelId: level._id?.toString() || '',
          levelNumber: level.levelNumber,
          levelName: level.levelName,
          roleId: roleIdStr,
          roleName: roleData?.name || undefined,
          slaHours: level.slaHours,
          slaUnit: level.slaUnit || 'hrs',
          isDeEscalation: true, // Mark as de-escalation
          // Use the handler who was at THIS specific level
          previousHandlerId: handler.id,
          previousHandlerName: handler.name,
          previousHandlerEmail: handler.email,
        });
      }
    }
  }

  // Sort by level number for consistent ordering
  return allowedLevels.sort((a, b) => a.levelNumber - b.levelNumber);
}

/**
 * Validate if escalation to a target level is allowed
 * 
 * Function: validateEscalation(ticket_id, target_level_id)
 * 
 * This validation must run before any ticket update.
 */
export async function validateEscalation(
  ticketId: string,
  targetLevelId: string
): Promise<EscalationValidationResult> {
  const allowedLevels = await getAllowedEscalationLevels(ticketId);

  const targetLevel = allowedLevels.find(
    (level) => level.levelId === targetLevelId
  );

  if (!targetLevel) {
    return {
      allowed: false,
      reason: 'Escalation not permitted as per matrix rules',
    };
  }

  return {
    allowed: true,
    targetLevel,
  };
}

/**
 * Validate escalation by target level number (alternative validation method)
 */
export async function validateEscalationByLevelNumber(
  ticketId: string,
  targetLevelNumber: number
): Promise<EscalationValidationResult> {
  const allowedLevels = await getAllowedEscalationLevels(ticketId);

  const targetLevel = allowedLevels.find(
    (level) => level.levelNumber === targetLevelNumber
  );

  if (!targetLevel) {
    return {
      allowed: false,
      reason: 'Escalation not permitted as per matrix rules',
    };
  }

  return {
    allowed: true,
    targetLevel,
  };
}

/**
 * Execute escalation for a ticket
 * 
 * Function: escalateTicket(ticket_id, target_level_id)
 * 
 * Steps:
 * 1. Validate escalation
 * 2. Update ticket.current_level_id
 * 3. Get role_id from target level
 * 4. Assign ticket to users belonging to that role (or specific user if targetUserId provided)
 */
export async function executeEscalation(
  ticketId: string,
  targetLevelId: string,
  escalatedBy: string,
  reason: string,
  targetUserId?: string // Optional: specific user to assign to
): Promise<{ success: boolean; message: string; ticket?: ITicket; assignedUser?: any }> {
  // Step 1: Validate escalation
  const validation = await validateEscalation(ticketId, targetLevelId);
  if (!validation.allowed) {
    return {
      success: false,
      message: validation.reason || 'Escalation not permitted',
    };
  }

  if (!validation.targetLevel) {
    return {
      success: false,
      message: 'Target level not found',
    };
  }

  const context = await getEscalationContext(ticketId);
  if (!context) {
    return {
      success: false,
      message: 'Ticket or escalation matrix not found',
    };
  }

  const { ticket, matrix } = context;
  const targetLevel = validation.targetLevel;
  const currentLevelNumber = ticket.currentEscalationLevelNumber || 0;
  const isDeEscalation = targetLevel.levelNumber < currentLevelNumber;

  let assignedUser: any = null;
  
  // If a specific targetUserId is provided, use that user
  if (targetUserId) {
    console.log(`👤 Specific user requested for assignment: ${targetUserId}`);
    const specificUser = await User.findById(targetUserId).select('firstName lastName email isActive role');
    
    if (specificUser && specificUser.isActive) {
      // Verify the user has the correct role for this level
      if (specificUser.role?.toString() === targetLevel.roleId?.toString()) {
        assignedUser = specificUser;
        console.log(`✅ Using specified user: ${specificUser.firstName} ${specificUser.lastName}`);
      } else {
        console.log(`⚠️ Specified user has different role (${specificUser.role}) than level role (${targetLevel.roleId}), but proceeding anyway`);
        assignedUser = specificUser;
      }
    } else {
      console.log(`⚠️ Specified user not found or inactive: ${targetUserId}`);
    }
  }

  // For de-escalation, try to find the previous handler at the target level
  if (!assignedUser && isDeEscalation && ticket.escalationHistory && ticket.escalationHistory.length > 0) {
    console.log(`📥 De-escalation to Level ${targetLevel.levelNumber}, searching for previous handler...`);
    
    // Strategy 1: Find escalation record with fromLevelNumber matching target (new format)
    const relevantEscalation = [...ticket.escalationHistory]
      .reverse()
      .find((record: any) => record.fromLevelNumber === targetLevel.levelNumber);

    if (relevantEscalation?.previousAssignee) {
      const prevUserId = relevantEscalation.previousAssignee;
      const prevUser = await User.findById(prevUserId).select('firstName lastName email isActive');
      
      if (prevUser && prevUser.isActive) {
        assignedUser = prevUser;
        console.log(`📥 De-escalation: Found previous handler from history - ${prevUser.firstName} ${prevUser.lastName}`);
      }
    }
    
    // Strategy 2: For Level 1 de-escalation with old records, the first escalatedBy is the L1 handler
    if (!assignedUser && targetLevel.levelNumber === 1) {
      // Find the first escalation record - the escalatedBy was the original L1 handler
      const firstEscalation = ticket.escalationHistory[0] as any;
      if (firstEscalation?.escalatedBy) {
        const escalatorId = firstEscalation.escalatedBy._id || firstEscalation.escalatedBy;
        const escalator = await User.findById(escalatorId).select('firstName lastName email isActive');
        
        if (escalator && escalator.isActive) {
          assignedUser = escalator;
          console.log(`📥 De-escalation: Using original L1 handler (from first escalation) - ${escalator.firstName} ${escalator.lastName}`);
        }
      }
    }
    
    // Strategy 3: For other levels, look for escalatedBy who has the target level's role
    if (!assignedUser) {
      for (const record of [...ticket.escalationHistory].reverse()) {
        const rec = record as any;
        if (rec.escalatedBy) {
          const escalatorId = rec.escalatedBy._id || rec.escalatedBy;
          const escalator = await User.findById(escalatorId)
            .select('firstName lastName email role isActive')
            .lean();
          
          if (escalator && escalator.isActive && escalator.role?.toString() === targetLevel.roleId?.toString()) {
            assignedUser = escalator;
            console.log(`📥 De-escalation: Found handler by role match - ${escalator.firstName} ${escalator.lastName}`);
            break;
          }
        }
      }
    }
  }

  // If no previous handler found (or forward escalation), use round-robin
  if (!assignedUser) {
    console.log(`📤 ${isDeEscalation ? 'No previous handler found, using' : 'Forward escalation, using'} round-robin assignment`);
    
    // Build user query
    const userQuery: any = {
      role: new mongoose.Types.ObjectId(targetLevel.roleId),
      isActive: true,
    };
    
    // Filter by project if ticket has one
    if (ticket.project) {
      userQuery.$or = [
        { projects: { $in: [ticket.project] } },
        { projects: { $size: 0 } }, // Users with no project restriction
      ];
    }
    
    // Filter by center for offline tickets
    const ticketCenterId = (ticket as any).metadata?.centerId;
    const isOfflineTicket = ticket.submissionSource === 'offline' || !!ticketCenterId;
    if (isOfflineTicket && ticketCenterId) {
      userQuery.centers = { $in: [ticketCenterId] };
      console.log(`📍 Filtering escalation users by ticket center: ${ticketCenterId}`);
    }
    
    // Step 2: Find users belonging to the target role
    // Use round-robin or notify all depending on configuration
    const usersInRole = await User.find(userQuery)
      .sort({ 'assignments.lastAssignedAt': 1 }); // Round-robin: least recently assigned first

    if (usersInRole.length === 0) {
      return {
        success: false,
        message: `No active users found for the target escalation level (${targetLevel.levelName})${isOfflineTicket ? ' in the same center' : ''}`,
      };
    }

    // Select user for assignment (round-robin: first user in sorted list)
    assignedUser = usersInRole[0];
  }

  // Step 3: Update ticket
  const oldAssignedTo = ticket.assignedTo;
  const oldLevelNumber = ticket.currentEscalationLevelNumber || 0;

  // Find the old level name from the matrix
  const oldLevel = matrix.levels.find((l) => l.levelNumber === oldLevelNumber);
  const oldLevelName = oldLevel?.levelName || `Level ${oldLevelNumber}`;

  ticket.currentEscalationLevelId = new mongoose.Types.ObjectId(targetLevel.levelId);
  ticket.currentEscalationLevelNumber = targetLevel.levelNumber;
  ticket.assignedTo = assignedUser._id;

  // Add to escalation history with level tracking info for de-escalation support
  if (!ticket.escalationHistory) {
    ticket.escalationHistory = [];
  }

  ticket.escalationHistory.push({
    _id: new mongoose.Types.ObjectId(),
    escalatedTo: assignedUser._id,
    escalatedBy: new mongoose.Types.ObjectId(escalatedBy),
    reason: reason,
    escalatedAt: new Date(),
    // Level tracking for proper de-escalation
    fromLevelNumber: oldLevelNumber,
    toLevelNumber: targetLevel.levelNumber,
    fromLevelName: oldLevelName,
    toLevelName: targetLevel.levelName,
    // Store the previous assignee so we can re-assign to them during de-escalation
    previousAssignee: oldAssignedTo,
  } as any);

  // Track change in change history
  if (!ticket.changeHistory) {
    ticket.changeHistory = [];
  }

  ticket.changeHistory.push({
    _id: new mongoose.Types.ObjectId(),
    field: 'escalationLevel',
    oldValue: `Level ${oldLevelNumber}`,
    newValue: `Level ${targetLevel.levelNumber} (${targetLevel.levelName})`,
    changedBy: new mongoose.Types.ObjectId(escalatedBy),
    changedAt: new Date(),
    changeType: 'update',
  } as any);

  await ticket.save();

  // Step 4: Update SLA tracking with new level's SLA hours
  // Reset the deadline based on current time + new level's SLA
  if (targetLevel.slaHours > 0) {
    const now = new Date();
    const newResolutionDeadline = new Date(now.getTime() + slaToMs(targetLevel.slaHours, targetLevel.slaUnit));
    
    await SLATracking.findOneAndUpdate(
      { ticketId: ticket._id },
      {
        $set: {
          resolutionDeadline: newResolutionDeadline,
          currentEscalationLevel: targetLevel.levelNumber - 1, // 0-indexed for compatibility
          nextEscalationDue: newResolutionDeadline,
        },
        $push: {
          escalationHistory: {
            escalatedAt: now,
            fromLevel: oldLevelNumber,
            toLevel: targetLevel.levelNumber,
            escalatedBy: new mongoose.Types.ObjectId(escalatedBy),
          }
        }
      },
      { upsert: false }
    );
    
    console.log(`✅ SLA deadline reset for escalation to Level ${targetLevel.levelNumber}: ${targetLevel.slaHours}h from now, new deadline: ${newResolutionDeadline.toISOString()}`);
  }

  return {
    success: true,
    message: `Ticket escalated to ${targetLevel.levelName} and assigned to ${assignedUser.firstName} ${assignedUser.lastName}`,
    ticket,
    assignedUser,
  };
}

/**
 * Get users available for a specific escalation level
 */
export async function getUsersForLevel(
  matrixId: string,
  levelId: string,
  projectId?: string
): Promise<any[]> {
  const matrix = await EscalationMatrix.findById(matrixId);
  if (!matrix) {
    return [];
  }

  const level = matrix.levels.find((l) => l._id?.toString() === levelId);
  if (!level) {
    return [];
  }

  const query: any = {
    role: level.roleId,
    isActive: true,
  };

  if (projectId) {
    query.$or = [
      { projects: { $in: [new mongoose.Types.ObjectId(projectId)] } },
      { projects: { $size: 0 } },
    ];
  }

  // Include centers in selection for center-based filtering (offline projects)
  return User.find(query)
    .select('firstName lastName email centers')
    .populate('role', 'name code')
    .lean();
}

/**
 * Assign escalation matrix to a ticket
 */
export async function assignMatrixToTicket(
  ticketId: string,
  matrixId: string,
  startAtLevel?: number
): Promise<{ success: boolean; message: string }> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return { success: false, message: 'Ticket not found' };
  }

  const matrix = await EscalationMatrix.findById(matrixId);
  if (!matrix || !matrix.isActive) {
    return { success: false, message: 'Escalation matrix not found or inactive' };
  }

  // Sort levels and get the starting level
  const sortedLevels = [...matrix.levels]
    .filter((l) => l.isActive)
    .sort((a, b) => a.levelNumber - b.levelNumber);

  if (sortedLevels.length === 0) {
    return { success: false, message: 'No active levels in the matrix' };
  }

  // Find the starting level
  let startLevel: IEscalationLevel;
  if (startAtLevel !== undefined) {
    const found = sortedLevels.find((l) => l.levelNumber === startAtLevel);
    if (!found) {
      return { success: false, message: `Level ${startAtLevel} not found in matrix` };
    }
    startLevel = found;
  } else {
    // Start at the first level
    startLevel = sortedLevels[0];
  }

  ticket.escalationMatrixId = new mongoose.Types.ObjectId(matrixId);
  ticket.currentEscalationLevelId = startLevel._id;
  ticket.currentEscalationLevelNumber = startLevel.levelNumber;

  await ticket.save();

  return {
    success: true,
    message: `Ticket assigned to escalation matrix "${matrix.name}" at level ${startLevel.levelNumber}`,
  };
}

/**
 * Check and process auto-escalation for SLA breached tickets
 * This function should be called by a scheduled job (e.g., every 5 minutes)
 * 
 * Logic:
 * 1. Find tickets with escalation matrix that has autoEscalate enabled
 * 2. Check if current level SLA has been breached
 * 3. If breached, auto-escalate to next level (sequential behavior)
 */
export async function processAutoEscalation(): Promise<{
  processed: number;
  escalated: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    escalated: 0,
    errors: [] as string[],
  };

  try {
    // Find all matrices with autoEscalate enabled
    const autoEscalateMatrices = await EscalationMatrix.find({
      isActive: true,
      autoEscalate: true,
    });

    if (autoEscalateMatrices.length === 0) {
      return result;
    }

    const matrixIds = autoEscalateMatrices.map((m) => m._id);

    // Find open tickets with these matrices
    // Status values: 1=open, 2=in-progress, 3=on-hold (don't check resolved/closed)
    const tickets = await Ticket.find({
      escalationMatrixId: { $in: matrixIds },
      status: { $in: [1, 2, 3] },
    });

    for (const ticket of tickets) {
      result.processed++;

      try {
        const matrix = autoEscalateMatrices.find(
          (m) => m._id.toString() === ticket.escalationMatrixId?.toString()
        );

        if (!matrix) continue;

        const currentLevelNumber = ticket.currentEscalationLevelNumber || 1;
        const currentLevel = matrix.levels.find(
          (l) => l.levelNumber === currentLevelNumber && l.isActive
        );

        if (!currentLevel) continue;

        // Check if role-level SLA is paused
        if (ticket.roleLevelSLA?.pausedAt) {
          console.log(`⏸️  Ticket ${ticket.ticketNumber}: Role-level SLA is paused, skipping`);
          continue;
        }

        // Check if role-level SLA has been breached using roleLevelSLA.dueAt
        const now = new Date();
        let slaBreach = false;
        
        // Use roleLevelSLA.dueAt as the primary source for role-level escalation
        if (ticket.roleLevelSLA?.dueAt) {
          slaBreach = now > new Date(ticket.roleLevelSLA.dueAt);
          if (slaBreach) {
            console.log(`⏰ Ticket ${ticket.ticketNumber}: Role-level SLA breached (dueAt: ${ticket.roleLevelSLA.dueAt})`);
          }
        } else {
          // Fallback: Check legacy SLATracking model
          const slaTracking = await SLATracking.findOne({ ticketId: ticket._id });
          if (slaTracking?.resolutionDeadline) {
            slaBreach = now > slaTracking.resolutionDeadline;
          } else {
            // Final fallback: Calculate from ticket creation + level SLA
            const escalationStartTime = ticket.createdAt;
            const slaDeadline = new Date(escalationStartTime.getTime() + slaToMs(currentLevel.slaHours, currentLevel.slaUnit));
            slaBreach = now > slaDeadline;
          }
        }

        if (!slaBreach) {
          // SLA not breached yet
          continue;
        }

        // SLA breached - find next level (sequential behavior for auto-escalation)
        const sortedLevels = [...matrix.levels]
          .filter((l) => l.isActive)
          .sort((a, b) => a.levelNumber - b.levelNumber);

        const nextLevel = sortedLevels.find((l) => l.levelNumber === currentLevelNumber + 1);

        if (!nextLevel) {
          // Already at highest level, can't escalate further
          continue;
        }

        // Find a user in the target role to assign
        // Note: User model has 'role' field, not 'roleId'
        const usersInRole = await User.find({
          role: nextLevel.roleId,
          isActive: true,
        }).select('_id firstName lastName');

        if (usersInRole.length === 0) {
          result.errors.push(`Ticket ${ticket.ticketNumber}: No users found in role for level ${nextLevel.levelNumber}`);
          continue;
        }

        // Select a random user from the role
        const assignedUser = usersInRole[Math.floor(Math.random() * usersInRole.length)];
        const previousAssignee = ticket.assignedTo;

        // Update ticket with new escalation level
        ticket.currentEscalationLevelId = nextLevel._id;
        ticket.currentEscalationLevelNumber = nextLevel.levelNumber;
        ticket.assignedTo = assignedUser._id as mongoose.Types.ObjectId;
        // Keep status as-is (no "escalated" status value in system)

        // Add to escalation history
        if (!ticket.escalationHistory) {
          ticket.escalationHistory = [];
        }
        ticket.escalationHistory.push({
          escalatedTo: assignedUser._id as mongoose.Types.ObjectId,
          escalatedBy: previousAssignee || (assignedUser._id as mongoose.Types.ObjectId), // Use PREVIOUS assignee for history
          fromLevelNumber: currentLevelNumber,
          toLevelNumber: nextLevel.levelNumber,
          reason: `Auto-escalated from L${currentLevelNumber} to L${nextLevel.levelNumber} due to SLA breach`,
          escalatedAt: new Date(),
        });

        // Mark current role-level SLA as breached
        if (ticket.roleLevelSLA) {
          ticket.roleLevelSLA.breachedAt = now;
        }
        
        // Calculate new role-level SLA deadline for the next level
        if (nextLevel.slaHours > 0) {
          let newRoleLevelDueAt: Date;
          try {
            // Use working calendar aware calculation
            // Ensure we have working calendar (might not be set on older tickets)
            let workingCalendarId = ticket.workingCalendarId;
            if (!workingCalendarId && ticket.metadata?.projectId) {
              const projectCalendar = await WorkingCalendar.findOne({
                projectId: typeof ticket.metadata.projectId === 'string' 
                  ? new mongoose.Types.ObjectId(ticket.metadata.projectId)
                  : ticket.metadata.projectId,
                isActive: true,
              });
              if (projectCalendar) {
                workingCalendarId = projectCalendar._id as mongoose.Types.ObjectId;
                ticket.workingCalendarId = workingCalendarId;
              }
            }
            
            const ticketPriority = typeof ticket.priority === 'string' ? ticket.priority : 'MEDIUM';
            newRoleLevelDueAt = await calculateRoleLevelSLA(
              now, // Start from now
              matrix as IEscalationMatrix,
              nextLevel.levelNumber,
              ticketPriority,
              workingCalendarId
            );
          } catch (err) {
            // Fallback to simple calculation - respecting slaUnit
            newRoleLevelDueAt = new Date(now.getTime() + slaToMs(nextLevel.slaHours, nextLevel.slaUnit));
          }
          
          // Update role-level SLA on the ticket
          ticket.roleLevelSLA = {
            startedAt: now,
            dueAt: newRoleLevelDueAt,
            breachedAt: undefined,
            pausedAt: undefined,
            pausedDuration: 0,
          };
          
          console.log(`   ↳ Role-level SLA reset: L${nextLevel.levelNumber} deadline = ${newRoleLevelDueAt.toISOString()}`);
        }

        await ticket.save();
        
        // Also update legacy SLATracking model for backward compatibility
        if (nextLevel.slaHours > 0) {
          const newDeadline = new Date(now.getTime() + slaToMs(nextLevel.slaHours, nextLevel.slaUnit));
          await SLATracking.findOneAndUpdate(
            { ticketId: ticket._id },
            {
              $set: {
                resolutionDeadline: newDeadline,
                currentEscalationLevel: nextLevel.levelNumber - 1,
                nextEscalationDue: newDeadline,
              },
              $push: {
                escalationHistory: {
                  escalatedAt: now,
                  fromLevel: currentLevelNumber,
                  toLevel: nextLevel.levelNumber,
                  escalatedBy: assignedUser._id,
                  autoEscalated: true,
                }
              }
            }
          );
        }
        
        result.escalated++;

        console.log(
          `[AUTO-ESCALATION] Ticket ${ticket.ticketNumber} escalated from L${currentLevelNumber} to L${nextLevel.levelNumber}`
        );
      } catch (err: any) {
        result.errors.push(`Ticket ${ticket.ticketNumber || ticket._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`General error: ${err.message}`);
  }

  return result;
}

/**
 * Get tickets eligible for auto-escalation (for preview/monitoring)
 */
export async function getAutoEscalationCandidates(): Promise<{
  ticketNumber: string;
  matrixName: string;
  currentLevel: number;
  slaBreachedAt: Date;
  hoursOverdue: number;
}[]> {
  const candidates: {
    ticketNumber: string;
    matrixName: string;
    currentLevel: number;
    slaBreachedAt: Date;
    hoursOverdue: number;
  }[] = [];

  const autoEscalateMatrices = await EscalationMatrix.find({
    isActive: true,
    autoEscalate: true,
  });

  if (autoEscalateMatrices.length === 0) {
    return candidates;
  }

  const matrixIds = autoEscalateMatrices.map((m) => m._id);

  // Status values: 1=open, 2=in-progress, 3=on-hold (don't check resolved/closed)
  const tickets = await Ticket.find({
    escalationMatrixId: { $in: matrixIds },
    status: { $in: [1, 2, 3] },
  });

  for (const ticket of tickets) {
    const matrix = autoEscalateMatrices.find(
      (m) => m._id.toString() === ticket.escalationMatrixId?.toString()
    );

    if (!matrix) continue;

    const currentLevelNumber = ticket.currentEscalationLevelNumber || 1;
    const currentLevel = matrix.levels.find(
      (l) => l.levelNumber === currentLevelNumber && l.isActive
    );

    if (!currentLevel) continue;

    const escalationStartTime = ticket.updatedAt || ticket.createdAt;
    const slaDeadline = new Date(escalationStartTime.getTime() + slaToMs(currentLevel.slaHours, currentLevel.slaUnit));
    const now = new Date();

    if (now > slaDeadline) {
      const hoursOverdue = (now.getTime() - slaDeadline.getTime()) / (1000 * 60 * 60);
      candidates.push({
        ticketNumber: ticket.ticketNumber,
        matrixName: matrix.name,
        currentLevel: currentLevelNumber,
        slaBreachedAt: slaDeadline,
        hoursOverdue: Math.round(hoursOverdue * 10) / 10,
      });
    }
  }

  return candidates;
}

export default {
  getMatrixByProjectId,
  autoAssignMatrixToTicket,
  getEscalationContext,
  getAllowedEscalationLevels,
  validateEscalation,
  validateEscalationByLevelNumber,
  executeEscalation,
  getUsersForLevel,
  assignMatrixToTicket,
  processAutoEscalation,
  getAutoEscalationCandidates,
};
