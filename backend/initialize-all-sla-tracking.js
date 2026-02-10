// Initialize SLA tracking for all existing tickets
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

const TicketSchema = new mongoose.Schema({
  ticketNumber: String,
  title: String,
  subject: String,
  priority: String,
  status: mongoose.Schema.Types.Mixed,
  createdAt: Date,
  assignedTo: { type: mongoose.Schema.Types.ObjectId },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const SLARuleSchema = new mongoose.Schema({
  name: String,
  priority: String,
  projectIds: [{ type: mongoose.Schema.Types.ObjectId }],
  responseTime: { value: Number, unit: String },
  resolutionTime: { value: Number, unit: String },
  escalationPolicyId: { type: mongoose.Schema.Types.ObjectId },
  isActive: Boolean
}, { timestamps: true });

const EscalationPolicySchema = new mongoose.Schema({
  name: String,
  levels: [{
    level: Number,
    escalationMode: String,
    escalateAfter: { value: Number, unit: String },
    escalateTo: {
      type: String,
      targetId: mongoose.Schema.Types.ObjectId,
      targetName: String
    }
  }]
}, { timestamps: true });

const SLATrackingSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  projectId: { type: mongoose.Schema.Types.ObjectId },
  slaRuleId: { type: mongoose.Schema.Types.ObjectId },
  escalationPolicyId: { type: mongoose.Schema.Types.ObjectId },
  responseDeadline: Date,
  resolutionDeadline: Date,
  responseStatus: String,
  resolutionStatus: String,
  currentEscalationLevel: { type: Number, default: 0 },
  nextEscalationDue: Date,
  escalationHistory: Array,
  isPaused: Boolean,
  pausedDuration: { type: Number, default: 0 }
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', TicketSchema, 'tickets');
const SLARule = mongoose.model('SLARule', SLARuleSchema, 'slarules');
const EscalationPolicy = mongoose.model('EscalationPolicy', EscalationPolicySchema, 'escalationpolicies');
const SLATracking = mongoose.model('SLATracking', SLATrackingSchema, 'slatrackings');

// Helper function to calculate deadline
function calculateDeadline(createdAt, timeConfig) {
  const { value, unit } = timeConfig;
  const created = new Date(createdAt);
  
  switch (unit?.toLowerCase()) {
    case 'minutes':
      return new Date(created.getTime() + value * 60 * 1000);
    case 'hours':
      return new Date(created.getTime() + value * 60 * 60 * 1000);
    case 'days':
      return new Date(created.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      return new Date(created.getTime() + value * 60 * 60 * 1000);
  }
}

async function initializeAllSLA() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all open tickets without SLA tracking
    const tickets = await Ticket.find({
      status: { $in: [1, '1', 'open', 'Open', 2, '2', 'in-progress', 'In Progress'] }
    }).sort({ createdAt: -1 });

    console.log(`📋 Found ${tickets.length} open tickets\n`);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const ticket of tickets) {
      try {
        // Check if already has SLA tracking
        const existing = await SLATracking.findOne({ ticketId: ticket._id });
        
        if (existing) {
          console.log(`⏭️  ${ticket.ticketNumber}: Already has SLA tracking`);
          skippedCount++;
          continue;
        }

        // Get project ID from metadata
        const projectId = ticket.metadata?.projectId;
        if (!projectId) {
          console.log(`⚠️  ${ticket.ticketNumber}: No project ID in metadata`);
          failedCount++;
          continue;
        }

        const priority = ticket.priority || 'medium';

        // Find applicable SLA rule
        const slaRule = await SLARule.findOne({
          projectIds: { $in: [new mongoose.Types.ObjectId(projectId)] },
          priority: priority.toUpperCase(),
          isActive: true
        }).populate('escalationPolicyId');

        if (!slaRule) {
          console.log(`⚠️  ${ticket.ticketNumber}: No SLA rule found for priority ${priority}`);
          failedCount++;
          continue;
        }

        // Calculate deadlines
        const responseDeadline = calculateDeadline(ticket.createdAt, slaRule.responseTime);
        
        let resolutionDeadline;
        let nextEscalationDue;
        let escalationPolicyId = null;

        // Get escalation policy
        const escalationPolicy = slaRule.escalationPolicyId;

        if (escalationPolicy && escalationPolicy.levels && escalationPolicy.levels.length > 0) {
          const firstLevel = escalationPolicy.levels.find(l => l.level === 1);
          if (firstLevel) {
            // Use escalation policy's first level time as the initial SLA
            resolutionDeadline = calculateDeadline(ticket.createdAt, firstLevel.escalateAfter);
            
            // Set next escalation due for auto-escalation
            if (firstLevel.escalationMode === 'auto') {
              nextEscalationDue = resolutionDeadline;
            }
            
            escalationPolicyId = escalationPolicy._id;
          } else {
            // Fallback to SLA rule resolution time
            resolutionDeadline = calculateDeadline(ticket.createdAt, slaRule.resolutionTime);
          }
        } else {
          // No escalation policy - use SLA rule resolution time
          resolutionDeadline = calculateDeadline(ticket.createdAt, slaRule.resolutionTime);
        }

        // Create SLA tracking record
        const tracking = new SLATracking({
          ticketId: ticket._id,
          projectId: new mongoose.Types.ObjectId(projectId),
          slaRuleId: slaRule._id,
          escalationPolicyId,
          responseDeadline,
          resolutionDeadline,
          responseStatus: 'pending',
          resolutionStatus: 'pending',
          currentEscalationLevel: 0,
          nextEscalationDue,
          escalationHistory: [],
          isPaused: false,
          pausedDuration: 0
        });

        await tracking.save();

        // Calculate time remaining for display
        const now = new Date();
        const diffMs = resolutionDeadline.getTime() - now.getTime();
        const hours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
        const minutes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));

        console.log(`✅ ${ticket.ticketNumber}: SLA tracking initialized (${hours}h ${minutes}m ${diffMs < 0 ? 'overdue' : 'remaining'})`);
        successCount++;

      } catch (error) {
        console.log(`❌ ${ticket.ticketNumber}: Failed - ${error.message}`);
        failedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   ✅ Initialized: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`   📋 Total: ${tickets.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

initializeAllSLA();
