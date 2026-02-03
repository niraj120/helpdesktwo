require('dotenv').config();
const mongoose = require('mongoose');

const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false }), 'kbtables');

async function fixViewColumn() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const noticesTable = await KBTable.findOne({ tableName: 'Notices' });
    
    if (!noticesTable) {
      console.log('❌ Notices table not found');
      process.exit(1);
    }

    console.log('\n📊 Current "View" column configuration:');
    const viewColumn = noticesTable.columns.find(col => col.columnName === 'View');
    if (!viewColumn) {
      console.log('❌ View column not found');
      process.exit(1);
    }
    
    console.log('   Before:', viewColumn.articleFieldMapping);
    
    // Add htmlContent to the mapping if not already present
    if (!viewColumn.articleFieldMapping.includes('htmlContent')) {
      // Priority order: externalUrl, pdfUrl, htmlContent
      viewColumn.articleFieldMapping = ['externalUrl', 'pdfUrl', 'htmlContent'];
      
      await noticesTable.save();
      
      console.log('   After:', viewColumn.articleFieldMapping);
      console.log('\n✅ Added "htmlContent" to View column mapping');
      console.log('   Now View column will show:');
      console.log('   1. External URL (if exists)');
      console.log('   2. PDF URL (if exists)');
      console.log('   3. HTML content link (if exists)');
    } else {
      console.log('   ℹ️ htmlContent already in mapping');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixViewColumn();
