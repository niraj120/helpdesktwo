const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Find Priya user
    const user = await db.collection('users').findOne({
      email: 'priya.sharma@sac.gov.in'
    });
    
    if (!user) {
      console.log('❌ User not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('👤 USER DETAILS');
    console.log('Name:', user.firstName, user.lastName);
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    console.log('Role ID:', user.role);
    console.log('Role Type:', typeof user.role);
    
    // Check if role matches Counselor
    const counselorRoleId = '69231af5f823462759296ad2';
    if (user.role && user.role.toString() === counselorRoleId) {
      console.log('\n✅ User is assigned to Counselor role');
    } else {
      console.log('\n❌ User is NOT assigned to Counselor role');
      console.log('Expected:', counselorRoleId);
      console.log('Actual:', user.role ? user.role.toString() : 'null');
    }
    
    // Get the actual role details
    if (user.role) {
      const role = await db.collection('roles').findOne({
        _id: user.role
      });
      
      if (role) {
        console.log('\n📋 ASSIGNED ROLE');
        console.log('Role Name:', role.name);
        console.log('Permissions Count:', role.permissions?.length || 0);
      }
    }
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
