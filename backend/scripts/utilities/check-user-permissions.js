const mongoose = require('mongoose');
const { User } = require('./dist/models/User');
const { Role } = require('./dist/models/Role');
const { Permission } = require('./dist/models/Permission');

async function checkUserPermissions() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Priya Sharma
    const user = await User.findOne({ 
      $or: [
        { email: { $regex: 'priya', $options: 'i' } },
        { firstName: { $regex: 'priya', $options: 'i' } }
      ]
    }).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 User Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role.name} (${user.role.code})`);
    console.log(`   Total Permissions: ${user.role.permissions.length}\n`);

    // Check for offline module permissions
    const offlinePerms = user.role.permissions.filter(p => p.category === 'offline-module');
    
    console.log('📋 Offline Module Permissions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (offlinePerms.length === 0) {
      console.log('   ❌ NO OFFLINE MODULE PERMISSIONS FOUND');
      console.log('\n   This user does NOT have access to the offline module.');
    } else {
      offlinePerms.forEach(perm => {
        console.log(`   ✓ ${perm.code.padEnd(30)} - ${perm.name}`);
      });
      console.log(`\n   ✅ User has ${offlinePerms.length} offline module permissions`);
    }

    // Show all permissions by category
    console.log('\n📁 All Permissions by Category:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const permsByCategory = {};
    user.role.permissions.forEach(perm => {
      if (!permsByCategory[perm.category]) {
        permsByCategory[perm.category] = [];
      }
      permsByCategory[perm.category].push(perm.code);
    });

    Object.keys(permsByCategory).sort().forEach(category => {
      console.log(`\n   ${category.toUpperCase()}: ${permsByCategory[category].length} permissions`);
      permsByCategory[category].forEach(code => {
        console.log(`      - ${code}`);
      });
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkUserPermissions();
