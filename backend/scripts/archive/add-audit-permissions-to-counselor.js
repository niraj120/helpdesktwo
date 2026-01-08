const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');

    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    
    // Find Counselor role
    const counselorRole = await Role.findOne({ name: 'Counselor' });
    
    if (!counselorRole) {
      console.log('❌ Counselor role not found');
      process.exit(1);
    }

    console.log('📋 Found Counselor Role');
    console.log('   ID:', counselorRole._id);
    console.log('   Current Permissions:', counselorRole.permissions.length);
    
    // Find AUDIT permissions
    const auditPermissions = await Permission.find({
      code: {
        $in: ['AUDIT_VIEW_ACTIVITY', 'AUDIT_VIEW_ACCESS']
      }
    });

    console.log('\n🔍 Found AUDIT Permissions:', auditPermissions.length);
    auditPermissions.forEach(p => {
      console.log(`   - ${p.code}: ${p.name}`);
    });

    // Add audit permissions to counselor role if not already present
    const existingPermissionIds = counselorRole.permissions.map(p => p.toString());
    const newPermissions = auditPermissions.filter(p => 
      !existingPermissionIds.includes(p._id.toString())
    );

    if (newPermissions.length > 0) {
      counselorRole.permissions.push(...newPermissions.map(p => p._id));
      await counselorRole.save();
      
      console.log('\n✅ Added', newPermissions.length, 'AUDIT permissions to Counselor role');
      console.log('   Total Permissions:', counselorRole.permissions.length);
    } else {
      console.log('\n✅ Counselor role already has AUDIT permissions');
    }

    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
