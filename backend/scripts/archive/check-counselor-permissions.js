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
    
    console.log('📋 COUNSELOR ROLE');
    console.log('Role ID:', counselorRole._id);
    console.log('Role Name:', counselorRole.name);
    console.log('Description:', counselorRole.description);
    console.log('\n=== PERMISSIONS ===');
    
    // Get all permissions for this role
    const permissions = await db.collection('permissions').find({
      _id: { $in: counselorRole.permissions }
    }).toArray();
    
    console.log(`Total Permissions: ${permissions.length}\n`);
    
    // Group permissions by category
    const grouped = {};
    permissions.forEach(perm => {
      const category = perm.resource || 'OTHER';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        name: perm.name,
        action: perm.action,
        description: perm.description
      });
    });
    
    // Display grouped permissions
    Object.keys(grouped).sort().forEach(category => {
      console.log(`\n📦 ${category}`);
      console.log('='.repeat(50));
      grouped[category].forEach(perm => {
        console.log(`  ✓ ${perm.name}`);
        console.log(`    Action: ${perm.action}`);
        console.log(`    Description: ${perm.description || 'N/A'}`);
        console.log('');
      });
    });
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
