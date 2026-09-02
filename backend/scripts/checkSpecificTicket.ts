import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { Ticket } from '../src/models/Ticket';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

async function checkSpecificTicket() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const ticketId = '6944f64ef960003ed4b307eb';
    const ticket = await Ticket.findById(ticketId);
    
    if (!ticket) {
      console.log('❌ Ticket not found');
      process.exit(1);
    }

    console.log(`\n📋 Ticket: ${ticket.ticketNumber}`);
    console.log(`   Status: "${ticket.status}"`);
    console.log(`   Status type: ${typeof ticket.status}`);
    console.log(`   Status length: ${ticket.status.length}`);
    console.log(`   Status charCodes: ${Array.from(ticket.status).map(c => c.charCodeAt(0)).join(',')}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSpecificTicket();
