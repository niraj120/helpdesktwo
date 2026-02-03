const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function fixAssetCategory() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Permission = mongoose.model('Permission', new mongoose.Schema({
      name: String,
      code: String,
      module: String,
      category: String,
      isActive: Boolean
    }));

    // Update any permissions with old category format
    const updateResult = await Permission.updateMany(
      { category: 'Asset Management' },
      { $set: { category: 'asset-management' } }
    );
    
    console.log(`🔄 Updated ${updateResult.modifiedCount} permissions to use 'asset-management' category`);

    // Show all asset-related permissions
    const assetPerms = await Permission.find({ 
      $or: [
        { code: { $regex: '^ASSET' } },
        { code: { $regex: '^MY_ASSETS' } }
      ]
    }).select('code module category isActive').sort('code');
    
    console.log('\n📋 All Asset-related permissions:');
    assetPerms.forEach(p => {
      console.log(`   ${p.code.padEnd(30)} | ${p.module.padEnd(20)} | ${p.category} | Active: ${p.isActive}`);
    });
    
    console.log(`\n✅ Total: ${assetPerms.length} asset permissions`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixAssetCategory();
