const mongoose = require('mongoose');

mongoose.connect('mongodb://34.14.157.13:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');

    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false, collection: 'permissions' }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false, collection: 'roles' }));
    const RolePermission = mongoose.model('RolePermission', new mongoose.Schema({}, { strict: false, collection: 'rolepermissions' }));

    // Get Super Admin role
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (!superAdminRole) {
      console.log('❌ Super Admin role not found');
      process.exit(1);
    }

    console.log('👤 Found Super Admin Role:', superAdminRole.name, '(ID:', superAdminRole._id + ')');

    // Get all new KB permissions
    const newKBPermissions = await Permission.find({
      code: {
        $in: ['KB_MANAGE', 'KB_MANAGE_LEVELS', 'KB_MANAGE_ARTICLES', 'KB_MANAGE_TABLES', 'KB_VIEW_CONTENT']
      }
    });

    console.log('\n📋 New KB Permissions found:', newKBPermissions.length);
    newKBPermissions.forEach(p => {
      console.log(`  ✓ ${p.code} (ID: ${p._id})`);
    });

    // Check which permissions are already assigned
    const existingRolePerms = await RolePermission.find({
      roleId: superAdminRole._id,
      permissionId: { $in: newKBPermissions.map(p => p._id) }
    });

    console.log('\n🔍 Already assigned:', existingRolePerms.length);

    // Find missing permissions
    const existingPermIds = new Set(existingRolePerms.map(rp => rp.permissionId.toString()));
    const missingPerms = newKBPermissions.filter(p => !existingPermIds.has(p._id.toString()));

    if (missingPerms.length === 0) {
      console.log('\n✅ All new KB permissions are already assigned to Super Admin');
    } else {
      console.log('\n➕ Assigning missing permissions:', missingPerms.length);
      
      for (const perm of missingPerms) {
        await RolePermission.create({
          roleId: superAdminRole._id,
          permissionId: perm._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`  ✓ Assigned ${perm.code}`);
      }

      console.log('\n✅ Successfully assigned all new KB permissions to Super Admin');
    }

    // Verify final count
    const totalRolePerms = await RolePermission.countDocuments({ roleId: superAdminRole._id });
    const totalPerms = await Permission.countDocuments();
    
    console.log('\n📊 Final Status:');
    console.log(`  - Super Admin has ${totalRolePerms} permissions`);
    console.log(`  - Total permissions in DB: ${totalPerms}`);
    console.log(`  - Missing: ${totalPerms - totalRolePerms}`);

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
