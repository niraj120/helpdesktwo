const mongoose = require('mongoose');
const { Permission } = require('./dist/models/Permission');
const { Role } = require('./dist/models/Role');

// Offline module permissions to add
const offlineModulePermissions = [
  {
    module: 'Offline Module',
    name: 'Access Offline Module',
    code: 'OFFLINE_MODULE_ACCESS',
    description: 'Can access offline module for walk-in student support',
    category: 'offline-module',
  },
  {
    module: 'Offline Module',
    name: 'Register Student',
    code: 'OFFLINE_STUDENT_REGISTER',
    description: 'Can register students on their behalf when they walk in',
    category: 'offline-module',
  },
  {
    module: 'Offline Module',
    name: 'Create Offline Ticket',
    code: 'OFFLINE_TICKET_CREATE',
    description: 'Can create tickets on behalf of students during walk-in',
    category: 'offline-module',
  },
  {
    module: 'Offline Module',
    name: 'Mark Ticket Resolved',
    code: 'OFFLINE_TICKET_RESOLVE',
    description: 'Can mark offline tickets as resolved immediately',
    category: 'offline-module',
  },
  {
    module: 'Offline Module',
    name: 'Escalate at Creation',
    code: 'OFFLINE_TICKET_ESCALATE',
    description: 'Can escalate offline tickets during creation',
    category: 'offline-module',
  },
  {
    module: 'Offline Module',
    name: 'View Student Records',
    code: 'OFFLINE_STUDENT_VIEW',
    description: 'Can view registered student information',
    category: 'offline-module',
  },
  {
    module: 'Offline Module',
    name: 'Edit Student Records',
    code: 'OFFLINE_STUDENT_EDIT',
    description: 'Can edit student information registered through offline module',
    category: 'offline-module',
  },
];

// Permission codes to grant to Agent role
const agentPermissionCodes = [
  'OFFLINE_MODULE_ACCESS',
  'OFFLINE_STUDENT_REGISTER',
  'OFFLINE_TICKET_CREATE',
  'OFFLINE_TICKET_RESOLVE',
  'OFFLINE_TICKET_ESCALATE',
  'OFFLINE_STUDENT_VIEW',
  'OFFLINE_STUDENT_EDIT',
];

async function seedOfflinePermissions() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if offline permissions already exist
    const existingOfflinePerms = await Permission.find({ category: 'offline-module' });
    if (existingOfflinePerms.length > 0) {
      console.log(`ℹ️  Found ${existingOfflinePerms.length} existing offline module permissions`);
      console.log('   Skipping permission creation...');
    } else {
      // Insert offline module permissions
      console.log('🌱 Seeding offline module permissions...');
      const insertedPermissions = await Permission.insertMany(offlineModulePermissions);
      console.log(`✅ Inserted ${insertedPermissions.length} offline module permissions`);
    }

    // Get all offline permission IDs
    const allOfflinePerms = await Permission.find({ category: 'offline-module' });
    const offlinePermIds = allOfflinePerms.map(p => p._id);

    // Find Agent role
    const agentRole = await Role.findOne({ code: 'AGENT' });
    if (!agentRole) {
      console.log('❌ Agent role not found. Please run the main seed script first.');
      return;
    }

    console.log(`📋 Found Agent role: ${agentRole.name}`);
    console.log(`   Current permissions: ${agentRole.permissions.length}`);

    // Get permission IDs for the codes we want to add
    const permissionsToAdd = await Permission.find({ 
      code: { $in: agentPermissionCodes } 
    });
    const permIdsToAdd = permissionsToAdd.map(p => p._id);

    // Filter out permissions that already exist
    const existingPermIds = agentRole.permissions.map(id => id.toString());
    const newPermIds = permIdsToAdd.filter(id => !existingPermIds.includes(id.toString()));

    if (newPermIds.length === 0) {
      console.log('✅ Agent role already has all offline module permissions');
    } else {
      // Add new permissions to Agent role
      agentRole.permissions.push(...newPermIds);
      await agentRole.save();
      console.log(`✅ Added ${newPermIds.length} offline module permissions to Agent role`);
      console.log(`   Total permissions now: ${agentRole.permissions.length}`);
    }

    // Also add to Super Admin (should have all permissions)
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (superAdminRole) {
      const superAdminExistingPerms = superAdminRole.permissions.map(id => id.toString());
      const superAdminNewPerms = offlinePermIds.filter(id => !superAdminExistingPerms.includes(id.toString()));
      
      if (superAdminNewPerms.length > 0) {
        superAdminRole.permissions.push(...superAdminNewPerms);
        await superAdminRole.save();
        console.log(`✅ Added ${superAdminNewPerms.length} offline module permissions to Super Admin role`);
      } else {
        console.log('✅ Super Admin already has all offline module permissions');
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total offline module permissions: ${allOfflinePerms.length}`);
    console.log(`   Permissions granted to Agent role: ${agentPermissionCodes.length}`);
    console.log('\n✅ Offline module permissions seeded successfully!');

  } catch (error) {
    console.error('❌ Error seeding offline permissions:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

seedOfflinePermissions();
