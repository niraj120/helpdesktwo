import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

/**
 * Migration script to update all ticket threads
 * Replace "(Creating Agent)" with "(Counselor)" in thread messages
 */
async function updateCreatingAgentToCounselor() {
  try {
    console.log('🚀 Starting migration: Update Creating Agent to Counselor');
    console.log('📦 Connecting to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Ticket = mongoose.connection.collection('tickets');

    // Find all tickets with threads containing "(Creating Agent)"
    const ticketsWithCreatingAgent = await Ticket.find({
      'threads.message': { $regex: /\(Creating Agent\)/i }
    }).toArray();

    console.log(`\n📊 Found ${ticketsWithCreatingAgent.length} tickets with "(Creating Agent)" in threads`);

    if (ticketsWithCreatingAgent.length === 0) {
      console.log('✅ No tickets to update. Migration complete.');
      await mongoose.disconnect();
      return;
    }

    let updatedCount = 0;
    let threadCount = 0;

    for (const ticket of ticketsWithCreatingAgent) {
      let modified = false;
      
      // Update each thread message
      if (ticket.threads && Array.isArray(ticket.threads)) {
        for (let i = 0; i < ticket.threads.length; i++) {
          const thread = ticket.threads[i];
          if (thread.message && thread.message.includes('(Creating Agent)')) {
            ticket.threads[i].message = thread.message.replace(/\(Creating Agent\)/g, '(Counselor)');
            modified = true;
            threadCount++;
            console.log(`  📝 Updated thread in ticket ${ticket.ticketNumber}: "${thread.message.substring(0, 50)}..."`);
          }
        }
      }

      // Update the ticket in database
      if (modified) {
        await Ticket.updateOne(
          { _id: ticket._id },
          { $set: { threads: ticket.threads, updatedAt: new Date() } }
        );
        updatedCount++;
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Tickets updated: ${updatedCount}`);
    console.log(`   - Thread messages updated: ${threadCount}`);

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the migration
updateCreatingAgentToCounselor();
