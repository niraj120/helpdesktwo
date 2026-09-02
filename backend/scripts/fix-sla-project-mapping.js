require('dotenv').config();
/**
 * Script to fix SLA Rule project mappings
 * This updates SLA rules to map to the correct project IDs
 * 
 * Usage:
 * 1. Update the OLD_PROJECT_ID and NEW_PROJECT_ID below
 * 2. Run: node scripts/fix-sla-project-mapping.js
 */

const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

// Replace these with your actual project IDs
const OLD_PROJECT_ID = '6923190ff823462759296988'; // The wrong project ID in SLA rules
const NEW_PROJECT_ID = '6938f34bedea0c244850566d'; // The correct project ID (State Common Entrance Test Cell)

async function fixSLAProjectMapping() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const SLARule = mongoose.connection.collection('slarules');

    // Find all SLA rules with the old project ID
    console.log(`🔍 Searching for SLA rules with project ID: ${OLD_PROJECT_ID}`);
    const slaRules = await SLARule.find({
      projectIds: mongoose.Types.ObjectId(OLD_PROJECT_ID)
    }).toArray();

    console.log(`📋 Found ${slaRules.length} SLA rules to update:\n`);
    slaRules.forEach(sla => {
      console.log(`  - ${sla.name} (Priority: ${sla.priority || 'N/A'})`);
    });

    if (slaRules.length === 0) {
      console.log('\n⚠️  No SLA rules found with the old project ID.');
      console.log('   Please check if the project IDs are correct.');
      await mongoose.disconnect();
      return;
    }

    // Ask for confirmation (in a real script, you'd use readline or prompt)
    console.log(`\n🔄 This will replace project ID ${OLD_PROJECT_ID}`);
    console.log(`   with ${NEW_PROJECT_ID} in all SLA rules above.`);
    console.log('\n⚠️  IMPORTANT: Backup your database before running this!\n');

    // Update the SLA rules
    const result = await SLARule.updateMany(
      { projectIds: mongoose.Types.ObjectId(OLD_PROJECT_ID) },
      { 
        $set: { 
          'projectIds.$[elem]': mongoose.Types.ObjectId(NEW_PROJECT_ID)
        }
      },
      {
        arrayFilters: [{ 'elem': mongoose.Types.ObjectId(OLD_PROJECT_ID) }]
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} SLA rules successfully!`);
    console.log('\n📊 Summary:');
    console.log(`   - Matched: ${result.matchedCount}`);
    console.log(`   - Modified: ${result.modifiedCount}`);

    // Verify the update
    console.log('\n🔍 Verifying updates...');
    const updatedRules = await SLARule.find({
      projectIds: mongoose.Types.ObjectId(NEW_PROJECT_ID)
    }).toArray();

    console.log(`✅ ${updatedRules.length} SLA rules now mapped to new project ID:`);
    updatedRules.forEach(sla => {
      console.log(`  - ${sla.name}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done! Database connection closed.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
fixSLAProjectMapping();
