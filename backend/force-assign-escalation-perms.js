const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function forceAssignEscalationPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');

    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }), 'roles');
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }), 'permissions');
    const RolePermission = mongoose.model('RolePermission', new mongoose.Schema({}, { strict: false }), 'rolepermissions');

    // Find Super Admin role
    const superAdmin = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (!superAdmin) {
      console.log('❌ Super Admin role not found');
      process.exit(1);
    }
    console.log(`✅ Found Super Admin role: ${superAdmin.name} (${superAdmin._id})\n`);

    // Find escalation matrix permissions
    const permissions = await Permission.find({ 
      code: { $in: ['ESCALATION_MATRIX_MANAGE', 'ESCALATION_MATRIX_VIEW'] }
    });

    if (permissions.length === 0) {
      console.log('❌ Escalation Matrix permissions not found in database');
      console.log('   Creating them now...\n');
      
      const newPerms = await Permission.insertMany([
        {
          module: 'Escalation Matrix',
          name: 'View Escalation Matrix',
          code: 'ESCALATION_MATRIX_VIEW',
          description: 'Can view escalation matrix configurations',
          category: 'sla-escalation',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          module: 'Escalation Matrix',
          name: 'Manage Escalation Matrix',
          code: 'ESCALATION_MATRIX_MANAGE',
          description: 'Can create, edit, and delete escalation matrix configurations',
          category: 'sla-escalation',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      
      console.log('✅ Created escalation matrix permissions');
      permissions.push(...newPerms);
    }

    console.log(`✅ Found ${permissions.length} escalation matrix permission(s):\n`);
    
    let assignedCount = 0;
    let alreadyAssignedCount = 0;

    for (const perm of permissions) {
      console.log(`   📋 ${perm.code}: ${perm.name}`);
      
      // Check if already assigned
      const exists = await RolePermission.findOne({
        roleId: superAdmin._id,
        permissionId: perm._id
      });

      if (exists) {
        console.log(`      ⏭️  Already assigned`);
        alreadyAssignedCount++;
      } else {
        await RolePermission.create({
          roleId: superAdmin._id,
          permissionId: perm._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`      ✅ ASSIGNED NOW`);
        assignedCount++;
      }
    }

    // Get total count
    const totalPerms = await RolePermission.countDocuments({ roleId: superAdmin._id });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESULT:');
    console.log(`   Newly Assigned: ${assignedCount}`);
    console.log(`   Already Assigned: ${alreadyAssignedCount}`);
    console.log(`   Super Admin Total Permissions: ${totalPerms}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (assignedCount > 0) {
      console.log('🔴 IMPORTANT: LOG OUT AND LOG BACK IN');
      console.log('   Your current session has cached permissions.');
      console.log('   You MUST log out and log back in to refresh your JWT token.\n');
    } else {
      console.log('ℹ️  Permissions were already assigned.');
      console.log('   If you still see "Access Denied", LOG OUT AND LOG BACK IN.\n');
    }

    console.log('👋 Disconnected from MongoDB');
    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

forceAssignEscalationPermissions();
