const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const roleSchema = new mongoose.Schema({
      code: String,
      name: String,
      permissions: [String],
      type: String
    });
    
    const Role = mongoose.model('Role', roleSchema);
    
    const superAdmin = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (superAdmin) {
      console.log('🔐 Super Admin Role in Database:');
      console.log(`   Name: ${superAdmin.name}`);
      console.log(`   Code: ${superAdmin.code}`);
      console.log(`   Type: ${superAdmin.type}`);
      console.log(`   Total Permissions: ${superAdmin.permissions.length}`);
      console.log('\n📋 First 20 permissions:');
      superAdmin.permissions.slice(0, 20).forEach((perm, idx) => {
        console.log(`   ${idx + 1}. ${perm}`);
      });
      
      // Check for master data permissions
      const masterDataPerms = superAdmin.permissions.filter(p => p.startsWith('MASTER_DATA_'));
      console.log(`\n✅ Master Data Permissions: ${masterDataPerms.length}`);
      masterDataPerms.forEach(p => console.log(`   - ${p}`));
    } else {
      console.log('❌ Super Admin role not found');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
