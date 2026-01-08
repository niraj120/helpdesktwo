require('dotenv').config();
const mongoose = require('mongoose');

// Define schemas
const userSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const roleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const permissionSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });

const User = mongoose.model('users', userSchema);
const Role = mongoose.model('roles', roleSchema);
const Permission = mongoose.model('permissions', permissionSchema);

async function addProjectViewAll() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find PROJECT_VIEW_ALL permission
    const projectViewAll = await Permission.findOne({ code: 'PROJECT_VIEW_ALL' });
    if (!projectViewAll) {
      console.log('❌ PROJECT_VIEW_ALL permission not found in database');
      console.log('🔍 Searching for similar permissions...');
      
      const projectPerms = await Permission.find({ code: /PROJECT/i });
      console.log('\nFound project-related permissions:');
      projectPerms.forEach(p => {
        console.log(`  - ${p.code}: ${p.name} (ID: ${p._id})`);
      });
      
      await mongoose.connection.close();
      return;
    }

    console.log('✅ Found permission:');
    console.log(`   Code: ${projectViewAll.code}`);
    console.log(`   Name: ${projectViewAll.name}`);
    console.log(`   ID: ${projectViewAll._id}`);
    console.log('');

    // Get AGENT role
    const agentRole = await Role.findOne({ code: 'AGENT' });
    if (!agentRole) {
      console.log('❌ AGENT role not found');
      await mongoose.connection.close();
      return;
    }

    console.log('📋 AGENT Role:');
    console.log(`   Name: ${agentRole.name}`);
    console.log(`   Current permissions: ${agentRole.permissions.length}`);
    console.log('');

    // Check if already has permission
    const hasPermission = agentRole.permissions.some(p => 
      p.toString() === projectViewAll._id.toString()
    );

    if (hasPermission) {
      console.log('✅ AGENT role already has PROJECT_VIEW_ALL permission');
    } else {
      console.log('➕ Adding PROJECT_VIEW_ALL to AGENT role...');
      agentRole.permissions.push(projectViewAll._id);
      await agentRole.save();
      console.log('✅ Permission added successfully!');
      console.log(`   New permission count: ${agentRole.permissions.length}`);
    }

    // Increment agent tokenVersion to force re-login
    const agent = await User.findOne({ email: 'priya.sharma@sac.gov.in' });
    if (agent) {
      const oldVersion = agent.tokenVersion || 0;
      agent.tokenVersion = oldVersion + 1;
      await agent.save();
      console.log('\n✅ Agent tokenVersion incremented:');
      console.log(`   Old: ${oldVersion} → New: ${agent.tokenVersion}`);
      console.log('\n⚠️  Agent MUST logout and login again!');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

addProjectViewAll();
