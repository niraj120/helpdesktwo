/**
 * Migration Script: Update Role Model for Multiple Project Mapping
 * 
 * This script migrates existing roles from single projectId to projects array
 * Run this script once after deploying the new Role model
 * 
 * Usage: node migrate-roles-projects.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  description: String,
  type: { type: String, enum: ['system', 'custom'], default: 'custom' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  agentCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);

async function migrateRoles() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('📊 Fetching all roles...');
    const roles = await Role.find({});
    console.log(`Found ${roles.length} roles\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const role of roles) {
      try {
        console.log(`Processing: ${role.name} (${role.code})`);
        
        // Skip if already migrated
        if (role.projects && role.projects.length > 0) {
          console.log(`  ⏭️  Already has projects array, skipping\n`);
          skippedCount++;
          continue;
        }

        // System roles should not have project mapping
        if (role.type === 'system') {
          console.log(`  🔧 System role - ensuring no project mapping`);
          await Role.updateOne(
            { _id: role._id },
            { 
              $unset: { projectId: 1, projects: 1 }
            }
          );
          console.log(`  ✅ System role cleaned\n`);
          migratedCount++;
          continue;
        }

        // Migrate projectId to projects array
        if (role.projectId) {
          console.log(`  📝 Migrating projectId to projects array`);
          await Role.updateOne(
            { _id: role._id },
            { 
              $set: { 
                projects: [role.projectId]
              }
            }
          );
          console.log(`  ✅ Migrated successfully\n`);
          migratedCount++;
        } else {
          console.log(`  ⚠️  No projectId found, setting empty projects array`);
          await Role.updateOne(
            { _id: role._id },
            { 
              $set: { projects: [] }
            }
          );
          migratedCount++;
        }

      } catch (error) {
        console.error(`  ❌ Error processing ${role.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📈 Migration Summary:');
    console.log(`   Total Roles: ${roles.length}`);
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(50) + '\n');

    if (errorCount === 0) {
      console.log('🎉 Migration completed successfully!');
    } else {
      console.log('⚠️  Migration completed with errors. Please review the logs above.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration
migrateRoles();
