require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk';

async function clearQueue() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const result = await mongoose.connection.collection('emailprocessingqueues').deleteMany({
      status: { $in: ['pending', 'processing', 'failed'] }
    });

    console.log(`✅ Deleted ${result.deletedCount} emails from queue`);
    console.log('   These will be re-fetched with correct email structure');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearQueue();
