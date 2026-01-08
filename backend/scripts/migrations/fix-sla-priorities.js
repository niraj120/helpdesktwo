const mongoose = require('mongoose');

// MongoDB connection
const MONGO_URI = 'mongodb://localhost:27017/sac_helpdesk';

async function fixSLAPriorities() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const slarulesCollection = db.collection('slarules');

    // Get all SLA rules
    const allRules = await slarulesCollection.find({}).toArray();
    console.log('\n📋 Current SLA Rules:');
    allRules.forEach(rule => {
      console.log(`   - ${rule.name}: priority=${rule.priority}, isActive=${rule.isActive}`);
    });

    // Fix priorities based on rule names
    const updates = [];
    
    for (const rule of allRules) {
      const name = rule.name.toLowerCase();
      let priority = null;
      
      if (name.includes('low')) {
        priority = 'Low';
      } else if (name.includes('medium') || name.includes('normal')) {
        priority = 'Normal';
      } else if (name.includes('high')) {
        priority = 'High';
      } else if (name.includes('urgent')) {
        priority = 'Urgent';
      } else if (name.includes('critical')) {
        priority = 'Critical';
      }
      
      if (priority) {
        updates.push({
          _id: rule._id,
          priority: priority
        });
      }
    }

    console.log('\n🔄 Updating priorities:');
    for (const update of updates) {
      await slarulesCollection.updateOne(
        { _id: update._id },
        { $set: { priority: update.priority, isActive: true } }
      );
      console.log(`   ✅ Set priority to "${update.priority}" for rule ${update._id}`);
    }

    // Show updated rules
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

fixSLAPriorities();
