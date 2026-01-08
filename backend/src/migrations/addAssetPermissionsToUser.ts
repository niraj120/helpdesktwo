import mongoose from 'mongoose';
import '../models/User';
import '../models/Role';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function addAssetPermissions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User');
    const Role = mongoose.model('Role');

    const userEmail = 'hapanisameer@gmail.com';
    
    // Find user
    const user = await User.findOne({ email: userEmail }).populate('role');
    
    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📧 Found user: ${(user as any).name} (${(user as any).email})`);
    console.log(`👤 Role: ${(user as any).role.roleName}`);

    // Permissions to add
    const permissionsToAdd = [
      'ASSET_VIEW',
      'ASSET_MANAGE',
      'ASSET_MAP_TO_CENTER',
      'ASSET_UPLOAD_PHOTOS',
      'ASSET_VIEW_STATS'
    ];

    const roleId = (user as any).role._id;
    const currentPermissions = (user as any).role.permissions || [];
    
    console.log(`\n🔑 Current permissions: ${currentPermissions.length}`);
    
    // Filter out permissions that already exist
    const newPermissions = permissionsToAdd.filter(p => !currentPermissions.includes(p));
    
    if (newPermissions.length === 0) {
      console.log('✅ User already has all asset permissions');
    } else {
      // Add new permissions
      await Role.updateOne(
        { _id: roleId },
        { $addToSet: { permissions: { $each: newPermissions } } }
      );
      
      console.log('\n✅ Added permissions:');
      newPermissions.forEach(p => console.log(`   - ${p}`));
    }

    const updatedRole = await Role.findById(roleId);
    console.log(`\n📊 Total permissions now: ${(updatedRole as any).permissions.length}`);
    
    console.log('\n✅ Permission update complete!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

addAssetPermissions();
