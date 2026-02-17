/**
 * One-time migration script to assign escalation matrix to existing tickets
 * Run with: node migrate-escalation-matrix.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function migrateEscalationMatrix() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');
    const escalationMatrixCollection = db.collection('escalationmatrixes'); // Correct collection name

    // Get all active escalation matrices
    const matrices = await escalationMatrixCollection.find({ isActive: true }).toArray();
    console.log(`📊 Found ${matrices.length} active escalation matrices`);

    for (const matrix of matrices) {
      console.log(`\n📋 Processing matrix: ${matrix.name}`);
      console.log(`   Projects: ${matrix.projectIds?.length || 0}`);
      
      if (!matrix.projectIds || matrix.projectIds.length === 0) {
        console.log('   ⚠️ No projects assigned to this matrix, skipping');
        continue;
      }

      // Get the first level of the matrix
      const sortedLevels = (matrix.levels || [])
        .filter(l => l.isActive)
        .sort((a, b) => a.levelNumber - b.levelNumber);

      if (sortedLevels.length === 0) {
        console.log('   ⚠️ No active levels in this matrix, skipping');
        continue;
      }

      const startLevel = sortedLevels[0];
      console.log(`   Starting level: ${startLevel.levelNumber} - ${startLevel.levelName}`);

      // Find tickets for these projects that don't have escalation matrix assigned
      for (const projectId of matrix.projectIds) {
        const query = {
          'metadata.projectId': projectId.toString(),
          escalationMatrixId: { $exists: false },
          status: { $in: [1, 2, 3] } // Only open, in-progress, on-hold tickets
        };

        const ticketsToUpdate = await ticketsCollection.countDocuments(query);
        console.log(`   Project ${projectId}: ${ticketsToUpdate} tickets without escalation matrix`);

        if (ticketsToUpdate > 0) {
          const result = await ticketsCollection.updateMany(query, {
            $set: {
              escalationMatrixId: matrix._id,
              currentEscalationLevelId: startLevel._id,
              currentEscalationLevelNumber: startLevel.levelNumber,
            }
          });

          console.log(`   ✅ Updated ${result.modifiedCount} tickets`);
        }
      }
    }

    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

migrateEscalationMatrix();
