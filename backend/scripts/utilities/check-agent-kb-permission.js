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

async function checkAgentKBPermission() {
  try {
    console.log('🔍 Checking agent KB permission...');
    
    // Find agent user (assuming Priya Sharma from the screenshot)
    const agent = await User.findOne({ 
      $or: [
        { email: { $regex: /priya/i } },
        { name: { $regex: /priya/i } }
      ]
    }).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    if (!agent) {
      console.log('❌ Agent not found. Searching all agents...');
      const allAgents = await User.find({}).populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });
      
      console.log('\n👤 All users:');
      allAgents.forEach(user => {
        console.log(`- ${user.name} (${user.email}) - Role: ${user.role?.name}`);
      });
      return;
    }

    console.log(`\n👤 Agent: ${agent.name} (${agent.email})`);
    console.log(`🎭 Role: ${agent.role?.name}`);
    
    if (agent.role?.permissions) {
      console.log(`\n🔐 Permissions (${agent.role.permissions.length}):`);
      agent.role.permissions.forEach(perm => {
        const isKBPermission = perm.code?.startsWith('KB_');
        console.log(`${isKBPermission ? '✅' : '  '} ${perm.code} - ${perm.name}`);
      });

      // Check specifically for KB_VIEW
      const hasKBView = agent.role.permissions.some(perm => perm.code === 'KB_VIEW');
      console.log(`\n🎯 Has KB_VIEW permission: ${hasKBView ? '✅ YES' : '❌ NO'}`);
      
      if (hasKBView) {
        console.log('\n✅ Permission is correct! Agent should see Knowledge Base menu.');
        console.log('📝 Issue might be in frontend permission checking logic.');
      } else {
        console.log('\n❌ Missing KB_VIEW permission! This is the issue.');
      }
    } else {
      console.log('❌ No permissions found for this role');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

checkAgentKBPermission();