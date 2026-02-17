const mongoose = require('mongoose');
require('dotenv').config();

async function listPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get all permissions directly
    const Permission = mongoose.connection.collection('permissions');
    const Role = mongoose.connection.collection('roles');
    const RolePermission = mongoose.connection.collection('rolepermissions');
    
    // Find Super Admin role
    const superAdmin = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (!superAdmin) {
      console.log('Super Admin role not found');
      process.exit(1);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('                    SUPER ADMIN PERMISSIONS LIST');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Role ID:', superAdmin._id.toString());
    
    // Get all permissions from RolePermission table
    const rolePerms = await RolePermission.find({ roleId: superAdmin._id }).toArray();
    const permIds = rolePerms.map(rp => rp.permissionId);
    
    // Get all permission details
    const permissions = await Permission.find({ _id: { $in: permIds } }).toArray();
    
    console.log('Total Permissions:', permissions.length);
    console.log('');
    
    // Group by category
    const grouped = {};
    permissions.forEach(p => {
      const cat = p.category || 'uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        code: p.code || 'N/A',
        name: p.name || 'N/A',
        module: p.module || 'N/A',
        isActive: p.isActive
      });
    });
    
    // Sort categories and print
    const categories = Object.keys(grouped).sort();
    
    categories.forEach(cat => {
      console.log('┌─────────────────────────────────────────────────────────────────');
      console.log('│ CATEGORY:', cat.toUpperCase(), '(' + grouped[cat].length + ' permissions)');
      console.log('├─────────────────────────────────────────────────────────────────');
      
      grouped[cat]
        .sort((a, b) => a.code.localeCompare(b.code))
        .forEach(p => {
          const status = p.isActive === false ? ' [INACTIVE]' : '';
          console.log('│  ', p.code.padEnd(40), p.name.substring(0, 30), status);
        });
      
      console.log('└─────────────────────────────────────────────────────────────────');
      console.log('');
    });
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('                           SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Total Categories:', categories.length);
    console.log('Total Permissions:', permissions.length);
    console.log('');
    console.log('By Category:');
    categories.forEach(cat => {
      console.log('  ', cat.padEnd(25), grouped[cat].length, 'permissions');
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listPermissions();
