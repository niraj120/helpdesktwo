const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Define Permission schema
    const permissionSchema = new mongoose.Schema({
      code: String,
      name: String,
      category: String,
      description: String
    });
    
    const Permission = mongoose.model('Permission', permissionSchema);
    
    // Check for new master data permissions
    const newPermissions = [
      'MASTER_DATA_MANAGE',
      'MASTER_DATA_CREATE',
      'MASTER_DATA_EDIT',
      'MASTER_DATA_DELETE',
      'MASTER_DATA_MANAGE_COUNTRIES',
      'MASTER_DATA_MANAGE_STATES',
      'MASTER_DATA_MANAGE_CITIES'
    ];
    
    console.log('\n🔍 Checking for new master data permissions...\n');
    
    const perms = await Permission.find({ 
      code: { $in: newPermissions } 
    }).select('code name description');
    
    console.log(`Found ${perms.length} of ${newPermissions.length} new permissions:\n`);
    
    if (perms.length > 0) {
      perms.forEach(p => {
        console.log(`✅ ${p.code}`);
        console.log(`   Name: ${p.name}`);
        console.log(`   Desc: ${p.description}\n`);
      });
    }
    
    // Check which ones are missing
    const foundCodes = perms.map(p => p.code);
    const missing = newPermissions.filter(code => !foundCodes.includes(code));
    
    if (missing.length > 0) {
      console.log(`\n❌ Missing permissions (${missing.length}):`);
      missing.forEach(code => console.log(`   - ${code}`));
      console.log('\n💡 The permissions were added to seedRolesPermissions.ts but have not been seeded to the database yet.');
      console.log('   The server needs to restart or the seed function needs to run to create these permissions.');
    } else {
      console.log('✅ All new permissions are present in the database!');
    }
    
    // Check Super Admin role
    const roleSchema = new mongoose.Schema({
      code: String,
      name: String,
      permissions: [String]
    });
    
    const Role = mongoose.model('Role', roleSchema);
    const superAdmin = await Role.findOne({ code: 'SUPER_ADMIN' }).select('code name permissions');
    
    if (superAdmin) {
      console.log('\n\n🔐 Super Admin Role:');
      console.log(`   Name: ${superAdmin.name}`);
      console.log(`   Total Permissions: ${superAdmin.permissions.length}`);
      
      // Check if Super Admin has the new permissions
      const hasNewPerms = newPermissions.filter(code => superAdmin.permissions.includes(code));
      console.log(`   Has ${hasNewPerms.length} of ${newPermissions.length} new permissions`);
      
      if (hasNewPerms.length === newPermissions.length) {
        console.log('   ✅ Super Admin has all new master data permissions!');
      } else {
        console.log('   ⚠️  Super Admin is missing some new permissions');
      }
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
