/**
 * Performance Optimization: Add Missing Indexes
 * 
 * This script adds critical indexes that were identified during the performance audit.
 * Run this script once in production to add the missing indexes.
 * 
 * Date: 2025-01-31
 * 
 * Usage: node scripts/add-performance-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

async function addPerformanceIndexes() {
  console.log('🚀 Starting Performance Index Creation Script...\n');
  
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');

    // Get existing indexes
    console.log('📊 Current indexes on tickets collection:');
    const existingIndexes = await ticketsCollection.indexes();
    existingIndexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    console.log('');

    // Define new indexes to add
    const indexesToAdd = [
      {
        name: 'metadata_projectId_1',
        key: { 'metadata.projectId': 1 },
        description: 'Single field index on metadata.projectId for project-based queries'
      },
      {
        name: 'metadata_projectId_status_1',
        key: { 'metadata.projectId': 1, 'status': 1 },
        description: 'Compound index for filtering tickets by project and status'
      },
      {
        name: 'metadata_projectId_createdAt_-1',
        key: { 'metadata.projectId': 1, 'createdAt': -1 },
        description: 'Compound index for project tickets sorted by date'
      },
      {
        name: 'metadata_centerId_1',
        key: { 'metadata.centerId': 1 },
        description: 'Single field index on metadata.centerId for center-based queries'
      },
      {
        name: 'assignedTo_status_1',
        key: { 'assignedTo': 1, 'status': 1 },
        description: 'Compound index for agent assigned tickets with status filter'
      },
      {
        name: 'createdBy_createdAt_-1',
        key: { 'createdBy': 1, 'createdAt': -1 },
        description: 'Compound index for user tickets sorted by date (getMyTickets)'
      }
    ];

    // Add each index
    console.log('🔧 Adding new indexes...\n');
    
    for (const indexDef of indexesToAdd) {
      const existingIndex = existingIndexes.find(idx => idx.name === indexDef.name);
      
      if (existingIndex) {
        console.log(`⏭️  Index "${indexDef.name}" already exists, skipping...`);
      } else {
        try {
          console.log(`📝 Creating index: ${indexDef.name}`);
          console.log(`   Description: ${indexDef.description}`);
          console.log(`   Key: ${JSON.stringify(indexDef.key)}`);
          
          await ticketsCollection.createIndex(indexDef.key, { 
            name: indexDef.name,
            background: true // Build in background to avoid blocking writes
          });
          
          console.log(`   ✅ Created successfully\n`);
        } catch (error) {
          console.log(`   ❌ Failed: ${error.message}\n`);
        }
      }
    }

    // Verify new indexes
    console.log('\n📊 Final indexes on tickets collection:');
    const finalIndexes = await ticketsCollection.indexes();
    finalIndexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Get collection stats
    console.log('\n📈 Collection Statistics:');
    const stats = await ticketsCollection.stats();
    console.log(`   Total documents: ${stats.count}`);
    console.log(`   Total index size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Number of indexes: ${stats.nindexes}`);

    console.log('\n✅ Performance index creation completed successfully!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Monitor query performance using db.tickets.explain()');
    console.log('   2. Check for slow queries in MongoDB logs');
    console.log('   3. Run index optimization periodically: db.tickets.reIndex()');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
addPerformanceIndexes();
