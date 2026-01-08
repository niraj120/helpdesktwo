const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk');

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String
}, { collection: 'permissions' });

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { collection: 'roles' });

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);

async function addDashboardPermissionToAgent() {
  try {
    console.log('🔍 Adding DASHBOARD_VIEW permission to Agent role...\n');
    
    // Find Agent role
    const agentRole = await Role.findOne({ name: 'Agent' });
    if (!agentRole) {
      console.log('❌ Agent role not found');
      return;
    }

    // Find DASHBOARD_VIEW permission
    const dashboardPermission = await Permission.findOne({ code: 'DASHBOARD_VIEW' });
    if (!dashboardPermission) {
      console.log('❌ DASHBOARD_VIEW permission not found');
      return;
    }

    // Check if permission already exists
    const hasPermission = agentRole.permissions.includes(dashboardPermission._id);
    if (hasPermission) {
      console.log('✅ Agent already has DASHBOARD_VIEW permission');
      return;
    }

    // Add permission to agent role
    agentRole.permissions.push(dashboardPermission._id);
    await agentRole.save();

    console.log('✅ Successfully added DASHBOARD_VIEW permission to Agent role');
    console.log(`📊 Agent now has ${agentRole.permissions.length} permissions`);
    
    console.log('\n💡 Expected Menu Items for Agent (after update):');
    console.log('   ✓ Dashboard');
    console.log('   ✓ Tickets');
    console.log('   ✓ Knowledge Base');
    console.log('   ✓ Offline Support');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

addDashboardPermissionToAgent();