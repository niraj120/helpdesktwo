require('dotenv').config();
const mongoose = require('mongoose');

async function assignKBPermissionsToAnkit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const User = mongoose.model('User', new mongoose.Schema({}, {strict: false, collection: 'users'}));
    const Role = mongoose.model('Role', new mongoose.Schema({}, {strict: false, collection: 'roles'}));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, {strict: false, collection: 'permissions'}));
    const RolePermission = mongoose.model('RolePermission', new mongoose.Schema({}, {strict: false, collection: 'rolepermissions'}));
    
    // Find Ankit Mehta (case-insensitive)
    const ankit = await User.findOne({ 
      $or: [
        { name: /ankit mehta/i },
        { email: /ankit\.mehta/i }
      ]
    });
    if (!ankit) {
      console.log('❌ Ankit Mehta not found');
      console.log('Searching for users with "ankit" in name...');
      const users = await User.find({ name: /ankit/i }, { name: 1, email: 1 }).limit(5);
      users.forEach(u => console.log(`   - ${u.name} (${u.email})`));
      process.exit(1);
    }
    
    console.log('👤 Found User:', ankit.name);
    console.log('   Email:', ankit.email);
    console.log('   Role ID:', ankit.roleId);
    
    // Find role
    const role = await Role.findById(ankit.roleId);
    console.log('   Role Name:', role.name);
    console.log('   Role Code:', role.code);
    
    // Find new KB permissions
    const newKBPermCodes = ['KB_MANAGE', 'KB_MANAGE_LEVELS', 'KB_MANAGE_ARTICLES', 'KB_MANAGE_TABLES', 'KB_VIEW_CONTENT'];
    const permissions = await Permission.find({ code: { $in: newKBPermCodes } });
    
    console.log('\n📝 Assigning New KB Permissions to', role.name, 'role...\n');
    
    for (const perm of permissions) {
      // Check if already assigned
      const existing = await RolePermission.findOne({
        roleId: ankit.roleId,
        permissionId: perm._id
      });
      
      if (existing) {
        console.log(`   ✓ ${perm.code.padEnd(25)} - Already assigned`);
      } else {
        await RolePermission.create({
          roleId: ankit.roleId,
          permissionId: perm._id
        });
        console.log(`   ✅ ${perm.code.padEnd(25)} - Newly assigned`);
      }
    }
    
    // Get total permissions count
    const totalPerms = await RolePermission.countDocuments({ roleId: ankit.roleId });
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ SUCCESS! KB Permissions assigned to', role.name);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n📊 Role now has', totalPerms, 'total permissions');
    console.log('\n🎯 Assigned KB Permissions:');
    console.log('   ✓ KB_VIEW_CONTENT - Can view KB content');
    console.log('   ✓ KB_MANAGE_LEVELS - Can manage KB levels');
    console.log('   ✓ KB_MANAGE_ARTICLES - Can manage KB articles');
    console.log('   ✓ KB_MANAGE_TABLES - Can manage KB tables');
    console.log('   ✓ KB_MANAGE - Full KB admin access');
    
    console.log('\n💡 FINAL STEPS:');
    console.log('   1. Ankit Mehta must LOGOUT completely');
    console.log('   2. LOGIN again with his credentials');
    console.log('   3. The "Knowledge Base" menu will now appear in sidebar');
    console.log('   4. Project switcher will be visible');
    console.log('   5. He can manage levels, articles, and tables\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

assignKBPermissionsToAnkit();
