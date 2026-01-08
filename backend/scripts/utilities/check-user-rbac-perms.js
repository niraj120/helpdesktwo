const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Define schemas inline
const userSchema = new mongoose.Schema({
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }
}, { collection: 'users' });

const roleSchema = new mongoose.Schema({
  name: String,
  type: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { collection: 'roles' });

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String
}, { collection: 'permissions' });

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function checkUserRBACPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');

    // Find admin user
    const user = await User.findOne({ email: 'admin@helpdesk.gov.in' }).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('\n📋 User Details:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role?.name || 'No role'}`);
    console.log(`   Role Type: ${user.role?.type || 'N/A'}`);

    // Check RBAC permissions
    const rbacPermissionCodes = [
      'RBAC_VIEW_ROLES',
      'RBAC_CREATE_ROLE',
      'RBAC_EDIT_ROLE',
      'RBAC_DELETE_ROLE',
      'RBAC_ASSIGN_PERMISSIONS',
      'RBAC_VIEW_PERMISSIONS'
    ];

    console.log('\n🔍 Checking RBAC Permissions:');
    
    const userPermissions = user.role?.permissions || [];
    const userPermissionCodes = userPermissions.map(p => p.code);

    for (const code of rbacPermissionCodes) {
      const hasPermission = userPermissionCodes.includes(code);
      console.log(`   ${hasPermission ? '✅' : '❌'} ${code}`);
    }

    console.log(`\n📊 Total Permissions: ${userPermissions.length}`);

    // If missing RBAC permissions, check if they exist in database
    const missingPerms = rbacPermissionCodes.filter(code => !userPermissionCodes.includes(code));
    
    if (missingPerms.length > 0) {
      console.log('\n⚠️  Missing RBAC Permissions in User Role!');
      console.log('   Checking if permissions exist in database...\n');

      for (const code of missingPerms) {
        const perm = await Permission.findOne({ code });
        if (perm) {
          console.log(`   ✅ ${code} exists in DB (ID: ${perm._id})`);
        } else {
          console.log(`   ❌ ${code} NOT found in DB`);
        }
      }

      // Add missing permissions to role
      console.log('\n🔧 Adding missing RBAC permissions to user role...');
      const missingPermIds = await Permission.find({ 
        code: { $in: missingPerms } 
      }).distinct('_id');

      if (missingPermIds.length > 0) {
        const currentPermIds = user.role.permissions.map(p => p._id);
        const updatedPermIds = [...currentPermIds, ...missingPermIds];

        await Role.findByIdAndUpdate(user.role._id, {
          permissions: updatedPermIds
        });

        console.log(`   ✅ Added ${missingPermIds.length} RBAC permissions to ${user.role.name} role`);
        console.log('\n⚠️  IMPORTANT: User must LOG OUT and LOG IN again to get updated JWT token!');
      }
    } else {
      console.log('\n✅ User role has all RBAC permissions!');
      console.log('\n⚠️  If still getting 403 error:');
      console.log('   1. Clear browser cache/localStorage');
      console.log('   2. LOG OUT completely');
      console.log('   3. LOG IN again to get fresh JWT token');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUserRBACPermissions();
