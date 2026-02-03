import mongoose from 'mongoose';
import { Ticket } from '../models/Ticket';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { sendTicketAssignedEmail } from './emailService';

/**
 * Get next agent for round-robin assignment
 */
async function getNextRoundRobinAgent(
  projectId: string,
  eligibleUserIds: mongoose.Types.ObjectId[]
): Promise<mongoose.Types.ObjectId | null> {
  if (eligibleUserIds.length === 0) return null;

  // Find the last assigned ticket for this project
  const lastTicket = await Ticket.findOne({
    project: projectId,
    assignedTo: { $exists: true, $ne: null },
  }).sort({ createdAt: -1 });

  if (!lastTicket || !lastTicket.assignedTo) {
    // No previous assignment, return first agent
    return eligibleUserIds[0];
  }

  // Find the index of last assigned agent
  const lastAgentIndex = eligibleUserIds.findIndex(
    (id) => id.toString() === lastTicket.assignedTo?.toString()
  );

  // Return next agent in rotation (or first if last was the end of list)
  const nextIndex = (lastAgentIndex + 1) % eligibleUserIds.length;
  return eligibleUserIds[nextIndex];
}

/**
 * Auto-assign ticket based on project configuration
 * Returns assigned agent ID or null if no assignment made
 */
export async function autoAssignTicket(
  projectId: string,
  ticketCategory?: string
): Promise<mongoose.Types.ObjectId | null> {
  try {
    console.log(`🎯 Attempting auto-assignment for project: ${projectId}`);

    // Get project configuration
    const project = await Project.findById(projectId);
    if (!project) {
      console.log(`❌ Project not found: ${projectId}`);
      return null;
    }

    // Check if auto-assignment is enabled
    if (!project.configuration?.ticketAssignmentSettings?.enabled) {
      console.log(`⚠️ Auto-assignment disabled for project: ${projectId}`);
      return null;
    }

    const assignmentSettings = project.configuration.ticketAssignmentSettings;
    console.log(`   Assignment type: ${assignmentSettings.assignmentType}`);

    let assignedAgent: mongoose.Types.ObjectId | null = null;
    let eligibleUsers: any[] = [];

    switch (assignmentSettings.assignmentType) {
      case 'round-robin':
        // Find users with isAgent roles mapped to this project
        console.log(`   🔍 Looking for agent roles for project: ${projectId}`);

        const projectObjectId = new mongoose.Types.ObjectId(projectId);
        const agentRoles = await Role.find({
          isAgent: true,
          isActive: true,
          $or: [
            { projects: projectObjectId }, // Multi-project mapping
            { projectId: projectObjectId }, // Single project mapping (backward compatibility)
          ],
        });

        console.log(`   📊 Found ${agentRoles.length} agent roles`);

        if (agentRoles.length > 0) {
          const agentRoleIds = agentRoles.map((r) => r._id);
          eligibleUsers = await User.find({
            role: { $in: agentRoleIds },
            isActive: true,
          });
          console.log(`   🔍 Found ${eligibleUsers.length} active agents`);
        }

        if (eligibleUsers.length > 0) {
          const eligibleUserIds = eligibleUsers.map((u) => u._id);
          assignedAgent = await getNextRoundRobinAgent(projectId, eligibleUserIds);
          console.log(`   🔄 Round-robin assignment to agent: ${assignedAgent}`);
        }
        break;

      case 'condition-based':
        // Find matching rule based on ticket category
        if (!ticketCategory) {
          console.log(`   ⚠️ No category provided for condition-based assignment`);
          return null;
        }

        const matchingRule = assignmentSettings.conditionRules?.find(
          (rule) =>
            rule.field === 'category' &&
            rule.operator === 'is' &&
            rule.categories.includes(ticketCategory)
        );

        if (matchingRule && matchingRule.assignToAgents.length > 0) {
          console.log(`   ✓ Found matching rule for category: ${ticketCategory}`);

          // Get agents from the matching rule
          const ruleAgents = await User.find({
            _id: { $in: matchingRule.assignToAgents },
            isActive: true,
          });

          if (ruleAgents.length > 0) {
            // Use round-robin among rule-specific agents
            const ruleAgentIds = ruleAgents.map((a) => a._id);
            assignedAgent = await getNextRoundRobinAgent(projectId, ruleAgentIds);
            console.log(
              `   🎯 Condition-based assignment (Category: ${ticketCategory}): ${assignedAgent}`
            );
          }
        } else {
          console.log(`   ⚠️ No matching condition rule for category: ${ticketCategory}`);
        }
        break;

      case 'manual':
      default:
        console.log(`   ✋ Manual assignment - ticket will be unassigned`);
        break;
    }

    if (assignedAgent) {
      console.log(`   ✅ Auto-assigned to agent: ${assignedAgent}`);
    } else {
      console.log(`   ℹ️ No agent assigned (manual or no eligible agents)`);
    }

    return assignedAgent;
  } catch (error: any) {
    console.error(`   ❌ Error in auto-assignment: ${error.message}`);
    return null;
  }
}

