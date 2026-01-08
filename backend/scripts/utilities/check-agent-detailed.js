require('dotenv').config();
const mongoose = require('mongoose');

// Define schemas
const userSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const roleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const permissionSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });

const User = mongoose.model('users', userSchema);
const Role = mongoose.model('roles', roleSchema);
const Permission = mongoose.model('permissions', permissionSchema);

async function checkAgent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get agent user
    const agent = await User.findOne({ email: 'priya.sharma@sac.gov.in' });
    if (!agent) {
      console.log('❌ Agent not found');
      return;
    }

    console.log('📋 Agent User Details:');
    console.log('Email:', agent.email);
    console.log('Name:', agent.firstName, agent.lastName);
    console.log('Role ID:', agent.role);
    console.log('TokenVersion:', agent.tokenVersion);
    console.log('');

    // Get agent's role
    const role = await Role.findById(agent.role);
    if (!role) {
      console.log('❌ Role not found');
      return;
    }

    console.log('📋 Role Details:');
    console.log('Name:', role.name);
    console.log('Code:', role.code);
    console.log('Permission IDs:', role.permissions.length);
    console.log('');

    // Get all permissions
    const permissions = await Permission.find({ _id: { $in: role.permissions } });
    console.log('📋 Agent Permissions (' + permissions.length + ' total):');
    permissions.forEach(p => {
      console.log(`  - ${p.code}: ${p.name}`);
    });

    // Check specific needed permissions
    console.log('\n🔍 Checking Required Permissions:');
    const requiredPerms = [
      'OFFLINE_MODULE_ACCESS',
      'PROJECT_VIEW_ALL'
    ];

    requiredPerms.forEach(permCode => {
      const hasPerm = permissions.some(p => p.code === permCode);
      if (hasPerm) {
        console.log(`✅ ${permCode}`);
      } else {
        console.log(`❌ MISSING: ${permCode}`);
      }
    });

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

checkAgent();
