import mongoose from 'mongoose';
import { Ticket } from '../models/Ticket';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { sendTicketAssignedEmail } from './emailService';
import {
  CategoryAssignmentConfig,
  CategoryAssignmentMode,
} from '../models/ticket-module/CategoryAssignmentConfig';
import { Category } from '../models/Category';

/**
 * Result returned by autoAssignTicket(), carrying both the chosen agent and
 * metadata about how/why the assignment was made.
 */
export interface AutoAssignResult {
  agentId: mongoose.Types.ObjectId;
  assignedVia: 'round-robin' | 'by-role' | 'by-user' | 'condition-based' | 'fallback';
  attempts: number;
}

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
 * Resolve eligible user IDs for a given project using only agent roles.
 */
async function getProjectAgentIds(projectId: string): Promise<mongoose.Types.ObjectId[]> {
  const projectObjectId = new mongoose.Types.ObjectId(projectId);
  const agentRoles = await Role.find({
    isAgent: true,
    isActive: true,
    $or: [
      { projects: projectObjectId },
      { projectId: projectObjectId },
    ],
  });
  if (agentRoles.length === 0) return [];
  const agentRoleIds = agentRoles.map((r) => r._id);
  const agents = await User.find({ role: { $in: agentRoleIds }, isActive: true }).select('_id');
  return agents.map((a) => a._id as mongoose.Types.ObjectId);
}

/**
 * Walk up the hierarchyPath of a category to find the nearest active
 * CategoryAssignmentConfig for that lineage (child → parent → root).
 * Returns null when no config is found anywhere in the hierarchy.
 */
async function resolveConfigForCategory(
  categoryId: mongoose.Types.ObjectId,
  projectId: string,
): Promise<InstanceType<typeof CategoryAssignmentConfig> | null> {
  // Load the category to get its full hierarchy path
  const category = await Category.findById(categoryId).select('hierarchyPath').lean();
  // Build the lookup chain: [categoryId, ...ancestorIds (closest first)]
  const chain: mongoose.Types.ObjectId[] = [
    categoryId,
    ...((category?.hierarchyPath as mongoose.Types.ObjectId[] | undefined) ?? []).slice().reverse(),
  ];

  for (const id of chain) {
    const config = await CategoryAssignmentConfig.findOne({
      categoryId: id,
      projectId: new mongoose.Types.ObjectId(projectId),
      isActive: true,
    });
    if (config) return config;
  }
  return null;
}

/**
 * Execute assignment for a specific mode/pool and return the chosen agent.
 * Returns null if no eligible agent is available.
 */
async function resolveAgentFromConfig(
  config: InstanceType<typeof CategoryAssignmentConfig>,
  projectId: string,
): Promise<mongoose.Types.ObjectId | null> {
  switch (config.mode) {
    case 'manual':
      return null;

    case 'by-user': {
      if (config.agentPool.length === 0) return null;
      const activeAgents = await User.find({
        _id: { $in: config.agentPool },
        isActive: true,
      }).select('_id');
      if (activeAgents.length === 0) return null;
      const ids = activeAgents.map((a) => a._id as mongoose.Types.ObjectId);
      return getNextRoundRobinAgent(projectId, ids);
    }

    case 'by-role': {
      if (config.rolePool.length === 0) return null;
      const projectObjectId = new mongoose.Types.ObjectId(projectId);
      // Intersect rolePool with roles that are actually mapped to the project
      const roles = await Role.find({
        _id: { $in: config.rolePool },
        isActive: true,
        $or: [
          { projects: projectObjectId },
          { projectId: projectObjectId },
        ],
      }).select('_id');
      if (roles.length === 0) return null;
      const roleIds = roles.map((r) => r._id);
      const agents = await User.find({
        role: { $in: roleIds },
        isActive: true,
      }).select('_id');
      if (agents.length === 0) return null;
      const ids = agents.map((a) => a._id as mongoose.Types.ObjectId);
      return getNextRoundRobinAgent(projectId, ids);
    }

    case 'round-robin':
    default: {
      // Use explicit pool when provided, otherwise fall back to all project agents
      let ids: mongoose.Types.ObjectId[];
      if (config.agentPool.length > 0) {
        const activeAgents = await User.find({
          _id: { $in: config.agentPool },
          isActive: true,
        }).select('_id');
        ids = activeAgents.map((a) => a._id as mongoose.Types.ObjectId);
      } else {
        ids = await getProjectAgentIds(projectId);
      }
      if (ids.length === 0) return null;
      return getNextRoundRobinAgent(projectId, ids);
    }
  }
}

/**
 * Auto-assign a ticket based on the category-assignment config hierarchy, then
 * falling back to the project-level ticketAssignmentSettings.
 *
 * @returns AutoAssignResult when an agent is found, or null when no assignment is possible.
 */
