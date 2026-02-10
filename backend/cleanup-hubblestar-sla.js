// Remove incorrectly added HIGH and MEDIUM SLA rules for HubbleStar
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

async function cleanupSLARules() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const projectsCollection = db.collection('projects');
    const slaRulesCollection = db.collection('slarules');
    
    // Find HubbleStar project
    const project = await projectsCollection.findOne({ 
      $or: [{ code: 'hubblestar' }, { name: /hubblestar/i }] 
    });
    
    if (!project) {
      console.log('❌ HubbleStar project not found');
      return;
    }
    
    console.log('\n📋 Removing incorrect SLA rules for HubbleStar...\n');
    
    // Delete HIGH and MEDIUM rules (created on Feb 10)
    const result = await slaRulesCollection.deleteMany({
      projectIds: { $in: [project._id] },
      priority: { $in: ['HIGH', 'MEDIUM'] },
      name: { $in: ['HIGH', 'MEDIUM'] }
    });
    
    console.log(`✅ Deleted ${result.deletedCount} incorrect SLA rules\n`);
    
    // Verify remaining rules
    const remaining = await slaRulesCollection.find({
      projectIds: { $in: [project._id] }
    }).toArray();
    
    console.log('📊 Remaining SLA Rules for HubbleStar:');
    console.log(`   Total: ${remaining.length}\n`);
    
    for (const rule of remaining) {
      console.log(`   ✓ ${rule.name} (Priority: ${rule.priority})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

cleanupSLARules();
