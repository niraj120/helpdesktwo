const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function migrateSubmissionSource() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');

    // Update all tickets that don't have submissionSource field
    const result = await ticketsCollection.updateMany(
      { submissionSource: { $exists: false } },
      { 
        $set: { 
          submissionSource: 'online' // Default old tickets to 'online'
        } 
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} tickets with submissionSource field`);

    // Also check for tickets with submissionSource in metadata.submissionType
    const result2 = await ticketsCollection.updateMany(
      { 
        submissionSource: { $exists: false },
        'metadata.submissionType': 'offline'
      },
      { 
        $set: { 
          submissionSource: 'offline'
        } 
      }
    );

    console.log(`✅ Updated ${result2.modifiedCount} tickets from metadata.submissionType`);

    await mongoose.connection.close();
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateSubmissionSource();