export async function autoAssignTicket(
  projectId: string,
  categoryId?: mongoose.Types.ObjectId | string | null,
): Promise<AutoAssignResult | null> {
  let attempts = 0;

  try {
    console.log(`🎯 Auto-assignment: project=${projectId} category=${categoryId ?? 'none'}`);

    // ── Step 1: Category-level config (US-001 / US-002 / US-003 / US-004 / US-008) ──────────
    if (categoryId) {
      attempts++;
      const catObjectId =
        typeof categoryId === 'string'
          ? new mongoose.Types.ObjectId(categoryId)
          : (categoryId as mongoose.Types.ObjectId);

      const config = await resolveConfigForCategory(catObjectId, projectId);

      if (config) {
        if (config.mode === 'manual') {
          // US-007: manual mode means NO auto-assignment, period — no fallback
          console.log(`   ✋ Category config: manual mode — ticket stays unassigned`);
          return null;
        }

        const agentId = await resolveAgentFromConfig(config, projectId);
        if (agentId) {
          const modeUsed = config.mode as AutoAssignResult['assignedVia'];
          console.log(`   ✅ Assigned via category config (${modeUsed}): ${agentId}`);
          return { agentId, assignedVia: modeUsed, attempts };
        }
        console.log(
          `   ⚠️ [AutoAssign] Category config found (${config.mode}) but no eligible agents. Falling back to project-level.`,
        );
      }
    }

    // ── Step 2: Project-level ticketAssignmentSettings (US-010 fallback / US-025 legacy) ─────
    attempts++;
    const project = await Project.findById(projectId);
    if (!project?.configuration?.ticketAssignmentSettings?.enabled) {
      console.log(`   ℹ️ Project-level auto-assignment disabled`);
      return null;
    }

    const settings = project.configuration.ticketAssignmentSettings;
    console.log(`   🔄 Project-level fallback (type=${settings.assignmentType})`);

    switch (settings.assignmentType) {
      case 'condition-based': {
        // US-025: legacy condition rules
        if (!categoryId) break;
        // The legacy rules stored the category *name* (string) in categories[],
        // so we look up the Category document to get its name.
        const catDoc = await Category.findById(categoryId).select('name').lean();
        const catName = catDoc?.name ?? String(categoryId);
        const matchingRule = settings.conditionRules?.find(
          (rule: any) =>
            rule.field === 'category' &&
            rule.operator === 'is' &&
            rule.categories.includes(catName),
        );
        if (matchingRule?.assignToAgents?.length) {
          const ruleAgents = await User.find({
            _id: { $in: matchingRule.assignToAgents },
            isActive: true,
          }).select('_id');
          if (ruleAgents.length > 0) {
            const ids = ruleAgents.map((a) => a._id as mongoose.Types.ObjectId);
            const agentId = await getNextRoundRobinAgent(projectId, ids);
            if (agentId) {
              console.log(`   ✅ Assigned via legacy condition-based rule: ${agentId}`);
              return { agentId, assignedVia: 'condition-based', attempts };
            }
          }
        }
        break;
      }

      case 'round-robin':
      default: {
        const ids = await getProjectAgentIds(projectId);
        if (ids.length > 0) {
          const agentId = await getNextRoundRobinAgent(projectId, ids);
          if (agentId) {
            console.log(`   ✅ Assigned via project-level fallback (round-robin): ${agentId}`);
            return { agentId, assignedVia: 'fallback', attempts };
          }
        }
        break;
      }
    }

    console.log(`   ℹ️ No eligible agent found after ${attempts} attempt(s)`);
    return null;
  } catch (error: any) {
    console.error(`   ❌ Error in auto-assignment: ${error.message}`);
    return null;
  }
}

/**
 * Assign an existing ticket based on the category-assignment config + project fallback.
 * Updates the ticket document and sends notification to the assigned agent.
 *
 * @param ticketId  - Ticket ObjectId or string
 * @param projectId - Project ObjectId or string
 * @returns Assigned agent ID or null if no assignment was made
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

    // 2. Get assignment result
    const categoryId = ticket.categoryHierarchy?.level1 ?? null;
    const result = await autoAssignTicket(projectId.toString(), categoryId);

    if (!result) {
      console.log(`   ℹ️ No agent assigned (manual mode or no eligible agents)`);
      return null;
    }

    const { agentId: assignedAgentId, assignedVia, attempts } = result;

    // 3. Get agent details for notification
    const agent = await User.findById(assignedAgentId);
    if (!agent) {
      console.log(`   ❌ Agent not found: ${assignedAgentId}`);
      return null;
    }

    // 4. Update ticket with assignment + tracking fields (US-005 / US-026)
    const oldValue = ticket.assignedTo ? String(ticket.assignedTo) : 'Unassigned';
    ticket.assignedTo = assignedAgentId;
    ticket.assignedVia = assignedVia;
    ticket.assignmentAttempts = attempts;
    ticket.updatedAt = new Date();

    if (!ticket.changeHistory) ticket.changeHistory = [];
    ticket.changeHistory.push({
      _id: new mongoose.Types.ObjectId(),
      field: 'assignedTo',
      oldValue,
      newValue: assignedAgentId.toString(),
      changedBy: assignedAgentId,
      changedAt: new Date(),
      changeType: 'update',
      // US-026: record the assignment method for audit trail
      reassignmentCategory: `Auto-assigned via ${assignedVia}`,
    } as any);

    await ticket.save();
    console.log(`   ✅ Ticket assigned to: ${agent.firstName} ${agent.lastName} (via ${assignedVia})`);

    // 5. Send notification to assigned agent
    try {
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
    }

    return assignedAgentId;
  } catch (error: any) {
    console.error(`   ❌ Error assigning ticket: ${error.message}`);
    throw error;
  }
}

