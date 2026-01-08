const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    const counselorRoleId = new mongoose.Types.ObjectId('69231af5f823462759296ad2');
    
    // Update Priya's role
    const result = await db.collection('users').updateOne(
      { email: 'priya.sharma@sac.gov.in' },
      { $set: { role: counselorRoleId } }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Successfully assigned Counselor role to Priya');
      
      // Verify the update
      const user = await db.collection('users').findOne({
        email: 'priya.sharma@sac.gov.in'
      });
      
      console.log('\n📋 VERIFICATION');
      console.log('User:', user.firstName, user.lastName);
      console.log('Email:', user.email);
      console.log('Role ID:', user.role.toString());
      console.log('Expected:', counselorRoleId.toString());
      console.log('Match:', user.role.toString() === counselorRoleId.toString() ? '✅ YES' : '❌ NO');
      
      // Get role details
      const role = await db.collection('roles').findOne({ _id: user.role });
      if (role) {
        console.log('\n📋 ASSIGNED ROLE DETAILS');
        console.log('Role Name:', role.name);
        console.log('Permissions:', role.permissions?.length || 0);
      }
    } else {
      console.log('⚠️  No changes made (user might already have this role)');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
