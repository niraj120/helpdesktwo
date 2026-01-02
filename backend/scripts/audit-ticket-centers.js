const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Define schemas
const TicketSchema = new mongoose.Schema({}, { strict: false, collection: 'tickets' });
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const CenterSchema = new mongoose.Schema({}, { strict: false, collection: 'centers' });

const Ticket = mongoose.model('Ticket', TicketSchema);
const User = mongoose.model('User', UserSchema);
const Center = mongoose.model('Center', CenterSchema);

const auditTicketCenters = async () => {
  try {
    console.log('\n🔍 Starting Ticket Center Audit...\n');
    console.log('=' .repeat(100));

    // Get all tickets
    const tickets = await Ticket.find({}).lean();
    console.log(`\n📊 Total Tickets: ${tickets.length}`);

    // Statistics
    let hasCenter = 0;
    let hasNoCenter = 0;
    let hasNullCenter = 0;
    let hasOnlineCenter = 0;
    let hasValidObjectIdCenter = 0;
    let hasMismatchedCenter = 0;

    const issuesFound = [];

    for (const ticket of tickets) {
      const ticketNum = ticket.ticketNumber || ticket._id;
      const centerId = ticket.metadata?.centerId;
      const createdByAgent = ticket.metadata?.createdByAgent;
      const createdByAgentEmail = ticket.metadata?.createdByAgentEmail;
      const submissionSource = ticket.submissionSource;

      // Check if ticket has center
      if (!centerId) {
        hasNoCenter++;
        if (submissionSource === 'offline') {
          issuesFound.push({
            ticket: ticketNum,
            issue: 'OFFLINE ticket missing centerId',
            agent: createdByAgentEmail,
            submissionSource,
          });
        }
      } else if (centerId === null) {
        hasNullCenter++;
        if (submissionSource === 'offline') {
          issuesFound.push({
            ticket: ticketNum,
            issue: 'OFFLINE ticket has NULL centerId',
            agent: createdByAgentEmail,
            submissionSource,
          });
        }
      } else if (centerId === 'online') {
        hasOnlineCenter++;
      } else {
        hasCenter++;
        
        // Validate if centerId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(centerId)) {
          hasValidObjectIdCenter++;
          
          // Check if center exists
          const center = await Center.findById(centerId);
          if (!center) {
            issuesFound.push({
              ticket: ticketNum,
              issue: 'CenterId references non-existent center',
              centerId: centerId.toString(),
              agent: createdByAgentEmail,
            });
          } else {
            // If offline ticket, verify agent has this center
            if (submissionSource === 'offline' && createdByAgent) {
              const agent = await User.findById(createdByAgent);
              if (agent) {
                const agentCenterIds = (agent.centers || []).map(c => c.toString());
                if (!agentCenterIds.includes(centerId.toString())) {
                  hasMismatchedCenter++;
                  issuesFound.push({
                    ticket: ticketNum,
                    issue: 'CenterId does NOT match agent\'s centers',
                    centerId: center.centerName,
                    agent: createdByAgentEmail,
                    agentCenters: agentCenterIds.length,
                  });
                }
              }
            }
          }
        } else {
          issuesFound.push({
            ticket: ticketNum,
            issue: 'Invalid centerId format (not an ObjectId)',
            centerId: centerId,
            agent: createdByAgentEmail,
          });
        }
      }
    }

    // Print Summary
    console.log('\n' + '='.repeat(100));
    console.log('\n📊 TICKET CENTER AUDIT SUMMARY\n');
    console.log('='.repeat(100));
    console.log(`✅ Tickets with valid center ObjectId:  ${hasValidObjectIdCenter}`);
    console.log(`🌐 Tickets with 'online' center:        ${hasOnlineCenter}`);
    console.log(`⚠️  Tickets with NULL centerId:          ${hasNullCenter}`);
    console.log(`❌ Tickets with no centerId field:       ${hasNoCenter}`);
    console.log(`🔴 Tickets with mismatched centers:      ${hasMismatchedCenter}`);
    console.log('='.repeat(100));

    // Print Issues
    if (issuesFound.length > 0) {
      console.log(`\n\n⚠️  ISSUES FOUND: ${issuesFound.length}\n`);
      console.log('='.repeat(100));
      
      issuesFound.forEach((issue, index) => {
        console.log(`\n${index + 1}. Ticket: ${issue.ticket}`);
        console.log(`   Issue: ${issue.issue}`);
        if (issue.agent) console.log(`   Agent: ${issue.agent}`);
        if (issue.centerId) console.log(`   CenterId: ${issue.centerId}`);
        if (issue.agentCenters !== undefined) console.log(`   Agent has ${issue.agentCenters} center(s)`);
        if (issue.submissionSource) console.log(`   Source: ${issue.submissionSource}`);
      });
      
      console.log('\n' + '='.repeat(100));
    } else {
      console.log('\n\n✅ NO ISSUES FOUND - All tickets have correct center mappings!\n');
    }

    // Breakdown by submission source
    console.log('\n\n📋 BREAKDOWN BY SUBMISSION SOURCE\n');
    console.log('='.repeat(100));
    const offlineTickets = tickets.filter(t => t.submissionSource === 'offline');
    const onlineTickets = tickets.filter(t => t.submissionSource !== 'offline');
    
    console.log(`\nOffline Tickets: ${offlineTickets.length}`);
    const offlineWithCenter = offlineTickets.filter(t => t.metadata?.centerId && t.metadata?.centerId !== null && t.metadata?.centerId !== 'online').length;
    const offlineWithoutCenter = offlineTickets.length - offlineWithCenter;
    console.log(`  ✅ With valid center: ${offlineWithCenter}`);
    console.log(`  ❌ Without center: ${offlineWithoutCenter}`);
    
    console.log(`\nOnline Tickets: ${onlineTickets.length}`);
    const onlineWithOnlineCenter = onlineTickets.filter(t => t.metadata?.centerId === 'online').length;
    console.log(`  🌐 Marked as 'online': ${onlineWithOnlineCenter}`);
    
    console.log('\n' + '='.repeat(100));
    console.log('\n✅ Audit Complete!\n');

  } catch (error) {
    console.error('❌ Error during audit:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the audit
connectDB().then(() => {
  auditTicketCenters();
});
