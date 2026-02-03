const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

const newPermissions = [
  {
    module: 'My Assets',
    name: 'View My Assets',
    code: 'MY_ASSETS_VIEW',
    description: 'Can view assets assigned to the user',
    category: 'offline-module',
    isActive: true
  },
  {
    module: 'Predefined Reports',
    name: 'View Query Report',
    code: 'REPORT_VIEW_QUERY',
    description: 'Can view query/ticket list reports',
    category: 'reports',
    isActive: true
  },
  {
    module: 'Predefined Reports',
    name: 'View Asset Report',
    code: 'REPORT_VIEW_ASSET',
    description: 'Can view asset reports',
    category: 'reports',
    isActive: true
  },
  {
    module: 'Predefined Reports',
    name: 'View Employee Report',
    code: 'REPORT_VIEW_EMPLOYEE',
    description: 'Can view employee reports',
    category: 'reports',
    isActive: true
  }
];

async function addPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));

    // First, fix MY_ASSETS_VIEW if it exists without code
    const existingMyAssets = await Permission.findOne({ name: 'View My Assets' });
    if (existingMyAssets && !existingMyAssets.code) {
      await Permission.deleteOne({ _id: existingMyAssets._id });
      console.log('🗑️  Removed incomplete MY_ASSETS_VIEW permission');
    }

    // Add each permission
    const addedIds = [];
    for (const perm of newPermissions) {
      const existing = await Permission.findOne({ code: perm.code });
      if (existing) {
        console.log(`⚠️  Permission ${perm.code} already exists`);
        addedIds.push(existing._id);
      } else {
        const created = await Permission.create(perm);
        console.log(`✅ Added permission: ${perm.code}`);
        addedIds.push(created._id);
      }
    }

    // Add permissions to Super Admin role
    const superAdmin = await Role.findOne({ name: 'Super Admin' });
    if (superAdmin) {
      let added = 0;
      for (const permId of addedIds) {
        if (!superAdmin.permissions.some(p => p.toString() === permId.toString())) {
          superAdmin.permissions.push(permId);
          added++;
        }
      }
      
      if (added > 0) {
        await superAdmin.save();
        console.log(`✅ Added ${added} permissions to Super Admin role`);
      } else {
        console.log('ℹ️  All permissions already in Super Admin role');
      }
    }

    console.log('\n📊 Final permission count:', await Permission.countDocuments());
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    console.log('\n🔄 Please restart your backend server to refresh permissions');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addPermissions();
