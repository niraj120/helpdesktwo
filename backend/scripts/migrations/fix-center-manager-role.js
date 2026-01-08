require('dotenv').config();
const mongoose = require('mongoose');

const fixCenterManagerRole = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Find the Center Manager role
    const centerManagerRole = await db.collection('roles').findOne({
      _id: new mongoose.Types.ObjectId('691eaaff97b5ad11bf7f98b8')
    });

    if (!centerManagerRole) {
      console.log('❌ Center Manager role not found!');
      process.exit(1);
    }

    console.log('📋 CURRENT ROLE STATE:');
    console.log('Name:', centerManagerRole.name);
    console.log('Code:', centerManagerRole.code);
    console.log('Description:', centerManagerRole.description);
    console.log('Permissions:', centerManagerRole.permissions);
    console.log('Permission IDs:', centerManagerRole.permissionIds);
    console.log('\n');

    // Get all user management permissions
    const userPermissions = await db.collection('permissions').find({
      code: { 
        $in: [
          'USER_VIEW_ALL',
          'USER_CREATE',
          'USER_EDIT',
          'USER_DELETE',
          'USER_TOGGLE_STATUS',
          'USER_ASSIGN_ROLE',
          'USER_RESET_PASSWORD',
          'USER_IMPORT'
        ]
      }
    }).toArray();

    console.log('🔍 USER MANAGEMENT PERMISSIONS FOUND:');
    userPermissions.forEach(p => {
      console.log(`   ${p.code} - ${p._id}`);
    });
    console.log('\n');

    // Update the role with permissions
    const permissionIds = userPermissions.map(p => p._id);
    
    console.log('🔧 UPDATING CENTER MANAGER ROLE...');
    const result = await db.collection('roles').updateOne(
      { _id: centerManagerRole._id },
      { 
        $set: { 
          permissions: permissionIds,
          permissionIds: permissionIds  // Try both field names
        } 
      }
    );

    console.log('Update result:', result.modifiedCount, 'document(s) modified');
    console.log('\n');

    // Verify the update
    const updatedRole = await db.collection('roles').findOne({
      _id: centerManagerRole._id
    });

    console.log('✅ UPDATED ROLE STATE:');
    console.log('Permissions count:', updatedRole.permissions?.length || 0);
    console.log('PermissionIds count:', updatedRole.permissionIds?.length || 0);
    console.log('\n');

    if ((updatedRole.permissions?.length || 0) > 0) {
      console.log('🎉 SUCCESS! Center Manager role now has user management permissions.');
    } else {
      console.log('⚠️  Update may not have worked. Check the role schema.');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixCenterManagerRole();
