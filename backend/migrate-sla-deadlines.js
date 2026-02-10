// Script to update existing tickets' SLA tracking to use escalation policy times
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

const SLATrackingSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  escalationPolicyId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscalationPolicy' },
  currentEscalationLevel: { type: Number, default: 0 },
  resolutionDeadline: Date,
  nextEscalationDue: Date,
  createdAt: Date
}, { timestamps: true });

const TicketSchema = new mongoose.Schema({
  ticketNumber: String,
  title: String,
  status: String,
  createdAt: Date
}, { timestamps: true });

const SLATracking = mongoose.model('SLATracking', SLATrackingSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);

// Helper function to calculate deadline
function calculateEscalationDeadline(escalateAfter) {
  const { value, unit } = escalateAfter;
  const now = new Date();
  
  switch (unit?.toLowerCase()) {
    case 'minutes':
      return new Date(now.getTime() + value * 60 * 1000);
    case 'hours':
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'days':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + value * 60 * 60 * 1000);
  }
}

async function updateExistingSLATracking() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all SLA tracking records with escalation policies
    const slaTrackings = await SLATracking.find({ 
      escalationPolicyId: { $ne: null } 
    })
    .populate('escalationPolicyId')
    .populate('ticketId');

    console.log(`📊 Found ${slaTrackings.length} SLA tracking records with escalation policies\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const slaTracking of slaTrackings) {
      const ticket = slaTracking.ticketId;
      const policy = slaTracking.escalationPolicyId;
      
      // Skip if ticket is resolved or closed
      if (!ticket || ['4', '5', 'resolved', 'closed'].includes(String(ticket.status).toLowerCase())) {
        skippedCount++;
        continue;
      }

      // Get the current escalation level configuration
      const levelIndex = slaTracking.currentEscalationLevel || 0;
      const levelConfig = policy.levels?.find(l => l.level === levelIndex + 1);

      if (!levelConfig) {
        console.log(`⚠️  Skipping ${ticket.ticketNumber}: No level config found for level ${levelIndex + 1}`);
        skippedCount++;
        continue;
      }

      // Calculate new deadline based on ticket creation time + level escalation time
      const ticketCreatedAt = new Date(ticket.createdAt);
      const { value, unit } = levelConfig.escalateAfter;
      let deadlineMs = 0;
      
      switch (unit?.toLowerCase()) {
        case 'minutes':
          deadlineMs = value * 60 * 1000;
          break;
        case 'hours':
          deadlineMs = value * 60 * 60 * 1000;
          break;
        case 'days':
          deadlineMs = value * 24 * 60 * 60 * 1000;
          break;
        default:
          deadlineMs = value * 60 * 60 * 1000;
      }

      const newDeadline = new Date(ticketCreatedAt.getTime() + deadlineMs);
      const oldDeadline = slaTracking.resolutionDeadline;

      // Only update if the deadline is different
      if (oldDeadline.getTime() !== newDeadline.getTime()) {
        slaTracking.resolutionDeadline = newDeadline;
        slaTracking.nextEscalationDue = newDeadline;
        await slaTracking.save();

        console.log(`✅ Updated ${ticket.ticketNumber}:`);
        console.log(`   Old deadline: ${oldDeadline.toLocaleString()}`);
        console.log(`   New deadline: ${newDeadline.toLocaleString()} (${value} ${unit} from creation)`);
        console.log(`   Level: ${levelConfig.escalateTo.targetName || `L${levelIndex + 1}`}\n`);
        
        updatedCount++;
      } else {
        console.log(`✓ ${ticket.ticketNumber} already has correct deadline`);
        skippedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration Complete:`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${slaTrackings.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

updateExistingSLATracking();
