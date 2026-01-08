const mongoose = require('mongoose');

async function checkKBAccess() {
  console.log('🔍 Checking Agent KB Access\n');
  
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    
    const db = mongoose.connection.db;
    
    // Get Agent role
    const agentRole = await db.collection('roles').findOne({ code: 'AGENT' });
    
    if (!agentRole) {
      console.log('❌ Agent role not found');
      return;
    }
    
    console.log(`📋 Agent Role: ${agentRole.name}`);
    console.log(`📊 Permission IDs: ${agentRole.permissions.length}\n`);
    
    // Get permissions by IDs
    const ObjectId = mongoose.Types.ObjectId;
    const permissionIds = agentRole.permissions.map(id => new ObjectId(id));
    
    const permissions = await db.collection('permissions').find({
      _id: { $in: permissionIds }
    }).toArray();
    
    console.log(`📋 Agent Permissions (${permissions.length} total):`);
    permissions.forEach(p => {
      console.log(`  - ${p.code}: ${p.name}`);
    });
    
    // Check for KB permissions
    const kbPerms = permissions.filter(p => p.code?.startsWith('KB_'));
    console.log(`\n🔍 Knowledge Base Permissions (${kbPerms.length}):`);
    
    if (kbPerms.length === 0) {
      console.log('❌ NO KB PERMISSIONS FOUND - This is the problem!');
      
      // Check what KB permissions exist in the system
      const allKBPerms = await db.collection('permissions').find({
        code: { $regex: /^KB_/ }
      }).toArray();
      
      console.log(`\n📚 Available KB Permissions (${allKBPerms.length}):`);
      allKBPerms.forEach(p => {
        console.log(`  - ${p.code}: ${p.name}`);
      });
      
      console.log('\n🔧 SOLUTION: Agent needs at least KB_VIEW permission');
      console.log('Will fix this automatically...\n');
      
      // Find KB_VIEW permission
      const kbViewPerm = allKBPerms.find(p => p.code === 'KB_VIEW');
      
      if (kbViewPerm) {
        // Add KB_VIEW to agent role
        await db.collection('roles').updateOne(
          { _id: agentRole._id },
          { $push: { permissions: kbViewPerm._id } }
        );
        
        console.log('✅ Added KB_VIEW permission to Agent role!');
        console.log('🎉 Agent should now have access to Knowledge Base');
      } else {
        console.log('❌ KB_VIEW permission not found in system');
      }
      
    } else {
      kbPerms.forEach(p => {
        console.log(`  ✅ ${p.code}: ${p.name}`);
      });
      console.log('\n✅ Agent already has KB permissions!');
    }
    
    mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    mongoose.disconnect();
  }
}

checkKBAccess();