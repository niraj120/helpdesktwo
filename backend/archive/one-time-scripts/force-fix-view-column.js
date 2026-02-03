require('dotenv').config();
const mongoose = require('mongoose');

async function forceFixViewColumn() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Use direct MongoDB update to bypass Mongoose middleware
    const db = mongoose.connection.db;
    const kbtablesCollection = db.collection('kbtables');

    console.log('=== STEP 1: Find Notices table ===');
    const table = await kbtablesCollection.findOne({ tableName: 'Notices' });
    
    if (!table) {
      console.log('❌ Notices table not found');
      process.exit(1);
    }

    console.log('✅ Found table:', table._id);
    
    // Find the View column
    const viewColumnIndex = table.columns.findIndex(col => col.columnName === 'View');
    
    if (viewColumnIndex === -1) {
      console.log('❌ View column not found');
      process.exit(1);
    }

    console.log('✅ Found View column at index:', viewColumnIndex);
    console.log('Current mapping:', table.columns[viewColumnIndex].articleFieldMapping);

    // Update using MongoDB update operation
    console.log('\n=== STEP 2: Updating with MongoDB native update ===');
    
    const result = await kbtablesCollection.updateOne(
      { 
        _id: table._id,
        'columns.columnName': 'View'
      },
      {
        $set: {
          'columns.$.articleFieldMapping': ['externalUrl', 'pdfUrl', 'htmlContent']
        }
      }
    );

    console.log('Update result:', {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      acknowledged: result.acknowledged
    });

    // Verify the update
    console.log('\n=== STEP 3: Verifying update ===');
    const updatedTable = await kbtablesCollection.findOne({ tableName: 'Notices' });
    const updatedViewColumn = updatedTable.columns.find(col => col.columnName === 'View');
    
    console.log('New mapping:', updatedViewColumn.articleFieldMapping);
    
    if (updatedViewColumn.articleFieldMapping.includes('htmlContent')) {
      console.log('\n✅ SUCCESS! htmlContent is now in the mapping');
    } else {
      console.log('\n❌ FAILED! htmlContent is still not in the mapping');
    }

    await mongoose.connection.close();
    console.log('\n✅ Disconnected');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

forceFixViewColumn();
