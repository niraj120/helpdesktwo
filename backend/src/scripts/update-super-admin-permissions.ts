import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from '../models/Role';
import { Permission } from '../models/Permission';

dotenv.config();

const updateSuperAdminPermissions = async () => {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');

    // Get all permissions
    const allPermissions = await Permission.find({});
    console.log(`📊 Found ${allPermissions.length} permissions`);

    // Update Super Admin role with ALL permissions
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (!superAdminRole) {
      console.error('❌ Super Admin role not found!');
      process.exit(1);
    }

    console.log(`🔍 Found Super Admin role with ${superAdminRole.permissions.length} permissions`);
    
    // Update with all permission IDs
    superAdminRole.permissions = allPermissions.map(p => p._id);
    await superAdminRole.save();

    console.log(`✅ Updated Super Admin role with ${allPermissions.length} permissions`);
    console.log('✅ Super Admin now has access to all features including Asset Categories');

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

updateSuperAdminPermissions();
