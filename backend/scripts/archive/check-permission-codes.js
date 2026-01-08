const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Find Counselor role
    const counselorRole = await db.collection('roles').findOne({ name: 'Counselor' });
    
    if (!counselorRole) {
      console.log('❌ Counselor role not found');
      await mongoose.disconnect();
      return;
    }
    
    // Get all permissions for this role
    const permissions = await db.collection('permissions').find({
      _id: { $in: counselorRole.permissions }
    }).toArray();
    
    console.log('=== COUNSELOR PERMISSIONS - NAME TO CODE MAPPING ===\n');
    console.log('Total Permissions:', permissions.length);
    console.log('\n' + '='.repeat(80) + '\n');
    
    permissions.forEach(perm => {
      console.log(`Permission Name: "${perm.name}"`);
      console.log(`  Code: ${perm.code || 'MISSING CODE'}`);
      console.log(`  Action: ${perm.action || 'N/A'}`);
      console.log(`  Resource: ${perm.resource || 'N/A'}`);
      console.log(`  Description: ${perm.description || 'N/A'}`);
      console.log('');
    });
    
    console.log('\n=== MISSING CODE FIELD ===');
    const missingCode = permissions.filter(p => !p.code);
    console.log(`${missingCode.length} permissions don't have a 'code' field`);
    
    if (missingCode.length > 0) {
      console.log('\nPermissions without code:');
      missingCode.forEach(p => console.log(`  - ${p.name}`));
    }
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
