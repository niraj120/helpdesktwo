const mongoose = require('mongoose');
const { Permission } = require('./dist/models/Permission');
const { Role } = require('./dist/models/Role');

// Reassignment permissions to add
const reassignmentPermissions = [
  {
    module: 'Ticket Management',
    name: 'Reassign Ticket',
    code: 'TICKET_REASSIGN',
    description: 'Can reassign tickets back through the escalation chain',
    category: 'ticket-management',
  },
  {
    module: 'Ticket Management',
    name: 'Sequential Reassignment',
    code: 'TICKET_REASSIGN_SEQUENTIAL',
    description: 'Can reassign tickets only to the immediately previous handler',
    category: 'ticket-management',
  },
  {
    module: 'Ticket Management',
    name: 'Flexible Reassignment',
    code: 'TICKET_REASSIGN_FLEXIBLE',
    description: 'Can reassign tickets to any previous handler in the chain',
    category: 'ticket-management',
  },
  {
    module: 'Ticket Management',
    name: 'Configure Reassignment',
    code: 'TICKET_REASSIGNMENT_CONFIG',
    description: 'Can configure reassignment settings for projects',
    category: 'ticket-management',
  },
  {
    module: 'Ticket Management',
    name: 'View Reassignment History',
    code: 'TICKET_REASSIGNMENT_VIEW',
    description: 'Can view reassignment history and audit trail',
    category: 'ticket-management',
  },
];

// Permission codes to grant to different roles
const agentPermissionCodes = [
  'TICKET_REASSIGN',
  'TICKET_REASSIGN_SEQUENTIAL', // Agents get sequential by default (safer)
  'TICKET_REASSIGNMENT_VIEW',
];

const teamLeadPermissionCodes = [
  'TICKET_REASSIGN',
  'TICKET_REASSIGN_SEQUENTIAL',
  'TICKET_REASSIGN_FLEXIBLE', // Team leads get both modes
  'TICKET_REASSIGNMENT_VIEW',
];

const adminPermissionCodes = [
  'TICKET_REASSIGN',
  'TICKET_REASSIGN_SEQUENTIAL',
  'TICKET_REASSIGN_FLEXIBLE',
  'TICKET_REASSIGNMENT_CONFIG', // Only admins can configure
  'TICKET_REASSIGNMENT_VIEW',
];

async function seedReassignmentPermissions() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk');

    console.log('✅ Connected to MongoDB');

    // Step 1: Add new permissions
    console.log('\n📝 Adding reassignment permissions...');
    for (const permission of reassignmentPermissions) {
      const existing = await Permission.findOne({ code: permission.code });
      if (existing) {
        console.log(`⏭️  Permission ${permission.code} already exists, skipping...`);
      } else {
        await Permission.create(permission);
        console.log(`✅ Created permission: ${permission.code}`);
      }
    }

    // Step 2: Grant permissions to Agent role
    console.log('\n👤 Granting permissions to Agent role...');
    const agentRole = await Role.findOne({ name: 'Agent' });
    if (agentRole) {
      const agentPermissions = await Permission.find({ code: { $in: agentPermissionCodes } });
      const agentPermissionIds = agentPermissions.map(p => p._id);
      
      // Add new permissions without duplicating existing ones
      const existingIds = agentRole.permissions.map(p => p.toString());
      const newIds = agentPermissionIds.filter(id => !existingIds.includes(id.toString()));
      
      if (newIds.length > 0) {
        agentRole.permissions.push(...newIds);
        await agentRole.save();
        console.log(`✅ Added ${newIds.length} permissions to Agent role`);
      } else {
        console.log('⏭️  Agent role already has these permissions');
      }
    } else {
      console.log('⚠️  Agent role not found');
    }

    // Step 3: Grant permissions to Team Lead role
    console.log('\n👥 Granting permissions to Team Lead role...');
    const teamLeadRole = await Role.findOne({ name: 'Team Lead' });
    if (teamLeadRole) {
      const teamLeadPermissions = await Permission.find({ code: { $in: teamLeadPermissionCodes } });
      const teamLeadPermissionIds = teamLeadPermissions.map(p => p._id);
      
      const existingIds = teamLeadRole.permissions.map(p => p.toString());
      const newIds = teamLeadPermissionIds.filter(id => !existingIds.includes(id.toString()));
      
      if (newIds.length > 0) {
        teamLeadRole.permissions.push(...newIds);
        await teamLeadRole.save();
        console.log(`✅ Added ${newIds.length} permissions to Team Lead role`);
      } else {
        console.log('⏭️  Team Lead role already has these permissions');
      }
    } else {
      console.log('⚠️  Team Lead role not found');
    }

    // Step 4: Grant permissions to Admin role
    console.log('\n🔧 Granting permissions to Admin role...');
    const adminRole = await Role.findOne({ name: 'Admin' });
    if (adminRole) {
      const adminPermissions = await Permission.find({ code: { $in: adminPermissionCodes } });
      const adminPermissionIds = adminPermissions.map(p => p._id);
      
      const existingIds = adminRole.permissions.map(p => p.toString());
      const newIds = adminPermissionIds.filter(id => !existingIds.includes(id.toString()));
      
      if (newIds.length > 0) {
        adminRole.permissions.push(...newIds);
        await adminRole.save();
        console.log(`✅ Added ${newIds.length} permissions to Admin role`);
      } else {
        console.log('⏭️  Admin role already has these permissions');
      }
    } else {
      console.log('⚠️  Admin role not found');
    }

    console.log('\n✨ Reassignment permissions seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Permissions added: ${reassignmentPermissions.length}`);
    console.log(`   - Agent: ${agentPermissionCodes.length} permissions`);
    console.log(`   - Team Lead: ${teamLeadPermissionCodes.length} permissions`);
    console.log(`   - Admin: ${adminPermissionCodes.length} permissions`);

  } catch (error) {
    console.error('❌ Error seeding reassignment permissions:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seeding
seedReassignmentPermissions();
