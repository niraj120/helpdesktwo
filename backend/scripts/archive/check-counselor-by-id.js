const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Find Counselor role by ID
    const counselorRole = await db.collection('roles').findOne({
      _id: new mongoose.Types.ObjectId('69231af5f823462759296ad2')
    });
    
    if (!counselorRole) {
      console.log('❌ Counselor role not found with that ID');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📋 COUNSELOR ROLE');
    console.log('Role ID:', counselorRole._id);
    console.log('Role Name:', counselorRole.name);
    console.log('Description:', counselorRole.description || 'N/A');
    console.log('Total Permissions:', counselorRole.permissions?.length || 0);
    console.log('\n=== PERMISSION IDs ===');
    console.log(counselorRole.permissions);
    
    if (counselorRole.permissions && counselorRole.permissions.length > 0) {
      // Get all permissions
      const permissions = await db.collection('permissions').find({
        _id: { $in: counselorRole.permissions }
      }).toArray();
      
      console.log('\n=== PERMISSION DETAILS ===');
      permissions.forEach((perm, index) => {
        console.log(`\n${index + 1}. ${perm.name}`);
        console.log(`   Code: ${perm.code}`);
        console.log(`   Category: ${perm.category || 'N/A'}`);
      });
    }
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
