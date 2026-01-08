/**
 * Migration Script: Add Asset Management Permissions
 * Run this once to add the new asset management permissions to existing database
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Define schemas
const permissionSchema = new mongoose.Schema({
  module: { type: String, required: true },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: String,
  category: String,
}, { timestamps: true });

const roleSchema = new mongoose.Schema({
  module: String,
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: String,
  type: { type: String, enum: ['system', 'custom'], default: 'custom' },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);

// New Asset Management Permissions
const assetManagementPermissions = [
  {
    module: 'Asset Management',
    name: 'View Assets',
    code: 'ASSET_VIEW',
    description: 'Can view master asset list and details',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'Create Asset',
    code: 'ASSET_CREATE',
    description: 'Can create new assets in master list',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'Edit Asset',
    code: 'ASSET_EDIT',
    description: 'Can edit existing assets in master list',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'Delete Asset',
    code: 'ASSET_DELETE',
    description: 'Can delete assets from master list',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'Manage Center Assets',
    code: 'ASSET_MANAGE',
    description: 'Can manage asset mappings and update counts for centers',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'Map Assets to Centers',
    code: 'ASSET_MAP_TO_CENTER',
    description: 'Can map assets to centers in bulk',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'Upload Asset Photos',
    code: 'ASSET_UPLOAD_PHOTOS',
    description: 'Can upload and manage photos for center assets',
    category: 'asset-management',
  },
  {
    module: 'Asset Management',
    name: 'View Asset Statistics',
    code: 'ASSET_VIEW_STATS',
    description: 'Can view asset statistics and summary reports',
    category: 'asset-management',
  },
];

async function addAssetManagementPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB');

    console.log('🔍 Checking for existing Asset Management permissions...');
    const existingCount = await Permission.countDocuments({ 
      code: { $in: assetManagementPermissions.map(p => p.code) } 
    });

    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing Asset Management permissions. Deleting them first...`);
      await Permission.deleteMany({ 
        code: { $in: assetManagementPermissions.map(p => p.code) } 
      });
    }

    console.log('📝 Inserting Asset Management permissions...');
    const insertedPermissions = await Permission.insertMany(assetManagementPermissions);
    console.log(`✅ Inserted ${insertedPermissions.length} Asset Management permissions`);

    // Add these permissions to Super Admin role
    console.log('🔐 Adding permissions to Super Admin role...');
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (superAdminRole) {
      const permissionIds = insertedPermissions.map(p => p._id);
      
      // Add new permissions to Super Admin (avoid duplicates)
      const updatedPermissions = [
        ...new Set([...superAdminRole.permissions, ...permissionIds])
      ];
      
      superAdminRole.permissions = updatedPermissions as any;
      await superAdminRole.save();
      
      console.log('✅ Added Asset Management permissions to Super Admin role');
    } else {
      console.log('⚠️  Super Admin role not found');
    }

    console.log('✨ Migration completed successfully!');
    console.log('📊 Summary:');
    console.log(`   - Total permissions in DB: ${await Permission.countDocuments()}`);
    console.log(`   - Asset Management permissions: ${insertedPermissions.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
addAssetManagementPermissions();
