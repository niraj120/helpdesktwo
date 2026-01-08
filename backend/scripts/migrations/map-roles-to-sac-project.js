/**
 * Migration Script: Map Existing Roles to Student Assist Center Project
 * 
 * This script maps all existing custom roles (except SuperAdmin) to the Student Assist Center project
 * 
 * Usage: node map-roles-to-sac-project.js
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

const projectSchema = new mongoose.Schema({
  name: String,
  branding: {
    headerText: String,
    domainUrl: String
  }
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);
const Project = mongoose.model('Project', projectSchema);

async function mapRolesToSACProject() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Student Assist Center project
    console.log('🔍 Finding Student Assist Center project...');
    const sacProject = await Project.findOne({
      $or: [
        { name: /student.*assist.*center/i },
        { 'branding.headerText': /student.*assist.*center/i },
        { name: /sac/i }
      ]
    });

    if (!sacProject) {
      console.error('❌ Student Assist Center project not found!');
      console.log('Available projects:');
      const allProjects = await Project.find({}, 'name branding.headerText');
      allProjects.forEach(p => {
        console.log(`   - ${p.name || p.branding?.headerText} (${p._id})`);
      });
      process.exit(1);
    }

    console.log(`✅ Found: ${sacProject.name || sacProject.branding?.headerText}`);
    console.log(`   Project ID: ${sacProject._id}\n`);

    // Get all roles except SuperAdmin
    console.log('📊 Fetching all roles...');
    const roles = await Role.find({});
    console.log(`Found ${roles.length} roles\n`);

    let mappedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const role of roles) {
      try {
        console.log(`Processing: ${role.name} (${role.code}) - Type: ${role.type}`);
        
        // Skip SuperAdmin and other system roles
        if (role.type === 'system' || role.code === 'SUPERADMIN' || role.name.toLowerCase().includes('superadmin')) {
          console.log(`  ⏭️  System role (${role.name}), skipping\n`);
          skippedCount++;
          continue;
        }

        // Check if already mapped to SAC project
        if (role.projects && role.projects.some(p => p.toString() === sacProject._id.toString())) {
          console.log(`  ⏭️  Already mapped to SAC project, skipping\n`);
          skippedCount++;
          continue;
        }

        // Map role to SAC project
        console.log(`  📝 Mapping to Student Assist Center project...`);
        
        const existingProjects = role.projects || [];
        const updatedProjects = [...existingProjects];
        
        // Add SAC project if not already in the list
        if (!updatedProjects.some(p => p.toString() === sacProject._id.toString())) {
          updatedProjects.push(sacProject._id);
        }

        await Role.updateOne(
          { _id: role._id },
          { 
            $set: { 
              projects: updatedProjects,
              projectId: sacProject._id // Set as primary project for backward compatibility
            }
          }
        );

        console.log(`  ✅ Mapped successfully`);
        console.log(`     Projects: ${updatedProjects.length} project(s)\n`);
        mappedCount++;

      } catch (error) {
        console.error(`  ❌ Error processing ${role.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Mapping Summary:');
    console.log(`   Total Roles: ${roles.length}`);
    console.log(`   ✅ Mapped to SAC: ${mappedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    if (errorCount === 0) {
      console.log('🎉 Mapping completed successfully!');
      console.log(`\n📋 All custom roles are now mapped to: ${sacProject.name || sacProject.branding?.headerText}`);
    } else {
      console.log('⚠️  Mapping completed with errors. Please review the logs above.');
    }

  } catch (error) {
    console.error('❌ Mapping failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run mapping
mapRolesToSACProject();
