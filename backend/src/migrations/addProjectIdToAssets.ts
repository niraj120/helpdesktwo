import mongoose from 'mongoose';
import { Asset } from '../models/Asset';
import { Project } from '../models/Project';

/**
 * Migration script to add projectId to existing assets that don't have it
 */
async function addProjectIdToAssets() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find all assets without projectId
    const assetsWithoutProject = await Asset.find({
      $or: [
        { projectId: { $exists: false } },
        { projectId: null }
      ]
    });

    console.log(`📋 Found ${assetsWithoutProject.length} assets without projectId\n`);

    if (assetsWithoutProject.length === 0) {
      console.log('✨ All assets already have projectId. Nothing to migrate.\n');
      return;
    }

    // Get all projects
    const projects = await Project.find({ isActive: true });
    
    if (projects.length === 0) {
      console.error('❌ No active projects found. Please create a project first.');
      return;
    }

    console.log(`📦 Found ${projects.length} active project(s):\n`);
    projects.forEach((p, index) => {
      console.log(`   ${index + 1}. ${p.name || p.projectId} (ID: ${p._id})`);
    });

    // If there's only one project, use it automatically
    let targetProjectId = projects[0]._id;
    
    if (projects.length === 1) {
      console.log(`\n✅ Using the only available project: ${projects[0].name || projects[0].projectId}\n`);
    }

    // Update all assets without projectId
    let updated = 0;
    for (const asset of assetsWithoutProject) {
      await Asset.updateOne(
        { _id: asset._id },
        { $set: { projectId: targetProjectId } }
      );
      console.log(`   ✅ Updated asset: "${asset.name}" (ID: ${asset._id})`);
      updated++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Updated ${updated} assets with projectId`);
    console.log(`📦 All assets now assigned to: ${projects[0].name || projects[0].projectId}`);
    
    console.log('\n✨ Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  require('dotenv').config();
  
  addProjectIdToAssets()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export default addProjectIdToAssets;
