import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from './src/models/Role';
import { Permission } from './src/models/Permission';

dotenv.config();

const grantAllPermissionsToSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find Super Admin role
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });

    if (!superAdminRole) {
      console.log('❌ Super Admin role not found!');
      process.exit(1);
    }

    console.log('\n📋 Current Super Admin Permissions:', superAdminRole.permissions?.length || 0);

    // Get all permissions from database
    const allPermissions = await Permission.find();
    console.log('📊 Total Permissions in Database:', allPermissions.length);

    // Get permission IDs
    const allPermissionIds = allPermissions.map(p => p._id);

    // Find missing permissions
    const currentPermIds = (superAdminRole.permissions || []).map((p: any) => p.toString());
    const missingPermissions = allPermissions.filter(p => 
      !currentPermIds.includes(p._id.toString())
    );

    if (missingPermissions.length === 0) {
      console.log('\n✅ Super Admin already has all permissions!');
    } else {
      console.log(`\n⚠️  Super Admin is missing ${missingPermissions.length} permissions:`);
      missingPermissions.forEach(p => {
        console.log(`  - ${p.code}: ${p.name} (${p.module})`);
      });

      // Update Super Admin role to have ALL permissions
      superAdminRole.permissions = allPermissionIds as any;
      await superAdminRole.save();

      console.log(`\n✅ Updated Super Admin role with ALL ${allPermissions.length} permissions!`);
    }

    // Verify the update
    const updatedRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    console.log('\n✅ Verification:');
    console.log('  Super Admin now has:', updatedRole?.permissions?.length || 0, 'permissions');
    console.log('  Database has:', allPermissions.length, 'total permissions');
    
    if (updatedRole?.permissions?.length === allPermissions.length) {
      console.log('  ✅ SUCCESS: Super Admin has ALL permissions!');
    } else {
      console.log('  ❌ WARNING: Mismatch in permission count');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

grantAllPermissionsToSuperAdmin();
