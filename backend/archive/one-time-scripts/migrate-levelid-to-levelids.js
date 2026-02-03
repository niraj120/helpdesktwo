const mongoose = require('mongoose');

async function migrateLevelIdToLevelIds() {
  try {
    const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';
    
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false }), 'kbtables');
    
    // Find all KB tables
    const tables = await KBTable.find({});
    console.log(`📊 Found ${tables.length} KB tables\n`);

    let updatedCount = 0;

    for (const table of tables) {
      let needsUpdate = false;
      let levelIds = [];

      // If table has old levelId field, convert it to levelIds array
      if (table.levelId && !table.levelIds) {
        levelIds = [table.levelId];
        needsUpdate = true;
      } else if (!table.levelIds) {
        levelIds = [];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await KBTable.updateOne(
          { _id: table._id },
          { 
            $set: { levelIds: levelIds },
            $unset: { levelId: "" }
          }
        );
        updatedCount++;
        console.log(`✅ Updated table: ${table.tableName} (ID: ${table._id})`);
        console.log(`   Converted levelId to levelIds: ${JSON.stringify(levelIds)}\n`);
      }
    }

    console.log(`\n✅ Migration complete! Updated ${updatedCount} out of ${tables.length} tables`);
    
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateLevelIdToLevelIds();
