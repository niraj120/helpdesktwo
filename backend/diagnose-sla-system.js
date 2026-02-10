// Diagnostic script to check SLA tracking, escalation policies, and tickets
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

const SLATrackingSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  escalationPolicyId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscalationPolicy' },
  slaRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SLARule' },
  currentEscalationLevel: { type: Number, default: 0 },
  resolutionDeadline: Date,
  nextEscalationDue: Date
}, { timestamps: true });

const EscalationPolicySchema = new mongoose.Schema({
  name: String,
  priority: { type: mongoose.Schema.Types.ObjectId, ref: 'Priority' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  levels: [{
    level: Number,
    escalationMode: String,
    escalateAfter: {
      value: Number,
      unit: String
    },
    escalateTo: {
      type: String,
      targetId: mongoose.Schema.Types.ObjectId,
      targetName: String
    }
  }]
}, { timestamps: true });

const TicketSchema = new mongoose.Schema({
  ticketNumber: String,
  title: String,
  status: String,
  priority: String,
  createdAt: Date,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const SLATracking = mongoose.model('SLATracking', SLATrackingSchema, 'slatrackings');
const EscalationPolicy = mongoose.model('EscalationPolicy', EscalationPolicySchema, 'escalationpolicies');
const Ticket = mongoose.model('Ticket', TicketSchema, 'tickets');

async function diagnose() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check escalation policies
    const policies = await EscalationPolicy.find().populate('priority category');
    console.log(`📋 Escalation Policies: ${policies.length}`);
    for (const policy of policies) {
      console.log(`  - ${policy.name}`);
      console.log(`    Priority: ${policy.priority?.name || 'N/A'}`);
      console.log(`    Category: ${policy.category?.name || 'N/A'}`);
      console.log(`    Levels: ${policy.levels?.length || 0}`);
      if (policy.levels && policy.levels.length > 0) {
        const l1 = policy.levels[0];
        if (l1 && l1.escalateAfter && l1.escalateTo) {
          console.log(`    L1: ${l1.escalateAfter.value} ${l1.escalateAfter.unit} → ${l1.escalateTo.targetName || 'Unknown'}`);
        }
      }
    }
    console.log('');

    // Check SLA tracking records
    const allSLATracking = await SLATracking.find().limit(10).populate('ticketId');
    console.log(`📊 SLA Tracking Records (total): ${await SLATracking.countDocuments()}`);
    console.log(`📊 With escalation policy: ${await SLATracking.countDocuments({ escalationPolicyId: { $ne: null } })}`);
    console.log(`📊 Without escalation policy: ${await SLATracking.countDocuments({ escalationPolicyId: null })}\n`);

    // Show sample SLA tracking records
    console.log(`Sample SLA Tracking Records (first 5):`);
    for (const sla of allSLATracking.slice(0, 5)) {
      console.log(`  - Ticket: ${sla.ticketId?.ticketNumber || 'N/A'}`);
      console.log(`    Resolution Deadline: ${sla.resolutionDeadline}`);
      console.log(`    Escalation Policy ID: ${sla.escalationPolicyId || 'NONE'}`);
      console.log(`    SLA Rule ID: ${sla.slaRuleId || 'NONE'}`);
      console.log(`    Current Level: ${sla.currentEscalationLevel}`);
      console.log('');
    }

    // Check recent tickets
    const recentTickets = await Ticket.find({ assignedTo: { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('assignedTo', 'firstName lastName');

    console.log(`🎫 Recent Assigned Tickets: ${recentTickets.length}`);
    for (const ticket of recentTickets) {
      console.log(`  - ${ticket.ticketNumber}: ${ticket.title}`);
      console.log(`    Status: ${ticket.status}, Priority: ${ticket.priority}`);
      console.log(`    Assigned: ${ticket.assignedTo?.firstName} ${ticket.assignedTo?.lastName}`);
      console.log(`    Created: ${ticket.createdAt}`);
      
      // Check if SLA tracking exists
      const slaTracking = await SLATracking.findOne({ ticketId: ticket._id });
      if (slaTracking) {
        console.log(`    ✓ Has SLA Tracking`);
        console.log(`      Deadline: ${slaTracking.resolutionDeadline}`);
        console.log(`      Policy: ${slaTracking.escalationPolicyId ? '✓' : '✗'}`);
      } else {
        console.log(`    ✗ NO SLA Tracking`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Connection closed');
  }
}

diagnose();
