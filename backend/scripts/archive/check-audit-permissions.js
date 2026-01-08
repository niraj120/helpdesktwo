const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    
    const user = await User.findOne({ email: 'priya@sac.gov.in' })
      .populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('👤 USER:', user.firstName, user.lastName);
    console.log('📧 Email:', user.email);
    console.log('🎭 Role:', user.role.name);
    console.log('📋 Total Permissions:', user.role.permissions.length);
    
    const auditPermissions = user.role.permissions.filter(p => p.code && p.code.startsWith('AUDIT'));
    
    console.log('\n🔍 AUDIT PERMISSIONS:', auditPermissions.length);
    if (auditPermissions.length > 0) {
      auditPermissions.forEach(p => {
        console.log(`  - ${p.code}: ${p.name}`);
      });
    } else {
      console.log('  ❌ NO AUDIT PERMISSIONS FOUND');
    }

    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
