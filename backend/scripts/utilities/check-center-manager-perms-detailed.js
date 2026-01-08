const mongoose = require('mongoose');
require('./dist/models/User');
require('./dist/models/Role');
require('./dist/models/Permission');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    const User = mongoose.model('User');
    const user = await User.findOne({ email: 'subhangi.mathur@hubblehox.com' })
      .populate({ 
        path: 'role', 
        populate: { path: 'permissions' } 
      });

    console.log('\n📋 CENTER MANAGER ANALYSIS');
    console.log('═══════════════════════════════════════');
    console.log('Role Name:', user.role.name);
    console.log('Role Code:', user.role.code);
    console.log('\n🔑 PERMISSIONS (' + user.role.permissions.length + ' total):');
    
    const permsByCategory = {};
    user.role.permissions.forEach(p => {
      const category = p.code.split('_')[0];
      if (!permsByCategory[category]) permsByCategory[category] = [];
      permsByCategory[category].push(p.code);
    });

    Object.keys(permsByCategory).sort().forEach(category => {
      console.log(`\n${category}:`);
      permsByCategory[category].sort().forEach(p => {
        console.log(`  - ${p}`);
      });
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
