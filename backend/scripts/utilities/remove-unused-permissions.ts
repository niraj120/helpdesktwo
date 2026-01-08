import mongoose from 'mongoose';
import { Permission } from '../../src/models/Permission';
import { Role } from '../../src/models/Role';
import * as dotenv from 'dotenv';

dotenv.config();

// Unused permission codes to remove
const UNUSED_PERMISSIONS = [
  // Fields & Forms (7 permissions)
  'FIELDS_VIEW_TICKET_FIELDS',
  'FIELDS_MANAGE_TICKET_FIELDS',
  'FIELDS_MANAGE_TICKET_FORMS',
  'FIELDS_MANAGE_ACTIVITY_FIELDS',
  'FIELDS_MANAGE_USER_FIELDS',
  'FIELDS_MANAGE_CONTACT_FIELDS',
  'FIELDS_MANAGE_DEPENDENCIES',
  
  // Ticket Automation (6 permissions)
  'AUTOMATION_VIEW',
  'AUTOMATION_MANAGE_AUTO_ASSIGN',
  'AUTOMATION_MANAGE_CREATE_TRIGGERS',
  'AUTOMATION_MANAGE_UPDATE_TRIGGERS',
  'AUTOMATION_MANAGE_TIME_TRIGGERS',
  'AUTOMATION_TOGGLE',
  
  // Workflow & Role Mapping (5 permissions)
  'WORKFLOW_VIEW',
  'WORKFLOW_CREATE',
  'WORKFLOW_EDIT',
  'WORKFLOW_DELETE',
  'WORKFLOW_MAP_ROLES',
  
  // Form Builder (6 permissions)
  'FORM_VIEW',
  'FORM_CREATE',
  'FORM_EDIT',
  'FORM_DELETE',
  'FORM_ASSIGN_CONTEXT',
  'FORM_VIEW_AUDIT_LOGS',
];

async function removeUnusedPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    console.log(`🗑️  Removing ${UNUSED_PERMISSIONS.length} unused permissions...\n`);

    // Get permission IDs for unused permissions
    const unusedPermissionDocs = await Permission.find({ 
      code: { $in: UNUSED_PERMISSIONS } 
    });
    
    const unusedPermissionIds = unusedPermissionDocs.map(p => p._id);
    
    console.log(`Found ${unusedPermissionDocs.length} permissions to remove:`);
    unusedPermissionDocs.forEach(p => {
      console.log(`  - ${p.code} (${p.module})`);
    });
    console.log('');

    // Remove these permissions from all roles
    console.log('🔄 Removing permissions from roles...');
    const rolesUpdated = await Role.updateMany(
      { permissions: { $in: unusedPermissionIds } },
      { $pull: { permissions: { $in: unusedPermissionIds } } }
    );
    console.log(`✅ Updated ${rolesUpdated.modifiedCount} roles\n`);

    // Delete the permissions from database
    console.log('🗑️  Deleting permissions...');
    const deleteResult = await Permission.deleteMany({ 
      code: { $in: UNUSED_PERMISSIONS } 
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} permissions\n`);

    // Verify total permissions count
    const totalPermissions = await Permission.countDocuments();
    console.log(`📊 Total permissions remaining: ${totalPermissions}`);
    console.log(`   Expected: 104 (128 - 24 removed)`);

    // Show breakdown by category
    console.log('\n📋 Permissions by Category:');
    const categories = await Permission.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    categories.forEach(cat => {
      console.log(`   ${cat._id}: ${cat.count}`);
    });

    console.log('\n✅ Cleanup completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   • Removed categories: fields-forms, ticket-automation, workflow-role-mapping`);
    console.log(`   • Removed ${UNUSED_PERMISSIONS.length} permissions`);
    console.log(`   • Updated ${rolesUpdated.modifiedCount} roles`);
    console.log(`   • Remaining permissions: ${totalPermissions}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

removeUnusedPermissions();
