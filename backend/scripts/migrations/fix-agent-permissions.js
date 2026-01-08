require('dotenv').config();
const mongoose = require('mongoose');

// Define schemas
const userSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const roleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const permissionSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });

const User = mongoose.model('users', userSchema);
const Role = mongoose.model('roles', roleSchema);
const Permission = mongoose.model('permissions', permissionSchema);

async function fixAgentPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the AGENT role
    const agentRole = await Role.findOne({ code: 'AGENT' }).populate('permissions');
    if (!agentRole) {
      console.log('❌ AGENT role not found');
      return;
    }

    console.log('📋 Current AGENT role permissions:');
    console.log('Role:', agentRole.name, `(${agentRole.code})`);
    console.log('Current permissions:', agentRole.permissions.map(p => p.code).join(', '));
    console.log('');

    // Find permissions that agents need but might be missing
    const neededPermissions = [
      'OFFLINE_MODULE_ACCESS',
      'OFFLINE_MODULE_REGISTER',
      'OFFLINE_MODULE_CREATE_TICKET',
      'PROJECT_VIEW_ALL' // This is the missing one causing 403!
    ];

    console.log('🔍 Checking for needed permissions...\n');

    for (const permCode of neededPermissions) {
      const hasPermission = agentRole.permissions.some(p => p.code === permCode);
      
      if (hasPermission) {
        console.log(`✅ Already has: ${permCode}`);
      } else {
        const permission = await Permission.findOne({ code: permCode });
        if (permission) {
          agentRole.permissions.push(permission._id);
          console.log(`➕ Adding: ${permCode}`);
        } else {
          console.log(`❌ Permission not found in database: ${permCode}`);
        }
      }
    }

    // Save the updated role
    await agentRole.save();
    console.log('\n✅ AGENT role permissions updated successfully!');

    // Check the agent user
    const agent = await User.findOne({ email: 'priya.sharma@sac.gov.in' });

    if (agent) {
      console.log('\n📋 Agent user details:');
      console.log('Email:', agent.email);
      console.log('Name:', agent.firstName, agent.lastName);
      console.log('Role ID:', agent.role);
      console.log('Token Version:', agent.tokenVersion || 0);

      // Increment tokenVersion to force re-login
      agent.tokenVersion = (agent.tokenVersion || 0) + 1;
      await agent.save();
      console.log('\n✅ Incremented tokenVersion to:', agent.tokenVersion);
      console.log('⚠️  Agent must logout and login again for new permissions to take effect!');
    } else {
      console.log('\n❌ Agent user not found: priya.sharma@sac.gov.in');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

fixAgentPermissions();
