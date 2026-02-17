/**
 * Assign Escalation Matrix Permissions to Super Admin
 * Run: node assign-escalation-permissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function assignEscalationPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const RolePermission = mongoose.model('RolePermission', new mongoose.Schema({}, { strict: false }));

    // Find Super Admin role
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (!superAdminRole) {
      console.error('❌ Super Admin role not found!');
      process.exit(1);
    }
    console.log(`✅ Found Super Admin role: ${superAdminRole.name} (${superAdminRole._id})\n`);

    // Find escalation matrix permissions
    const escalationPermissions = await Permission.find({
      code: { $in: ['ESCALATION_MATRIX_VIEW', 'ESCALATION_MATRIX_MANAGE'] }
    });

    if (escalationPermissions.length === 0) {
      console.error('❌ Escalation matrix permissions not found!');
      console.log('   Run permission sync first: npm run dev (will auto-sync on startup)');
      process.exit(1);
    }

    console.log(`✅ Found ${escalationPermissions.length} escalation matrix permission(s):`);
    escalationPermissions.forEach(p => console.log(`   - ${p.code}: ${p.name}`));
    console.log('');

    // Assign permissions to Super Admin
    let assignedCount = 0;
    let alreadyAssignedCount = 0;

    for (const permission of escalationPermissions) {
      // Check if already assigned
      const existing = await RolePermission.findOne({
        roleId: superAdminRole._id,
        permissionId: permission._id
      });

      if (existing) {
        console.log(`⏭️  ${permission.code} - Already assigned`);
        alreadyAssignedCount++;
      } else {
        await RolePermission.create({
          roleId: superAdminRole._id,
          permissionId: permission._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`✅ ${permission.code} - Assigned to Super Admin`);
        assignedCount++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY:');
    console.log(`   Total Permissions: ${escalationPermissions.length}`);
    console.log(`   Newly Assigned: ${assignedCount}`);
    console.log(`   Already Assigned: ${alreadyAssignedCount}`);
    
    // Get final count
    const finalCount = await RolePermission.countDocuments({ roleId: superAdminRole._id });
    console.log(`   Super Admin Total Permissions: ${finalCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (assignedCount > 0) {
      console.log('✅ SUCCESS! Escalation matrix permissions assigned to Super Admin.');
      console.log('   Users with Super Admin role will now have access to:');
      console.log('   - View escalation matrices');
      console.log('   - Create/Edit/Delete escalation matrices\n');
      console.log('⚠️  NOTE: Users need to log out and log back in for changes to take effect.');
    } else {
      console.log('ℹ️  All permissions were already assigned. No changes made.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

assignEscalationPermissions();
