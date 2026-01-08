const mongoose = require('mongoose');

async function checkAgentKBPermissions() {
  console.log('🔍 Checking Agent Knowledge Base Permissions');
  
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    // Get Agent role with permissions
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    
    const agentRole = await Role.findOne({ code: 'AGENT' }).populate('permissions');
    
    if (!agentRole) {
      console.log('❌ Agent role not found');
      return;
    }
    
    console.log(`📋 Agent Role: ${agentRole.name} (ID: ${agentRole._id})`);
    console.log(`📊 Total Permissions: ${agentRole.permissions.length}\n`);
    
    // Check for Knowledge Base permissions
    const kbPermissions = agentRole.permissions.filter(p => p.code?.startsWith('KB_'));
    console.log('🔍 Knowledge Base Permissions:');
    
    if (kbPermissions.length === 0) {
      console.log('❌ NO KNOWLEDGE BASE PERMISSIONS FOUND!');
    } else {
      kbPermissions.forEach(p => {
        console.log(`  ✅ ${p.code} - ${p.name}`);
      });
    }
    
    // Check all available KB permissions in the system
    const allKBPermissions = await Permission.find({ code: { $regex: /^KB_/ } });
    console.log(`\n📚 Available KB Permissions in System (${allKBPermissions.length}):`);
    allKBPermissions.forEach(p => {
      const hasPermission = kbPermissions.some(ap => ap.code === p.code);
      console.log(`  ${hasPermission ? '✅' : '❌'} ${p.code} - ${p.name}`);
    });
    
    // Show what's missing
    const missingKBPerms = allKBPermissions.filter(p => 
      !kbPermissions.some(ap => ap.code === p.code)
    );
    
    if (missingKBPerms.length > 0) {
      console.log(`\n⚠️ MISSING KB PERMISSIONS (${missingKBPerms.length}):`);
      missingKBPerms.forEach(p => {
        console.log(`  - ${p.code}: ${p.name}`);
      });
      
      console.log('\n🔧 To fix this issue, we need to add KB_VIEW to Agent role');
    } else {
      console.log('\n✅ Agent has all necessary KB permissions!');
    }
    
    mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    mongoose.disconnect();
  }
}

checkAgentKBPermissions();