const mongoose = require('mongoose');
require('dotenv').config();

const KBTableSchema = new mongoose.Schema({}, { strict: false, collection: 'kbtables' });
const KBTable = mongoose.model('KBTable', KBTableSchema);

async function fixViewColumnPriority() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const noticesTable = await KBTable.findOne({ tableName: 'Notices' });
    
    if (!noticesTable) {
      console.log('❌ Notices table not found');
      process.exit(1);
    }

    console.log('\n📊 Current "View" column mapping:');
    const viewColumn = noticesTable.columns.find(col => col.columnName === 'View');
    if (viewColumn) {
      console.log('   Before:', viewColumn.articleFieldMapping);
      
      // Swap priority: pdfUrl first, then externalUrl
      // This ensures newly uploaded GCS PDFs take precedence over old external links
      viewColumn.articleFieldMapping = ['pdfUrl', 'externalUrl'];
      
      await noticesTable.save();
      
      console.log('   After:', viewColumn.articleFieldMapping);
      console.log('\n✅ Updated "View" column to prioritize pdfUrl (GCS uploads) over externalUrl');
      console.log('   Now when you upload a PDF, the GCS link will be used instead of old external links');
    } else {
      console.log('❌ "View" column not found');
    }

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixViewColumnPriority();
