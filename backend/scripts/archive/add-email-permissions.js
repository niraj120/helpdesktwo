const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/sac_helpdesk';

const emailPermissions = [
  {
    module: 'Email Configuration',
    name: 'View Email Configuration',
    code: 'EMAIL_CONFIG_VIEW',
    description: 'Can view email configuration settings',
    category: 'integrations',
  },
  {
    module: 'Email Configuration',
    name: 'Edit Email Configuration',
    code: 'EMAIL_CONFIG_EDIT',
    description: 'Can edit email SMTP settings and configurations',
    category: 'integrations',
  },
  {
    module: 'Email Configuration',
    name: 'Test Email Configuration',
    code: 'EMAIL_CONFIG_TEST',
    description: 'Can send test emails to verify configuration',
    category: 'integrations',
  },
  {
    module: 'Email Configuration',
    name: 'Manage Email Triggers',
    code: 'EMAIL_TRIGGER_MANAGE',
    description: 'Can manage email triggers and templates',
    category: 'integrations',
  },
];

async function addEmailPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const permissionsCollection = db.collection('permissions');
    const rolesCollection = db.collection('roles');

    // Step 1: Add new permissions
    console.log('\n📝 Adding email configuration permissions...');
    for (const permission of emailPermissions) {
      const exists = await permissionsCollection.findOne({ code: permission.code });
      if (!exists) {
        await permissionsCollection.insertOne(permission);
        console.log(`   ✅ Added permission: ${permission.code}`);
      } else {
        console.log(`   ⏭️  Permission already exists: ${permission.code}`);
      }
    }

    // Step 2: Get permission IDs
    const permissionCodes = emailPermissions.map(p => p.code);
    const permissionDocs = await permissionsCollection.find({
      code: { $in: permissionCodes }
    }).toArray();
    const permissionIds = permissionDocs.map(p => p._id);

    console.log(`\n📋 Found ${permissionIds.length} email permission IDs`);

    // Step 3: Update Super Admin role (should have all permissions)
    console.log('\n🔧 Updating Super Admin role...');
    const superAdminRole = await rolesCollection.findOne({ code: 'SUPER_ADMIN' });
    if (superAdminRole) {
      const allPermissions = await permissionsCollection.find({}).toArray();
      const allPermissionIds = allPermissions.map(p => p._id);
      
      await rolesCollection.updateOne(
        { code: 'SUPER_ADMIN' },
        { $set: { permissions: allPermissionIds } }
      );
      console.log('   ✅ Super Admin updated with all permissions');
    }

    // Step 4: Update Account Owner role
    console.log('\n🔧 Updating Account Owner role...');
    const accountOwnerRole = await rolesCollection.findOne({ code: 'ACCOUNT_OWNER' });
    if (accountOwnerRole) {
      const currentPermissions = accountOwnerRole.permissions || [];
      const newPermissions = [...new Set([...currentPermissions, ...permissionIds])];
      
      await rolesCollection.updateOne(
        { code: 'ACCOUNT_OWNER' },
        { $set: { permissions: newPermissions } }
      );
      console.log('   ✅ Account Owner updated with email permissions');
    }

    // Step 5: Update Support Administrator role
    console.log('\n🔧 Updating Support Administrator role...');
    const supportAdminRole = await rolesCollection.findOne({ code: 'SUPPORT_ADMIN' });
    if (supportAdminRole) {
      const currentPermissions = supportAdminRole.permissions || [];
      const newPermissions = [...new Set([...currentPermissions, ...permissionIds])];
      
      await rolesCollection.updateOne(
        { code: 'SUPPORT_ADMIN' },
        { $set: { permissions: newPermissions } }
      );
      console.log('   ✅ Support Administrator updated with email permissions');
    }

    console.log('\n✅ Email permissions successfully added to roles!');
    console.log('\n📊 Summary:');
    console.log(`   - ${emailPermissions.length} email permissions added`);
    console.log('   - Super Admin: All permissions');
    console.log('   - Account Owner: Email permissions added');
    console.log('   - Support Administrator: Email permissions added');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Connection closed');
  }
}

addEmailPermissions();
