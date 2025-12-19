import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import '../models/User';
import '../models/Role';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

interface IUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  role: {
    _id: mongoose.Types.ObjectId;
    roleName: string;
    permissions: string[];
  };
}

async function assignAssetPermission() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the user
    const User = mongoose.model('User');
    const userEmail = 'hapanisameer@gmail.com';
    
    const user = await User.findOne({ email: userEmail }).populate('role') as IUser | null;
    
    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }

    console.log(`📧 Found user: ${user.name} (${user.email})`);
    console.log(`👤 Current role: ${user.role.roleName}`);
    console.log(`🔑 Current permissions count: ${user.role.permissions.length}\n`);

    // Check if user already has the permission
    const permissionsToAdd = [
      'ASSET_MANAGE',
      'ASSET_MAP_TO_CENTER',
      'ASSET_UPLOAD_PHOTOS',
      'ASSET_VIEW_STATS'
    ];

    const Role = mongoose.model('Role');
    const existingPermissions = user.role.permissions || [];
    const newPermissions = permissionsToAdd.filter(p => !existingPermissions.includes(p));

    if (newPermissions.length === 0) {
      console.log('✅ User already has all asset management permissions');
    } else {
      // Add permissions to the user's role
      const updatedPermissions = [...existingPermissions, ...newPermissions];
      
      await Role.updateOne(
        { _id: user.role._id },
        { $set: { permissions: updatedPermissions } }
      );

      console.log('✅ Added permissions:');
      newPermissions.forEach(p => console.log(`   - ${p}`));
      console.log(`\n📊 Total permissions now: ${updatedPermissions.length}`);
    }

    console.log('\n✅ Permission assignment complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

assignAssetPermission();
