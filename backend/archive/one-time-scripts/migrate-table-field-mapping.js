const mongoose = require('mongoose');

async function migrateTableFieldMappings() {
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
      const updatedColumns = table.columns.map(column => {
        // If articleFieldMapping is a string, convert to array
        if (column.articleFieldMapping && typeof column.articleFieldMapping === 'string') {
          needsUpdate = true;
          return {
            columnName: column.columnName,
            columnType: column.columnType,
            isRequired: column.isRequired,
            order: column.order,
            articleFieldMapping: [column.articleFieldMapping]
          };
        }
        // If articleFieldMapping doesn't exist or is undefined, set to empty array
        if (!column.articleFieldMapping) {
          needsUpdate = true;
          return {
            columnName: column.columnName,
            columnType: column.columnType,
            isRequired: column.isRequired,
            order: column.order,
            articleFieldMapping: []
          };
        }
        return column;
      });

      if (needsUpdate) {
        await KBTable.updateOne(
          { _id: table._id },
          { $set: { columns: updatedColumns } }
        );
        updatedCount++;
        console.log(`✅ Updated table: ${table.tableName} (ID: ${table._id})`);
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

migrateTableFieldMappings();
