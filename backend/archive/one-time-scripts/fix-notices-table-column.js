/**
 * Fix Notices table - Update row data column name from "Download" to "View"
 * Run: node fix-notices-table-column.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function fixNoticesTable() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false }));

    // Find the Notices table
    const table = await KBTable.findOne({ tableName: 'Notices' });
    
    if (!table) {
      console.log('❌ Notices table not found');
      return;
    }

    console.log(`📊 Found table: ${table.tableName}`);
    console.log(`   Rows: ${table.rows.length}`);
    console.log(`   Columns: ${table.columns.map(c => c.columnName).join(', ')}`);

    // Check if "View" column exists
    const viewColumn = table.columns.find(col => col.columnName === 'View');
    if (!viewColumn) {
      console.log('❌ "View" column not found in table schema');
      return;
    }

    // Update all rows: rename "Download" key to "View"
    let updatedCount = 0;
    table.rows = table.rows.map(row => {
      if (row.rowData && row.rowData.Download && !row.rowData.View) {
        console.log(`   📝 Updating row: "${row.rowData.Download}"`);
        row.rowData.View = row.rowData.Download;
        delete row.rowData.Download;
        updatedCount++;
      }
      return row;
    });

    if (updatedCount > 0) {
      // Set displayStyle to 'tiles' if not set
      if (!table.displayStyle) {
        table.displayStyle = 'tiles';
        console.log('   📊 Setting displayStyle to "tiles"');
      }

      await table.save();
      console.log(`✅ Updated ${updatedCount} rows`);
      console.log('✅ Notices table fixed successfully!');
    } else {
      console.log('ℹ️  No rows needed updating');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

fixNoticesTable();
