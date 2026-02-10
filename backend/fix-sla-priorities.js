// Fix SLA rules priority field
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

const SLARuleSchema = new mongoose.Schema({
  name: String,
  priority: String,
  isActive: Boolean
}, { timestamps: true, strict: false });

const SLARule = mongoose.model('SLARule', SLARuleSchema, 'slarules');

async function fixSLARulePriorities() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const slaRules = await SLARule.find({ isActive: true });
    
    console.log(`📋 Found ${slaRules.length} active SLA rules\n`);

    for (const rule of slaRules) {
      console.log(`Updating: ${rule.name}`);
      console.log(`  Current priority field: ${rule.priority}`);
      
      // Set priority to uppercase version of name
      const priorityValue = rule.name.toUpperCase();
      rule.priority = priorityValue;
      
      await rule.save();
      console.log(`  ✅ Updated to: ${priorityValue}\n`);
    }

    console.log('\n✅ All SLA rules updated!');

    // Verify
    console.log('\n📋 Verification:');
    const updated = await SLARule.find({ isActive: true });
    for (const rule of updated) {
      console.log(`  ${rule.name} → priority: ${rule.priority}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

fixSLARulePriorities();
