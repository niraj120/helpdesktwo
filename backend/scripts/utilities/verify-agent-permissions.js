require('dotenv').config();
const mongoose = require('mongoose');

// Define schemas
const userSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const roleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const permissionSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });

const User = mongoose.model('users', userSchema);
const Role = mongoose.model('roles', roleSchema);
const Permission = mongoose.model('permissions', permissionSchema);

async function verifyAgentPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the AGENT role
    const agentRole = await Role.findOne({ code: 'AGENT' });
    if (!agentRole) {
      console.log('❌ AGENT role not found');
      return;
    }

    console.log('📋 AGENT Role Details:');
    console.log('Name:', agentRole.name);
    console.log('Code:', agentRole.code);
    console.log('Permission IDs:', agentRole.permissions);
    console.log('');

    // Get actual permission objects
    const permissions = await Permission.find({ _id: { $in: agentRole.permissions } });
    
    console.log('📋 AGENT Role Permissions:');
    permissions.forEach(p => {
      console.log(`  - ${p.code}: ${p.name}`);
    });
    console.log('');
    console.log('Total permissions:', permissions.length);
    
    // Check for specific needed permissions
    const neededPerms = [
      'OFFLINE_MODULE_ACCESS',
      'PROJECT_VIEW_ALL'
    ];
    
    console.log('\n🔍 Checking for needed permissions:');
    neededPerms.forEach(needed => {
      const has = permissions.some(p => p.code === needed);
      console.log(`  ${has ? '✅' : '❌'} ${needed}`);
    });

    // Check agent user
    const agent = await User.findOne({ email: 'priya.sharma@sac.gov.in' });
    if (agent) {
      console.log('\n📋 Agent User:');
      console.log('Email:', agent.email);
      console.log('Name:', agent.firstName, agent.lastName);
      console.log('Role ID:', agent.role);
      console.log('TokenVersion:', agent.tokenVersion);
      console.log('Projects:', agent.projects);
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

verifyAgentPermissions();
