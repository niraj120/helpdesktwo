import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function renameTitleToSubject() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const ticketsCollection = db.collection('tickets');

    // Find all tickets that have 'title' field but not 'subject' field
    const ticketsWithTitle = await ticketsCollection.find({
      title: { $exists: true },
      subject: { $exists: false }
    }).toArray();

    console.log(`\n📊 Found ${ticketsWithTitle.length} tickets with 'title' field to rename`);

    if (ticketsWithTitle.length === 0) {
      console.log('✅ No tickets need migration');
      await mongoose.disconnect();
      return;
    }

    let updatedCount = 0;

    for (const ticket of ticketsWithTitle) {
      try {
        // Rename 'title' to 'subject' for this ticket
        await ticketsCollection.updateOne(
          { _id: ticket._id },
          {
            $rename: { title: 'subject' },
            $set: { updatedAt: new Date() }
          }
        );
        updatedCount++;
        console.log(`✅ Renamed field for ticket ${ticket._id} (${ticket.ticketNumber})`);
      } catch (error) {
        console.error(`❌ Failed to update ticket ${ticket._id}:`, error);
      }
    }

    console.log(`\n✅ Migration completed: ${updatedCount} tickets updated`);
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Migration error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

renameTitleToSubject();
