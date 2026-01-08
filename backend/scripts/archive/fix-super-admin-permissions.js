const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const permissionSchema = new mongoose.Schema({
      code: String,
      name: String,
      category: String
    });
    
    const roleSchema = new mongoose.Schema({
      code: String,
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
    });
    
    const Permission = mongoose.model('Permission', permissionSchema);
    const Role = mongoose.model('Role', roleSchema);
    
    console.log('🔍 Checking Super Admin role...\n');
    
    const superAdmin = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (!superAdmin) {
      console.log('❌ Super Admin role not found');
      process.exit(1);
    }
    
    console.log(`📋 Current state:`);
    console.log(`   Permissions: ${superAdmin.permissions}`);
    console.log(`   Permissions count: ${superAdmin.permissions ? superAdmin.permissions.length : 0}`);
    
    if (!superAdmin.permissions || superAdmin.permissions.length === 0) {
      console.log('\n❌ PROBLEM: Super Admin has NO permissions!');
      console.log('🔧 Adding all permissions...\n');
      
      // Get all permission documents
      const allPermissions = await Permission.find();
      console.log(`📊 Found ${allPermissions.length} permissions in database`);
      
      // Extract just the ObjectIds
      const permissionIds = allPermissions.map(p => p._id);
      
      // Update Super Admin with ObjectIds
      superAdmin.permissions = permissionIds;
      await superAdmin.save();
      
      console.log(`\n✅ FIXED: Super Admin now has ${permissionIds.length} permission ObjectIds`);
      
      // Verify the fix
      const updated = await Role.findOne({ code: 'SUPER_ADMIN' }).populate('permissions');
      console.log(`\n🔍 Verification:`);
      console.log(`   Permissions count: ${updated.permissions.length}`);
      if (updated.permissions.length > 0) {
        console.log(`   First permission: ${updated.permissions[0].code}`);
      }
      
      console.log('\n✨ Done!');
      process.exit(0);
    }
    
    console.log(`   First permission: ${superAdmin.permissions[0]}`);
    console.log(`   Type: ${typeof superAdmin.permissions[0]}`);
    
    // Check if permissions are strings (wrong) or ObjectIds (correct)
    const firstPerm = superAdmin.permissions[0];
    const isString = typeof firstPerm === 'string' && firstPerm.length < 24;
    
    if (isString) {
      console.log('\n❌ PROBLEM DETECTED: Permissions are stored as CODES (strings) instead of ObjectIds!');
      console.log('🔧 Fixing permissions...\n');
      
      // Get all permission documents
      const allPermissions = await Permission.find();
      console.log(`📊 Found ${allPermissions.length} permissions in database`);
      
      // Extract just the ObjectIds
      const permissionIds = allPermissions.map(p => p._id);
      
      // Update Super Admin with ObjectIds
      superAdmin.permissions = permissionIds;
      await superAdmin.save();
      
      console.log(`\n✅ FIXED: Super Admin now has ${permissionIds.length} permission ObjectIds`);
      
      // Verify the fix
      const updated = await Role.findOne({ code: 'SUPER_ADMIN' });
      console.log(`\n🔍 Verification:`);
      console.log(`   Permissions count: ${updated.permissions.length}`);
      console.log(`   First permission: ${updated.permissions[0]}`);
      console.log(`   Type: ${typeof updated.permissions[0]}`);
      console.log(`   Is ObjectId: ${updated.permissions[0] instanceof mongoose.Types.ObjectId}`);
      
    } else {
      console.log('\n✅ Permissions are correctly stored as ObjectIds');
      console.log(`   Total: ${superAdmin.permissions.length}`);
    }
    
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
