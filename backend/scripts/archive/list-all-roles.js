const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Find all roles
    const roles = await db.collection('roles').find({}).toArray();
    
    console.log('=== ALL ROLES IN DATABASE ===\n');
    roles.forEach(role => {
      console.log(`Role: ${role.name}`);
      console.log(`ID: ${role._id}`);
      console.log(`Description: ${role.description || 'N/A'}`);
      console.log(`Permissions Count: ${role.permissions?.length || 0}`);
      console.log('-'.repeat(50));
    });
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
