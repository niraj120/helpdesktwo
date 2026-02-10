// Create SLA rules for HubbleStar project and initialize SLA tracking for HSTR tickets
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

const TicketSchema = new mongoose.Schema({
  ticketNumber: String,
  priority: String,
  createdAt: Date,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const ProjectSchema = new mongoose.Schema({
  name: String,
  code: String
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
  levels: Array
}, { timestamps: true });

const SLATrackingSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId },
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
}, { timestamps: true});

const Ticket = mongoose.model('Ticket', TicketSchema, 'tickets');
const Project = mongoose.model('Project', ProjectSchema, 'projects');
const SLARule = mongoose.model('SLARule', SLARuleSchema, 'slarules');
const EscalationPolicy = mongoose.model('EscalationPolicy', EscalationPolicySchema, 'escalationpolicies');
const SLATracking = mongoose.model('SLATracking', SLATrackingSchema, 'slatrackings');

// Helper function
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

async function setupHubbleStarSLA() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find HubbleStar project
    const hubblestarProject = await Project.findOne({ $or: [{ code: 'hubblestar' }, { name: /hubblestar/i }] });
    
    if (!hubblestarProject) {
      console.log('❌ HubbleStar project not found');
      return;
    }

    console.log(`📋 Found project: ${hubblestarProject.name} (${hubblestarProject._id})\n`);

    // Get the escalation policy
    const escalationPolicy = await EscalationPolicy.findOne({ name: 'hubblestar' });
    
    if (!escalationPolicy) {
      console.log('❌ hubblestar escalation policy not found');
      return;
    }

    console.log(`📋 Found escalation policy: ${escalationPolicy.name}\n`);

    // Create SLA rules for HubbleStar if they don't exist
    const priorities = ['HIGH', 'MEDIUM', 'LOW'];
    const slaConfigs = {
      HIGH: { responseTime: { value: 15, unit: 'minutes' }, resolutionTime: { value: 2, unit: 'hours' } },
      MEDIUM: { responseTime: { value: 30, unit: 'minutes' }, resolutionTime: { value: 2, unit: 'hours' } },
      LOW: { responseTime: { value: 2, unit: 'hours' }, resolutionTime: { value: 2, unit: 'hours' } }
    };

    for (const priority of priorities) {
      const existingRule = await SLARule.findOne({
        projectIds: { $in: [hubblestarProject._id] },
        priority: priority
      });

      if (!existingRule) {
        const config = slaConfigs[priority];
        const newRule = new SLARule({
          name: priority,
          priority: priority,
          projectIds: [hubblestarProject._id],
          responseTime: config.responseTime,
          resolutionTime: config.resolutionTime,
          escalationPolicyId: escalationPolicy._id,
          isActive: true
        });

        await newRule.save();
        console.log(`✅ Created SLA rule: ${priority}`);
      } else {
        // Update to add escalation policy if missing
        if (!existingRule.escalationPolicyId) {
          existingRule.escalationPolicyId = escalationPolicy._id;
          await existingRule.save();
          console.log(`✅ Updated existing SLA rule: ${priority}`);
        } else {
          console.log(`⏭️  SLA rule already exists: ${priority}`);
        }
      }
    }

    // Now initialize SLA tracking for HSTR tickets
    console.log('\n📋 Initializing SLA tracking for HSTR tickets...\n');

    const hstrTickets = await Ticket.find({
      ticketNumber: /^HSTR-/,
      status: { $in: [1, '1', 'open', 'Open'] }
    });

    console.log(`Found ${hstrTickets.length} HSTR tickets\n`);

    let initialized = 0;

    for (const ticket of hstrTickets) {
      // Check if already has SLA tracking
      const existing = await SLATracking.findOne({ ticketId: ticket._id });
      if (existing) {
        console.log(`⏭️  ${ticket.ticketNumber}: Already has SLA tracking`);
        continue;
      }

      const priority = (ticket.priority || 'MEDIUM').toUpperCase();

      // Find SLA rule
      const slaRule = await SLARule.findOne({
        projectIds: { $in: [hubblestarProject._id] },
        priority: priority,
        isActive: true
      });

      if (!slaRule) {
        console.log(`⚠️  ${ticket.ticketNumber}: No SLA rule for priority ${priority}`);
        continue;
      }

      // Calculate deadlines using escalation policy L1 time
      const responseDeadline = calculateDeadline(ticket.createdAt, slaRule.responseTime);
      
      const firstLevel = escalationPolicy.levels?.find(l => l.level === 1);
      const resolutionDeadline = firstLevel 
        ? calculateDeadline(ticket.createdAt, firstLevel.escalateAfter)
        : calculateDeadline(ticket.createdAt, slaRule.resolutionTime);

      const nextEscalationDue = firstLevel?.escalationMode === 'auto' ? resolutionDeadline : undefined;

      // Create SLA tracking
      const tracking = new SLATracking({
        ticketId: ticket._id,
        projectId: hubblestarProject._id,
        slaRuleId: slaRule._id,
        escalationPolicyId: escalationPolicy._id,
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

      const now = new Date();
      const diffMs = resolutionDeadline.getTime() - now.getTime();
      const hours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
      const minutes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));

      console.log(`✅ ${ticket.ticketNumber}: SLA tracking initialized (${hours}h ${minutes}m ${diffMs < 0 ? 'overdue' : 'remaining'})`);
      initialized++;
    }

    console.log(`\n✅ Initialized SLA tracking for ${initialized} HSTR tickets`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

setupHubbleStarSLA();
