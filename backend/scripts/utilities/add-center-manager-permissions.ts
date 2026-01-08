import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from './src/models/Role';
import { Permission } from './src/models/Permission';

dotenv.config();

const addPermissionsToCenterManager = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');

    // Find Center Manager role
    const centerManagerRole = await Role.findOne({ code: 'CENTER MANAGER' });
    
    if (!centerManagerRole) {
      console.log('❌ Center Manager role not found');
      process.exit(1);
    }

    console.log('=== CENTER MANAGER ROLE ===');
    console.log('Role ID:', centerManagerRole._id);
    console.log('Current Permissions:', centerManagerRole.permissions.length);

    // Define permissions that Center Manager should have
    const requiredPermissions = [
      // Dashboard
      'DASHBOARD_VIEW',
      
      // Tickets - Full access
      'TICKET_VIEW_ALL',
      'TICKET_VIEW_OWN',
      'TICKET_CREATE',
      'TICKET_EDIT',
      'TICKET_DELETE',
      'TICKET_ASSIGN',
      'TICKET_COMMENT',
      'TICKET_VIEW_COMMENTS',
      'TICKET_CHANGE_STATUS',
      'TICKET_CHANGE_PRIORITY',
      'TICKET_BULK_UPDATE',
      'TICKET_EXPORT',
      
      // Knowledge Base - View and Create
      'KB_VIEW',
      'KB_CREATE',
      'KB_EDIT',
      
      // Users - View only
      'USER_VIEW_ALL',
      
      // Projects - View only
      'PROJECT_VIEW_ALL',
      
      // Master Data - View
      'MASTER_DATA_VIEW'
    ];

    console.log('\n=== ADDING PERMISSIONS ===');
    
    // Find all permissions matching the codes
    const permissions = await Permission.find({
      code: { $in: requiredPermissions }
    }).select('_id code name');

    console.log(`Found ${permissions.length} permissions to add\n`);

    // Get current permission IDs
    const currentPermIds = centerManagerRole.permissions.map(id => id.toString());
    
    // Add only new permissions
    let addedCount = 0;
    for (const perm of permissions) {
      if (!currentPermIds.includes(perm._id.toString())) {
        centerManagerRole.permissions.push(perm._id);
        console.log(`✅ Added: ${perm.code} - ${perm.name}`);
        addedCount++;
      } else {
        console.log(`⏭️  Already has: ${perm.code}`);
      }
    }

    if (addedCount > 0) {
      await centerManagerRole.save();
      console.log(`\n✅ Successfully added ${addedCount} new permissions to Center Manager role`);
      console.log(`Total permissions now: ${centerManagerRole.permissions.length}`);
    } else {
      console.log('\n✅ All permissions already assigned');
    }

    // Show which permissions were not found
    const foundCodes = permissions.map(p => p.code);
    const missingCodes = requiredPermissions.filter(code => !foundCodes.includes(code));
    
    if (missingCodes.length > 0) {
      console.log('\n⚠️  Permissions not found in database:');
      missingCodes.forEach(code => console.log(`   - ${code}`));
    }

    await mongoose.connection.close();
    console.log('\n✅ Done! Shubhangi Mathur should now log out and log back in to see the new modules.');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

addPermissionsToCenterManager();
