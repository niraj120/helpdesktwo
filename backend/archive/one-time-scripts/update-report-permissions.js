/**
 * Update roles with missing report permissions
 * Adds REPORT_VIEW_QUERY, REPORT_VIEW_ASSET, and REPORT_VIEW_EMPLOYEE to specific roles
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk';

async function updateReportPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Permission = mongoose.model('Permission', new mongoose.Schema({
      code: String,
      name: String,
      description: String,
    }));

    const Role = mongoose.model('Role', new mongoose.Schema({
      code: String,
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    }));

    // Find the report permissions
    const reportPermissions = await Permission.find({
      code: { $in: ['REPORT_VIEW_QUERY', 'REPORT_VIEW_ASSET', 'REPORT_VIEW_EMPLOYEE'] }
    });

    console.log(`\n📋 Found ${reportPermissions.length} report permissions:`);
    reportPermissions.forEach(p => {
      console.log(`   - ${p.code}: ${p.name}`);
    });

    const reportPermissionIds = reportPermissions.map(p => p._id);

    // Find roles that need these permissions
    const rolesToUpdate = ['SUBADMIN', 'COUNSELOR_L1', 'CENTER_MANAGER', 'CET_STATE_CELL', 'AGENT', 'LEVEL2', 'TECHNICAL_SUPPORT'];
    
    console.log(`\n🔄 Updating roles: ${rolesToUpdate.join(', ')}`);

    for (const roleCode of rolesToUpdate) {
      const role = await Role.findOne({ code: roleCode });
      
      if (!role) {
        console.log(`   ⚠️  Role ${roleCode} not found`);
        continue;
      }

      // Check which permissions are already added
      const existingPermissionIds = role.permissions.map(p => p.toString());
      const permissionsToAdd = reportPermissionIds.filter(
        id => !existingPermissionIds.includes(id.toString())
      );

      if (permissionsToAdd.length === 0) {
        console.log(`   ✓ ${roleCode} already has all report permissions`);
        continue;
      }

      // Add missing permissions
      role.permissions.push(...permissionsToAdd);
      await role.save();

      const addedPermissions = reportPermissions
        .filter(p => permissionsToAdd.includes(p._id))
        .map(p => p.code);
      
      console.log(`   ✅ ${roleCode} updated - added: ${addedPermissions.join(', ')}`);
    }

    console.log('\n✨ Report permissions update completed successfully!');

  } catch (error) {
    console.error('❌ Error updating report permissions:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the update
updateReportPermissions().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Failed:', error.message);
  process.exit(1);
});
