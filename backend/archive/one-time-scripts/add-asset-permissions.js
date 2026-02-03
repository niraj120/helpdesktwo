const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: { type: String },
  module: { type: String, required: true },
  category: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Permission = mongoose.model('Permission', permissionSchema);

const assetPermissions = [
  // Asset Management Permissions
  {
    name: 'View Assets',
    code: 'ASSET_VIEW',
    description: 'View asset list and details',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Create Asset',
    code: 'ASSET_CREATE',
    description: 'Create new assets',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Edit Asset',
    code: 'ASSET_EDIT',
    description: 'Edit existing assets',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Delete Asset',
    code: 'ASSET_DELETE',
    description: 'Delete assets',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Manage Assets',
    code: 'ASSET_MANAGE',
    description: 'Full asset management access',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Map Asset to Center',
    code: 'ASSET_MAP_TO_CENTER',
    description: 'Map assets to centers',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Upload Asset Photos',
    code: 'ASSET_UPLOAD_PHOTOS',
    description: 'Upload photos for assets',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'View Asset Statistics',
    code: 'ASSET_VIEW_STATS',
    description: 'View asset statistics and reports',
    module: 'Asset Management',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'View My Assets',
    code: 'MY_ASSETS_VIEW',
    description: 'View assets assigned to user',
    module: 'My Assets',
    category: 'asset-management',
    isActive: true
  },
  {
    name: 'Update My Assets',
    code: 'MY_ASSETS_UPDATE',
    description: 'Update asset status and details',
    module: 'My Assets',
    category: 'asset-management',
    isActive: true
  },
  // Master Data - Asset Categories
  {
    name: 'Manage Asset Categories',
    code: 'MASTER_DATA_MANAGE_ASSET_CATEGORIES',
    description: 'Manage asset categories in master data',
    module: 'Master Data',
    category: 'master-data',
    isActive: true
  }
];

async function addAssetPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let addedCount = 0;
    let existingCount = 0;
    let updatedCount = 0;

    for (const perm of assetPermissions) {
      const existing = await Permission.findOne({ code: perm.code });
      
      if (existing) {
        // Update if module or category is different
        if (existing.module !== perm.module || existing.category !== perm.category) {
          existing.module = perm.module;
          existing.category = perm.category;
          existing.name = perm.name;
          existing.description = perm.description;
          existing.isActive = perm.isActive;
          existing.updatedAt = new Date();
          await existing.save();
          console.log(`🔄 Updated permission: ${perm.code} (${perm.module})`);
          updatedCount++;
        } else {
          console.log(`⚠️  Permission ${perm.code} already exists`);
          existingCount++;
        }
      } else {
        await Permission.create(perm);
        console.log(`✅ Added permission: ${perm.code} (${perm.module})`);
        addedCount++;
      }
    }

    // Add permissions to Super Admin role
    const Role = mongoose.model('Role', new mongoose.Schema({
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
    }));

    const superAdmin = await Role.findOne({ name: 'Super Admin' });
    if (superAdmin) {
      const permissionDocs = await Permission.find({ 
        code: { $in: assetPermissions.map(p => p.code) } 
      }).select('_id');
      
      let addedToRole = 0;
      for (const permDoc of permissionDocs) {
        if (!superAdmin.permissions.includes(permDoc._id)) {
          superAdmin.permissions.push(permDoc._id);
          addedToRole++;
        }
      }
      
      if (addedToRole > 0) {
        await superAdmin.save();
        console.log(`✅ Added ${addedToRole} permissions to Super Admin role`);
      } else {
        console.log('ℹ️  Super Admin already has all permissions');
      }
    } else {
      console.log('⚠️  Super Admin role not found');
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Added: ${addedCount}`);
    console.log(`   🔄 Updated: ${updatedCount}`);
    console.log(`   ⚠️  Already existed: ${existingCount}`);
    console.log(`   📦 Total asset permissions: ${assetPermissions.length}`);
    console.log(`   📊 Total permissions in database: ${await Permission.countDocuments()}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

addAssetPermissions();
