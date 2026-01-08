const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    try {
      const db = mongoose.connection.db;
      
      // Get all roles
      const roles = await db.collection('roles').find({}).toArray();
      
      console.log('\n📋 All Roles in Database:');
      console.log('Total:', roles.length);
      
      roles.forEach(role => {
        console.log(`\n- ${role.name} (${role.code})`);
        console.log(`  ID: ${role._id}`);
        console.log(`  isAgent: ${role.isAgent !== undefined ? role.isAgent : 'NOT SET'}`);
        console.log(`  All fields:`, Object.keys(role));
      });

      // Check if Counselor role has isAgent
      const counselor = roles.find(r => r.code === 'COUNSELOR');
      if (counselor) {
        console.log('\n🎯 Counselor Role Details:');
        console.log(JSON.stringify(counselor, null, 2));
      }

    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      await mongoose.connection.close();
      console.log('\n✅ Connection closed');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
