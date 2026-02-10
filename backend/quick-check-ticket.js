// Simple check for HSTR-2026-02-0005 SLA tracking
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

async function checkTicket() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');
    const slaTrackingCollection = db.collection('slatrackings');
    
    const ticket = await ticketsCollection.findOne({ ticketNumber: 'HSTR-2026-02-0005' });
    
    if (!ticket) {
      console.log('❌ Ticket not found');
      return;
    }
    
    console.log(`\n🎫 Ticket: ${ticket.ticketNumber}`);
    console.log(`   Priority: ${ticket.priority}`);
    console.log(`   Status: ${ticket.status}`);
    console.log(`   Created: ${ticket.createdAt}`);
    
    const slaTracking = await slaTrackingCollection.findOne({ ticketId: ticket._id });
    
    if (!slaTracking) {
      console.log('   ❌ NO SLA TRACKING\n');
      return;
    }
    
    console.log(`   ✅ HAS SLA TRACKING`);
    console.log(`   Resolution Deadline: ${slaTracking.resolutionDeadline}`);
    console.log(`   Current Level: ${slaTracking.currentEscalationLevel}`);
    console.log(`   Next Escalation Due: ${slaTracking.nextEscalationDue || 'N/A'}`);
    
    // Calculate time remaining
    const now = new Date();
    const deadline = new Date(slaTracking.resolutionDeadline);
    const diffMs = deadline.getTime() - now.getTime();
    const hours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const minutes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));
    
    console.log(`   Time Status: ${hours}h ${minutes}m ${diffMs < 0 ? 'OVERDUE' : 'REMAINING'}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkTicket();
