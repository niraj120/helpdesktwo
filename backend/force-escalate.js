// Force auto-escalation check immediately
require('dotenv').config();
const mongoose = require('mongoose');

// Import all required models to ensure they're registered
const Ticket = require('./dist/models/Ticket').Ticket;
const User = require('./dist/models/User').User;
const SLATracking = require('./dist/models/sla-module/SLATracking').default;
const EscalationPolicy = require('./dist/models/sla-module/EscalationPolicy').default;  
const Role = require('./dist/models/Role').Role;

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

async function forceEscalation() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the ticket
    const ticket = await Ticket.findOne({ ticketNumber: 'HSTR-2026-02-0005' });
    if (!ticket) {
      console.log('❌ Ticket not found');
      return;
    }

    console.log(`🎫 Ticket: ${ticket.ticketNumber}`);
    console.log(`   Current Status: ${ticket.status}`);
    console.log(`   Assigned To: ${ticket.assignedTo}\n`);

    // Find SLA tracking
    const tracking = await SLATracking.findOne({ ticketId: ticket._id })
      .populate('escalationPolicyId');

    if (!tracking) {
      console.log('❌ No SLA tracking found');
      return;
    }

    console.log('📊 Current SLA Status:');
    console.log(`   Current Level: ${tracking.currentEscalationLevel}`);
    console.log(`   Next Escalation Due: ${tracking.nextEscalationDue}`);
    console.log(`   Is Overdue: ${new Date(tracking.nextEscalationDue) < new Date()}\n`);

    const policy = tracking.escalationPolicyId;
    if (!policy || !policy.levels || policy.levels.length === 0) {
      console.log('❌ No escalation policy found');
      return;
    }

    const nextLevel = tracking.currentEscalationLevel + 1;
    const levelConfig = policy.levels.find(l => l.level === nextLevel);

    if (!levelConfig) {
      console.log(`⚠️  No level ${nextLevel} configuration found in policy`);
      return;
    }

    console.log(`⬆️  Escalating to Level ${nextLevel}: ${levelConfig.escalateTo.targetName}\n`);

    // Find target for escalation
    let targetUserId = null;
    
    if (levelConfig.escalateTo.type === 'role') {
      // Find a user with this role
      const role = await Role.findById(levelConfig.escalateTo.targetId);
      if (role) {
        const user = await User.findOne({ role: role._id, isActive: true });
        if (user) {
          targetUserId = user._id;
          console.log(`   Target User: ${user.firstName} ${user.lastName} (${user.email})`);
        }
      }
    } else if (levelConfig.escalateTo.type === 'user') {
      targetUserId = levelConfig.escalateTo.targetId;
    }

    if (!targetUserId) {
      console.log('❌ No target user found for escalation');
      return;
    }

    // Update ticket assignment
    ticket.assignedTo = targetUserId;
    await ticket.save();
    console.log('✅ Updated ticket assignment\n');

    // Update SLA tracking
    tracking.currentEscalationLevel = nextLevel;
    
    // Calculate next escalation deadline
    const subsequentLevel = policy.levels.find(l => l.level === nextLevel + 1);
    if (subsequentLevel && subsequentLevel.escalationMode === 'auto') {
      const { value, unit } = subsequentLevel.escalateAfter;
      let ms = 0;
      switch (unit?.toLowerCase()) {
        case 'minutes': ms = value * 60 * 1000; break;
        case 'hours': ms = value * 60 * 60 * 1000; break;
        case 'days': ms = value * 24 * 60 * 60 * 1000; break;
        default: ms = value * 60 * 60 * 1000;
      }
      tracking.nextEscalationDue = new Date(Date.now() + ms);
      console.log(`   Next escalation due: ${tracking.nextEscalationDue}`);
    } else {
      tracking.nextEscalationDue = undefined;
      console.log('   No more auto-escalation levels');
    }

    // Update resolution deadline to the new level's deadline
    if (levelConfig.escalateAfter) {
      const { value, unit } = levelConfig.escalateAfter;
      let ms = 0;
      switch (unit?.toLowerCase()) {
        case 'minutes': ms = value * 60 * 1000; break;
        case 'hours': ms = value * 60 * 60 * 1000; break;
        case 'days': ms = value * 24 * 60 * 60 * 1000; break;
        default: ms = value * 60 * 60 * 1000;
      }
      tracking.resolutionDeadline = new Date(Date.now() + ms);
      console.log(`   New resolution deadline: ${tracking.resolutionDeadline}\n`);
    }

    // Add to escalation history
    tracking.escalationHistory.push({
      level: nextLevel,
      escalatedAt: new Date(),
      escalatedTo: targetUserId,
      mode: 'manual', // Marking as manual since we triggered it
      reason: 'SLA breach - Manual escalation trigger'
    });

    await tracking.save();
    console.log('✅ Updated SLA tracking\n');

    console.log('🎉 Escalation completed successfully!');
    console.log('   Refresh the ticket page to see the changes');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

forceEscalation();
