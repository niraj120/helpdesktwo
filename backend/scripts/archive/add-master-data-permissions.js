const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    // Define schemas
    const permissionSchema = new mongoose.Schema({
      code: String,
      name: String,
      description: String,
      category: String,
      module: String
    });
    
    const roleSchema = new mongoose.Schema({
      code: String,
      name: String,
      permissions: [String]
    });
    
    const Permission = mongoose.model('Permission', permissionSchema);
    const Role = mongoose.model('Role', roleSchema);
    
    // New permissions to add
    const newPermissions = [
      {
        code: 'MASTER_DATA_MANAGE',
        name: 'Full Master Data Access',
        description: 'Full access to create, edit, and delete all master data',
        category: 'master-data',
        module: 'Master Data Management'
      },
      {
        code: 'MASTER_DATA_CREATE',
        name: 'Create Master Data',
        description: 'Can create new master data entries',
        category: 'master-data',
        module: 'Master Data Management'
      },
      {
        code: 'MASTER_DATA_EDIT',
        name: 'Edit Master Data',
        description: 'Can edit existing master data entries',
        category: 'master-data',
        module: 'Master Data Management'
      },
      {
        code: 'MASTER_DATA_DELETE',
        name: 'Delete Master Data',
        description: 'Can delete master data entries',
        category: 'master-data',
        module: 'Master Data Management'
      },
      {
        code: 'MASTER_DATA_MANAGE_COUNTRIES',
        name: 'Manage Countries',
        description: 'Can create and manage countries',
        category: 'master-data',
        module: 'Master Data Management'
      },
      {
        code: 'MASTER_DATA_MANAGE_STATES',
        name: 'Manage States',
        description: 'Can create and manage states',
        category: 'master-data',
        module: 'Master Data Management'
      },
      {
        code: 'MASTER_DATA_MANAGE_CITIES',
        name: 'Manage Cities',
        description: 'Can create and manage cities',
        category: 'master-data',
        module: 'Master Data Management'
      }
    ];
    
    console.log('🔄 Adding new master data permissions...\n');
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const permData of newPermissions) {
      const exists = await Permission.findOne({ code: permData.code });
      
      if (!exists) {
        await Permission.create(permData);
        console.log(`✅ Added: ${permData.code}`);
        addedCount++;
      } else {
        console.log(`⏭️  Skipped (exists): ${permData.code}`);
        skippedCount++;
      }
    }
    
    console.log(`\n📊 Summary: Added ${addedCount}, Skipped ${skippedCount}\n`);
    
    // Update Super Admin role to include new permissions
    console.log('🔐 Updating Super Admin role...\n');
    
    const superAdmin = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (superAdmin) {
      const permissionCodes = await Permission.find().distinct('code');
      const oldCount = superAdmin.permissions.length;
      
      superAdmin.permissions = permissionCodes;
      await superAdmin.save();
      
      const newCount = superAdmin.permissions.length;
      
      console.log(`✅ Super Admin updated:`);
      console.log(`   Before: ${oldCount} permissions`);
      console.log(`   After: ${newCount} permissions`);
      console.log(`   Added: ${newCount - oldCount} new permissions\n`);
      
      // Verify new permissions are included
      const hasNewPerms = newPermissions.filter(p => superAdmin.permissions.includes(p.code));
      console.log(`✅ Super Admin now has ${hasNewPerms.length}/${newPermissions.length} new master data permissions`);
    } else {
      console.log('❌ Super Admin role not found');
    }
    
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
