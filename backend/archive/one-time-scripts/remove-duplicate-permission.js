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

async function removeDuplicatePermission() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Remove MY_ASSETS_UPDATE as it's never used and duplicates ASSET_MANAGE functionality
    const result = await Permission.deleteOne({ code: 'MY_ASSETS_UPDATE' });
    
    if (result.deletedCount > 0) {
      console.log('🗑️  Removed duplicate permission: MY_ASSETS_UPDATE');
      console.log('✅ This functionality is already covered by ASSET_MANAGE permission');
    } else {
      console.log('⚠️  Permission MY_ASSETS_UPDATE not found (may already be removed)');
    }

    // Also remove it from all roles that have it
    const Role = mongoose.model('Role', new mongoose.Schema({
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
    }));

    const permission = await Permission.findOne({ code: 'MY_ASSETS_UPDATE' });
    if (permission) {
      const rolesUpdated = await Role.updateMany(
        { permissions: permission._id },
        { $pull: { permissions: permission._id } }
      );
      console.log(`🔄 Removed from ${rolesUpdated.modifiedCount} role(s)`);
    }

    console.log('\n📋 Summary:');
    console.log('   ASSET_VIEW → View master asset list (admin/manager)');
    console.log('   ASSET_CREATE → Create new assets in master list');
    console.log('   ASSET_EDIT → Edit assets in master list');
    console.log('   ASSET_DELETE → Delete assets from master list');
    console.log('   ASSET_MANAGE → Full management: map to centers, update counts, photos, stats');
    console.log('   MY_ASSETS_VIEW → View assets assigned to user\'s center (read-only)');
    console.log('   ❌ MY_ASSETS_UPDATE → REMOVED (duplicate of ASSET_MANAGE)');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

removeDuplicatePermission();
