require('dotenv').config();
/**
 * Script to show all projects and their SLA rule mappings
 * This helps you see which SLA rules are mapped to which projects
 * 
 * Usage: node scripts/show-sla-project-mappings.js
 */

const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

async function showSLAProjectMappings() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Project = mongoose.connection.collection('projects');
    const SLARule = mongoose.connection.collection('slarules');

    // Get all projects
    const projects = await Project.find({ status: 'active' }).toArray();
    console.log('📁 PROJECTS IN DATABASE:');
    console.log('═'.repeat(80));
    
    for (const project of projects) {
      console.log(`\n🏢 ${project.name} (${project.code})`);
      console.log(`   ID: ${project._id}`);
      
      // Find SLA rules for this project
      const slaRules = await SLARule.find({
        projectIds: project._id
      }).toArray();

      if (slaRules.length > 0) {
        console.log(`   📊 SLA Rules (${slaRules.length}):`);
        slaRules.forEach(sla => {
          console.log(`      ├─ ${sla.name}`);
          console.log(`      │  Priority: ${sla.priority || 'Not set'}`);
          console.log(`      │  Response: ${sla.responseTime.value}${sla.responseTime.unit[0]}`);
          console.log(`      │  Resolution: ${sla.resolutionTime.value}${sla.resolutionTime.unit[0]}`);
          console.log(`      │  Active: ${sla.isActive ? '✅' : '❌'}`);
        });
      } else {
        console.log(`   ⚠️  No SLA rules mapped to this project`);
      }
    }

    // Check for orphaned SLA rules (not mapped to any active project)
    console.log('\n\n🔍 CHECKING FOR ORPHANED SLA RULES...');
    console.log('═'.repeat(80));
    
    const allSLARules = await SLARule.find({}).toArray();
    const activeProjectIds = projects.map(p => p._id.toString());
    
    const orphanedRules = allSLARules.filter(sla => {
      if (!sla.projectIds || sla.projectIds.length === 0) return true;
      return !sla.projectIds.some(pid => activeProjectIds.includes(pid.toString()));
    });

    if (orphanedRules.length > 0) {
      console.log(`\n⚠️  Found ${orphanedRules.length} orphaned SLA rules:`);
      orphanedRules.forEach(sla => {
        console.log(`\n   ❌ ${sla.name}`);
        console.log(`      Priority: ${sla.priority || 'Not set'}`);
        console.log(`      Current Project IDs: ${sla.projectIds?.map(p => p.toString()).join(', ') || 'None'}`);
        console.log(`      These project IDs don't match any active project!`);
      });
    } else {
      console.log('\n✅ All SLA rules are properly mapped to active projects');
    }

    await mongoose.disconnect();
    console.log('\n\n✅ Done! Database connection closed.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
showSLAProjectMappings();
