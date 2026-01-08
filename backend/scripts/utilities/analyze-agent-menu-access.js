const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sac_helpdesk');

// Define schemas
const userSchema = new mongoose.Schema({
  email: String,
  name: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }
}, { collection: 'users' });

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { collection: 'roles' });

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String
}, { collection: 'permissions' });

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function analyzeAgentMenuAccess() {
  try {
    console.log('🔍 Analyzing Agent Menu Access...\n');
    
    // Find all users with 'Agent' role
    const agentRole = await Role.findOne({ name: /agent/i }).populate('permissions');
    
    if (!agentRole) {
      console.log('❌ No Agent role found');
      return;
    }

    console.log(`🎭 Agent Role: ${agentRole.name}`);
    console.log(`📊 Permissions Count: ${agentRole.permissions.length}\n`);

    // Analyze which menu items agent should see
    const permissions = agentRole.permissions.map(p => p.code);
    console.log('🔐 Agent Permissions:');
    permissions.forEach(perm => {
      console.log(`   ✓ ${perm}`);
    });

    console.log('\n📋 Menu Access Analysis:');
    
    // Dashboard access
    const hasDashboard = permissions.includes('DASHBOARD_VIEW');
    console.log(`📊 Dashboard: ${hasDashboard ? '✅ YES' : '❌ NO'} (requires DASHBOARD_VIEW)`);
    
    // Tickets access  
    const hasTickets = permissions.some(p => p.startsWith('TICKET_'));
    const ticketPermissions = permissions.filter(p => p.startsWith('TICKET_'));
    console.log(`🎫 Tickets: ${hasTickets ? '✅ YES' : '❌ NO'} (requires any TICKET_ permission)`);
    if (hasTickets) {
      console.log(`   📝 Ticket Permissions: ${ticketPermissions.join(', ')}`);
    }
    
    // Knowledge Base access
    const hasKB = permissions.includes('KB_VIEW');
    console.log(`📚 Knowledge Base: ${hasKB ? '✅ YES' : '❌ NO'} (requires KB_VIEW)`);
    
    // Offline Support access
    const hasOffline = permissions.includes('OFFLINE_MODULE_ACCESS');
    console.log(`🏢 Offline Support: ${hasOffline ? '✅ YES' : '❌ NO'} (requires OFFLINE_MODULE_ACCESS)`);

    console.log('\n💡 Expected Menu Items for Agent:');
    if (hasDashboard) console.log('   ✓ Dashboard');
    if (hasTickets) console.log('   ✓ Tickets');
    if (hasKB) console.log('   ✓ Knowledge Base');  
    if (hasOffline) console.log('   ✓ Offline Support');
    
    if (!hasDashboard && !hasTickets && !hasKB && !hasOffline) {
      console.log('   ❌ No menu items should be visible!');
    }

    // Find actual agent users
    const agents = await User.find({ role: agentRole._id });
    console.log(`\n👥 Agent Users (${agents.length}):`);
    agents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.email})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

analyzeAgentMenuAccess();