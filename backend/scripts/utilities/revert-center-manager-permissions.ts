import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from './src/models/Role';
import { Permission } from './src/models/Permission';

dotenv.config();

const revertCenterManagerPermissions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');

    // Find Center Manager role
    const centerManagerRole = await Role.findOne({ code: 'CENTER MANAGER' });
    
    if (!centerManagerRole) {
      console.log('❌ Center Manager role not found');
      process.exit(1);
    }

    console.log('=== REVERTING CENTER MANAGER PERMISSIONS ===');
    console.log('Current Permissions:', centerManagerRole.permissions.length);

    // Only the 7 permissions that were originally assigned
    const originalPermissions = [
      'DASHBOARD_VIEW',
      'DASHBOARD_VIEW_ANALYTICS',
      'DASHBOARD_EXPORT',
      'TICKET_VIEW_ALL',
      'TICKET_ASSIGN',
      'TICKET_MERGE',
      'TICKET_EXPORT'
    ];

    console.log('\n=== REMOVING UNAUTHORIZED PERMISSIONS ===');
    
    // Find the original permissions
    const permissions = await Permission.find({
      code: { $in: originalPermissions }
    }).select('_id code');

    const originalPermIds = permissions.map(p => p._id.toString());

    // Remove all permissions that weren't in the original list
    const removed: string[] = [];
    const currentPermIds = centerManagerRole.permissions.map(id => id.toString());
    
    for (const permId of currentPermIds) {
      if (!originalPermIds.includes(permId)) {
        const perm = await Permission.findById(permId).select('code name');
        if (perm) {
          removed.push(`${perm.code} - ${perm.name}`);
        }
      }
    }

    // Set back to original permissions only
    centerManagerRole.permissions = permissions.map(p => p._id);
    await centerManagerRole.save();

    console.log(`✅ Removed ${removed.length} unauthorized permissions:`);
    removed.forEach(p => console.log(`   - ${p}`));
    
    console.log(`\n✅ Reverted to original ${centerManagerRole.permissions.length} permissions:`);
    permissions.forEach((perm, i) => {
      console.log(`   ${i + 1}. ${perm.code}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done! Center Manager now has only the permissions you originally assigned.');
    console.log('⚠️  This means only Dashboard and partial Tickets access will be visible.');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

revertCenterManagerPermissions();