/**
 * Assign an existing ticket based on project configuration
 * Updates the ticket document and sends notification to assigned agent
 * 
 * @param ticketId - Ticket ObjectId or string
 * @param projectId - Project ObjectId or string
 * @returns Assigned agent ID or null if no assignment made
 */
export async function assignTicket(
  ticketId: string | mongoose.Types.ObjectId,
  projectId: string | mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId | null> {
  try {
    console.log(`🎯 Assigning ticket: ${ticketId} (Project: ${projectId})`);

    // 1. Get the ticket
    const ticket = await Ticket.findById(ticketId).populate('createdBy');
    if (!ticket) {
      console.log(`   ❌ Ticket not found: ${ticketId}`);
      return null;
    }

    // Skip if already assigned
    if (ticket.assignedTo) {
      console.log(`   ⚠️ Ticket already assigned to: ${ticket.assignedTo}`);
      return ticket.assignedTo as mongoose.Types.ObjectId;
    }

    // 2. Get assignment based on project configuration
    const ticketCategory = ticket.category as string | undefined;
    const assignedAgentId = await autoAssignTicket(projectId.toString(), ticketCategory);

    if (!assignedAgentId) {
      console.log(`   ℹ️ No agent assigned (manual mode or no eligible agents)`);
      return null;
    }

    // 3. Get agent details for notification
    const agent = await User.findById(assignedAgentId);
    if (!agent) {
      console.log(`   ❌ Agent not found: ${assignedAgentId}`);
      return null;
    }

    // 4. Update ticket with assignment
    const oldAssignedToValue = ticket.assignedTo ? String(ticket.assignedTo) : 'Unassigned';
    ticket.assignedTo = assignedAgentId;
    ticket.updatedAt = new Date();

    // Add change history
    if (!ticket.changeHistory) {
      ticket.changeHistory = [];
    }
    ticket.changeHistory.push({
      _id: new mongoose.Types.ObjectId(),
      field: 'assignedTo',
      oldValue: oldAssignedToValue,
      newValue: assignedAgentId.toString(),
      changedBy: assignedAgentId, // System assignment
      changedAt: new Date(),
      changeType: 'update',
    } as any);

    await ticket.save();
    console.log(`   ✅ Ticket assigned to: ${agent.firstName} ${agent.lastName} (${agent.email})`);

    // 5. Send notification to assigned agent
    try {
      console.log(`   📧 Sending notification to assigned agent...`);

      const createdBy = ticket.createdBy as any;
      const studentName = createdBy
        ? `${createdBy.firstName} ${createdBy.lastName}`.trim()
        : 'Student';

      const emailSent = await sendTicketAssignedEmail(
        agent.email,
        ticket.ticketNumber,
        ticket.subject,
        studentName,
        ticket.priority,
        projectId.toString()
      );

      if (emailSent) {
        console.log(`   ✅ Notification sent to ${agent.email}`);
      } else {
        console.log(`   ⚠️ Notification not sent (disabled or failed)`);
      }
    } catch (emailError: any) {
      console.error(`   ❌ Error sending notification: ${emailError.message}`);
      // Don't throw - notification failure shouldn't rollback assignment
    }

    return assignedAgentId;
  } catch (error: any) {
    console.error(`   ❌ Error assigning ticket: ${error.message}`);
    throw error;
  }
}

