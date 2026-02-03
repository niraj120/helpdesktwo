const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk';

const permissionSchema = new mongoose.Schema({}, { strict: false, collection: 'permissions' });
const roleSchema = new mongoose.Schema({}, { strict: false, collection: 'roles' });
const rolePermissionSchema = new mongoose.Schema({}, { strict: false, collection: 'rolepermissions' });

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);
const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);

async function assignAllPermissionsToSuperAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get Super Admin role
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (!superAdminRole) {
      console.log('❌ Super Admin role not found');
      process.exit(1);
    }

    console.log('👤 Found Super Admin Role:', superAdminRole.name);
    console.log('   Role ID:', superAdminRole._id);

    // Get ALL permissions
    const allPermissions = await Permission.find({});
    console.log(`\n📋 Total permissions in DB: ${allPermissions.length}`);

    // Get currently assigned permissions
    const currentRolePerms = await RolePermission.find({ roleId: superAdminRole._id });
    console.log(`🔍 Currently assigned: ${currentRolePerms.length}`);

    // Find missing permissions
    const existingPermIds = new Set(currentRolePerms.map(rp => rp.permissionId.toString()));
    const missingPerms = allPermissions.filter(p => !existingPermIds.has(p._id.toString()));

    console.log(`\n⚠️  Missing permissions: ${missingPerms.length}`);

    if (missingPerms.length === 0) {
      console.log('\n✅ Super Admin already has all permissions!');
    } else {
      console.log('\n➕ Assigning ALL missing permissions to Super Admin...');
      console.log('   This may take a moment...\n');

      let assigned = 0;
      for (const perm of missingPerms) {
        await RolePermission.create({
          roleId: superAdminRole._id,
          permissionId: perm._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        assigned++;
        if (assigned % 20 === 0) {
          console.log(`   Assigned ${assigned}/${missingPerms.length}...`);
        }
      }

      console.log(`\n✅ Successfully assigned ${assigned} permissions!`);
    }

    // Verify final count
    const finalCount = await RolePermission.countDocuments({ roleId: superAdminRole._id });
    const totalPerms = await Permission.countDocuments();
    
    console.log('\n📊 Final Status:');
    console.log(`   Super Admin has ${finalCount} permissions`);
    console.log(`   Total permissions in DB: ${totalPerms}`);
    console.log(`   Percentage: ${((finalCount / totalPerms) * 100).toFixed(1)}%`);

    if (finalCount === totalPerms) {
      console.log('\n✅ Perfect! Super Admin has ALL permissions!');
    } else {
      console.log(`\n⚠️  Still missing ${totalPerms - finalCount} permissions`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

assignAllPermissionsToSuperAdmin();
