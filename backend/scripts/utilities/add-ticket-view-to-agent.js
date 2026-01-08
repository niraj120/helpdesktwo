const mongoose = require('mongoose');
const Role = require('./dist/models/Role').default;
const Permission = require('./dist/models/Permission').default;

async function addTicketViewToAgent() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('Connected to MongoDB');

    // Find the AGENT role
    const agentRole = await Role.findOne({ name: 'AGENT' }).populate('permissions');
    if (!agentRole) {
      console.error('❌ AGENT role not found');
      process.exit(1);
    }

    console.log('\n📋 Current AGENT permissions:');
    agentRole.permissions.forEach(p => console.log(`  - ${p.name}`));

    // Find TICKET_VIEW_ALL permission
    const ticketViewPerm = await Permission.findOne({ name: 'TICKET_VIEW_ALL' });
    if (!ticketViewPerm) {
      console.error('❌ TICKET_VIEW_ALL permission not found');
      process.exit(1);
    }

    // Check if already has permission
    const hasPermission = agentRole.permissions.some(p => p.name === 'TICKET_VIEW_ALL');
    if (hasPermission) {
      console.log('\n✅ AGENT role already has TICKET_VIEW_ALL permission');
    } else {
      // Add permission
      agentRole.permissions.push(ticketViewPerm._id);
      await agentRole.save();
      console.log('\n✅ Added TICKET_VIEW_ALL permission to AGENT role');
    }

    // Reload and display updated permissions
    const updatedRole = await Role.findOne({ name: 'AGENT' }).populate('permissions');
    console.log('\n📋 Updated AGENT permissions (' + updatedRole.permissions.length + ' total):');
    updatedRole.permissions.forEach(p => console.log(`  - ${p.name}`));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addTicketViewToAgent();
