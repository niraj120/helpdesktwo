const mongoose = require('mongoose');

// MongoDB connection
const MONGO_URI = 'mongodb://localhost:27017/sac_helpdesk';

async function activateSLARules() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const slarulesCollection = db.collection('slarules');

    // Update all SLA rules to set isActive to true
    const result = await slarulesCollection.updateMany(
      {},
      { $set: { isActive: true } }
    );

    console.log(`✅ Updated ${result.modifiedCount} SLA rules`);
    console.log(`   Matched: ${result.matchedCount}`);

    // Show the updated documents
    const updatedRules = await slarulesCollection.find({}).toArray();
    console.log('\n📋 Updated SLA Rules:');
    updatedRules.forEach(rule => {
      console.log(`   - ${rule.name}: priority=${rule.priority}, isActive=${rule.isActive}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

activateSLARules();
