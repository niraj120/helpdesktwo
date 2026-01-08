const mongoose = require('mongoose');
const { Permission } = require('./dist/models/Permission');
const { Role } = require('./dist/models/Role');

async function verifyOfflinePermissions() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all offline module permissions
    const offlinePerms = await Permission.find({ category: 'offline-module' }).sort({ code: 1 });
    console.log('📋 Offline Module Permissions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    offlinePerms.forEach(perm => {
      console.log(`   ${perm.code.padEnd(30)} - ${perm.name}`);
      console.log(`   ${' '.repeat(30)}   ${perm.description}`);
    });
    console.log(`\n   Total: ${offlinePerms.length} permissions\n`);

    // Get Agent role with permissions
    const agentRole = await Role.findOne({ code: 'AGENT' }).populate('permissions');
    if (agentRole) {
      console.log('👤 Agent Role Permissions:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Group by category
      const permsByCategory = {};
      agentRole.permissions.forEach(perm => {
        if (!permsByCategory[perm.category]) {
          permsByCategory[perm.category] = [];
        }
        permsByCategory[perm.category].push(perm);
      });

      Object.keys(permsByCategory).sort().forEach(category => {
        console.log(`\n   📁 ${category.toUpperCase()}`);
        permsByCategory[category].forEach(perm => {
          console.log(`      ✓ ${perm.code.padEnd(30)} - ${perm.name}`);
        });
      });

      console.log(`\n   Total Agent Permissions: ${agentRole.permissions.length}\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verifyOfflinePermissions();
