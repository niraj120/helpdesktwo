const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk';

// Define schemas
const permissionSchema = new mongoose.Schema({}, { strict: false, collection: 'permissions' });
const roleSchema = new mongoose.Schema({}, { strict: false, collection: 'roles' });
const rolePermissionSchema = new mongoose.Schema({}, { strict: false, collection: 'rolepermissions' });

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);
const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);

async function fixSuperAdminKBPermissions() {
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

    // Get new KB permissions
    const newKBPermissionCodes = [
      'KB_MANAGE',
      'KB_MANAGE_LEVELS',
      'KB_MANAGE_ARTICLES',
      'KB_MANAGE_TABLES',
      'KB_VIEW_CONTENT'
    ];

    const newKBPermissions = await Permission.find({
      code: { $in: newKBPermissionCodes }
    });

    console.log('\n📋 Found new KB permissions:', newKBPermissions.length);
    newKBPermissions.forEach(p => {
      console.log(`   - ${p.code} (${p.module})`);
    });

    // Check which are already assigned
    const existingRolePerms = await RolePermission.find({
      roleId: superAdminRole._id,
      permissionId: { $in: newKBPermissions.map(p => p._id) }
    });

    const existingPermIds = new Set(existingRolePerms.map(rp => rp.permissionId.toString()));
    const missingPerms = newKBPermissions.filter(p => !existingPermIds.has(p._id.toString()));

    console.log('\n🔍 Status:');
    console.log(`   Already assigned: ${existingRolePerms.length}`);
    console.log(`   Missing: ${missingPerms.length}`);

    if (missingPerms.length === 0) {
      console.log('\n✅ All new KB permissions are already assigned to Super Admin!');
    } else {
      console.log('\n➕ Assigning missing permissions...');
      for (const perm of missingPerms) {
        await RolePermission.create({
          roleId: superAdminRole._id,
          permissionId: perm._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`   ✓ Assigned: ${perm.code}`);
      }
      console.log('\n✅ Successfully assigned all missing KB permissions!');
    }

    // Verify final count
    const totalRolePerms = await RolePermission.countDocuments({ roleId: superAdminRole._id });
    const totalPerms = await Permission.countDocuments();
    
    console.log('\n📊 Final Status:');
    console.log(`   Super Admin has ${totalRolePerms} permissions`);
    console.log(`   Total permissions in DB: ${totalPerms}`);
    console.log(`   Percentage: ${((totalRolePerms / totalPerms) * 100).toFixed(1)}%`);

    if (totalRolePerms < totalPerms) {
      console.log(`\n⚠️  Missing ${totalPerms - totalRolePerms} permissions`);
      console.log('   Note: This is expected if some permissions are not meant for Super Admin');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

fixSuperAdminKBPermissions();
