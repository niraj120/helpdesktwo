const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    
    // Get all permissions
    const allPermissions = await Permission.find().lean();
    
    console.log('=== ALL PERMISSIONS IN DATABASE ===');
    console.log(`Total: ${allPermissions.length}\n`);
    
    // Group by category
    const grouped = {};
    allPermissions.forEach(p => {
      const category = p.code.split('_')[0];
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(p);
    });
    
    Object.keys(grouped).sort().forEach(category => {
      console.log(`\n${category}:`);
      grouped[category].forEach(p => {
        console.log(`  ${p.code.padEnd(40)} | ${p._id.toString()}`);
      });
    });
    
    // Check for TICKET_VIEW_OWN specifically
    const ticketViewOwn = allPermissions.find(p => p.code === 'TICKET_VIEW_OWN');
    console.log('\n=== TICKET_VIEW_OWN ===');
    if (ticketViewOwn) {
      console.log('✅ EXISTS');
      console.log('ID:', ticketViewOwn._id.toString());
      console.log('Code:', ticketViewOwn.code);
      console.log('Name:', ticketViewOwn.name);
    } else {
      console.log('❌ NOT FOUND');
    }
    
    // Check for common RBAC permissions
    const rbacPermissions = [
      'ROLE_VIEW_ALL',
      'ROLE_CREATE',
      'ROLE_EDIT',
      'ROLE_DELETE',
      'PERMISSION_VIEW_ALL',
      'USER_VIEW_ALL',
      'USER_CREATE',
      'USER_EDIT',
      'USER_DELETE'
    ];
    
    console.log('\n=== COMMON RBAC PERMISSIONS ===');
    rbacPermissions.forEach(code => {
      const exists = allPermissions.find(p => p.code === code);
      console.log(`${exists ? '✅' : '❌'} ${code.padEnd(30)} ${exists ? `| ${exists._id.toString()}` : ''}`);
    });
    
    mongoose.disconnect();
    console.log('\n✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
