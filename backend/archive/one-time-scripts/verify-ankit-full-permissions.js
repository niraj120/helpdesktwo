require('dotenv').config();
const mongoose = require('mongoose');

async function verifyPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const User = mongoose.model('User', new mongoose.Schema({}, {strict: false, collection: 'users'}));
    const Role = mongoose.model('Role', new mongoose.Schema({}, {strict: false, collection: 'roles'}));
    const RolePermission = mongoose.model('RolePermission', new mongoose.Schema({}, {strict: false, collection: 'rolepermissions'}));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, {strict: false, collection: 'permissions'}));
    
    // Find Ankit Mehta
    const user = await User.findOne({name: 'Ankit Mehta'});
    if (!user) {
      console.log('❌ User "Ankit Mehta" not found');
      process.exit(1);
    }
    
    console.log('👤 User Found:');
    console.log('   Name:', user.name);
    console.log('   Email:', user.email);
    console.log('   Role ID:', user.roleId);
    
    // Find role details
    const role = await Role.findById(user.roleId);
    console.log('\n📋 Role Details:');
    console.log('   Name:', role?.name);
    console.log('   Code:', role?.code);
    
    // Get all permissions for this role
    const rolePerms = await RolePermission.find({roleId: user.roleId});
    console.log('\n🔑 Total Permission Mappings:', rolePerms.length);
    
    // Get permission details
    const permissionIds = rolePerms.map(rp => rp.permissionId);
    const permissions = await Permission.find({_id: {$in: permissionIds}});
    
    const permissionCodes = permissions.map(p => p.code).sort();
    
    console.log('\n📝 All Permission Codes (' + permissionCodes.length + '):');
    permissionCodes.forEach((code, idx) => {
      console.log(`   ${(idx + 1).toString().padStart(2, ' ')}. ${code}`);
    });
    
    // Check for KB permissions specifically
    console.log('\n🔍 Knowledge Base Permissions:');
    const kbPerms = permissionCodes.filter(code => code.includes('KB'));
    if (kbPerms.length === 0) {
      console.log('   ❌ NO KB PERMISSIONS FOUND!');
    } else {
      kbPerms.forEach(code => console.log(`   ✅ ${code}`));
    }
    
    // Check what the frontend expects
    const expectedKbPerms = ['KB_VIEW', 'KB_CREATE', 'KB_EDIT', 'KB_DELETE', 'KB_MANAGE'];
    console.log('\n🎯 Frontend Menu Expects (any one of):');
    expectedKbPerms.forEach(perm => {
      const has = permissionCodes.includes(perm);
      console.log(`   ${has ? '✅' : '❌'} ${perm}`);
    });
    
    const hasAnyKbPerm = expectedKbPerms.some(p => permissionCodes.includes(p));
    console.log('\n' + (hasAnyKbPerm ? '✅ USER CAN SEE KB MENU' : '❌ USER CANNOT SEE KB MENU'));
    console.log('\n💡 Solution: User needs to LOGOUT and LOGIN again to refresh permissions in localStorage');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyPermissions();
