/**
 * Update Notices table to use article data source
 * This makes it dynamically pull from articles instead of storing static snapshots
 * Run: node update-notices-datasource.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function updateNoticesTable() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false }));

    // Find the Notices table
    const result = await KBTable.updateOne(
      { tableName: 'Notices' },
      { 
        $set: { 
          dataSource: 'articles',
          displayStyle: 'tiles',
          autoPopulateFromArticles: true
        }
      }
    );

    if (result.matchedCount > 0) {
      console.log('✅ Updated Notices table:');
      console.log('   - dataSource: articles (will fetch live data from KB articles)');
      console.log('   - displayStyle: tiles');
      console.log('   - autoPopulateFromArticles: true');
      console.log('\n📝 Now the table will dynamically show PDF URLs from articles!');
    } else {
      console.log('❌ Notices table not found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

updateNoticesTable();
