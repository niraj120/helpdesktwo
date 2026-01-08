import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { Ticket } from '../src/models/Ticket';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk';

async function fixTicketStatusCodes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Map of incorrect codes to correct codes
    const codeMapping: Record<string, string> = {
      'OPEN': 'open',
      'Open': 'open',
      'CLOSE': 'closed',
      'Close': 'closed',
      'CLOSED': 'closed',
      'Closed': 'closed',
      'RESOLVED': 'resolved',
      'Resolved': 'resolved',
      'ONHOLD': 'on-hold',
      'On-hold': 'on-hold',
      'ON-HOLD': 'on-hold',
      'IN-PROGRESS': 'in-progress',
      'In-Progress': 'in-progress',
      'INPROGRESS': 'in-progress',
      'In Progress': 'in-progress'
    };

    const tickets = await Ticket.find({});
    console.log(`\n📋 Found ${tickets.length} tickets\n`);

    let updatedCount = 0;

    for (const ticket of tickets) {
      const oldStatus = String(ticket.status);
      const newStatus = codeMapping[oldStatus] || oldStatus.toLowerCase();
      
      if (oldStatus !== newStatus) {
        console.log(`Ticket ${ticket.ticketNumber}: "${oldStatus}" → "${newStatus}"`);
        ticket.status = newStatus as any;
        await ticket.save();
        updatedCount++;
      }
    }

    console.log(`\n✅ Updated ${updatedCount} ticket(s)`);
    console.log(`✓ ${tickets.length - updatedCount} ticket(s) already had correct status codes`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixTicketStatusCodes();
