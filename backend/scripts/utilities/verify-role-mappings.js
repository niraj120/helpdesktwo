/**
 * Verification Script: Check Role-Project Mappings
 * 
 * This script verifies that roles are correctly mapped to projects
 * 
 * Usage: node verify-role-mappings.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  type: { type: String, enum: ['system', 'custom'], default: 'custom' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
}, { timestamps: true });

const projectSchema = new mongoose.Schema({
  name: String,
  branding: { headerText: String }
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);
const Project = mongoose.model('Project', projectSchema);

async function verifyMappings() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const roles = await Role.find({}).populate('projects', 'name branding.headerText');
    
    console.log('📋 Role-Project Mappings:\n');
    console.log('='.repeat(80));
    
    for (const role of roles) {
      console.log(`\n🏷️  ${role.name} (${role.code})`);
      console.log(`   Type: ${role.type}`);
      
      if (role.type === 'system') {
        console.log(`   ✅ System role - No project mapping (available to all projects)`);
      } else {
        if (role.projects && role.projects.length > 0) {
          console.log(`   📂 Mapped to ${role.projects.length} project(s):`);
          role.projects.forEach((project, index) => {
            console.log(`      ${index + 1}. ${project.name || project.branding?.headerText} (${project._id})`);
          });
        } else {
          console.log(`   ⚠️  WARNING: Not mapped to any project!`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Verification complete!\n');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

verifyMappings();
