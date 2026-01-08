const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/sac_helpdesk';

async function fixAdminPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const rolesCollection = db.collection('roles');
    const permissionsCollection = db.collection('permissions');

    // Step 1: Find the admin user
    console.log('\n🔍 Looking for admin@helpdesk.gov.in...');
    const adminUser = await usersCollection.findOne({ email: 'admin@helpdesk.gov.in' });
    
    if (!adminUser) {
      console.log('❌ Admin user not found!');
      return;
    }
    
    console.log('✅ Found admin user:', {
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role
    });

    // Step 2: Find Super Admin role
    console.log('\n🔍 Looking for Super Admin role...');
    const superAdminRole = await rolesCollection.findOne({ code: 'SUPER_ADMIN' });
    
    if (!superAdminRole) {
      console.log('❌ Super Admin role not found!');
      return;
    }
    
    console.log('✅ Found Super Admin role:', {
      _id: superAdminRole._id,
      name: superAdminRole.name,
      code: superAdminRole.code,
      permissionsCount: superAdminRole.permissions?.length || 0
    });

    // Step 3: Check if role needs permission update
    const totalPermissions = await permissionsCollection.countDocuments();
    console.log(`\n📊 Total permissions in database: ${totalPermissions}`);
    console.log(`📊 Super Admin has: ${superAdminRole.permissions?.length || 0} permissions`);
    
    if ((superAdminRole.permissions?.length || 0) < totalPermissions) {
      console.log('\n🔧 Updating Super Admin role with all permissions...');
      const allPermissions = await permissionsCollection.find({}).toArray();
      const allPermissionIds = allPermissions.map(p => p._id);
      
      await rolesCollection.updateOne(
        { code: 'SUPER_ADMIN' },
        { $set: { permissions: allPermissionIds } }
      );
      console.log(`   ✅ Super Admin now has ${allPermissionIds.length} permissions`);
    }

    // Step 4: Update admin user's role
    console.log('\n🔧 Updating admin user role assignment...');
    await usersCollection.updateOne(
      { email: 'admin@helpdesk.gov.in' },
      { $set: { role: superAdminRole._id } }
    );
    console.log('   ✅ Admin user role updated');

    // Step 5: Verify the update
    console.log('\n✅ Verification:');
    const updatedUser = await usersCollection.findOne({ email: 'admin@helpdesk.gov.in' });
    const updatedRole = await rolesCollection.findOne({ _id: updatedUser.role });
    
    console.log('   User:', {
      email: updatedUser.email,
      roleId: updatedUser.role
    });
    console.log('   Role:', {
      name: updatedRole?.name,
      code: updatedRole?.code,
      permissions: updatedRole?.permissions?.length || 0
    });

    console.log('\n✅ Admin permissions fixed successfully!');
    console.log('\n💡 Please logout and login again to see the changes.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Connection closed');
  }
}

fixAdminPermissions();
