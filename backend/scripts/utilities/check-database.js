const mongoose = require('mongoose');

async function checkDatabase() {
  try {
    console.log('🔍 Checking database connection and collections...\n');
    
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`\n📊 Found ${collections.length} collection(s):`);
    collections.forEach((col, index) => {
      console.log(`${index + 1}. ${col.name}`);
    });
    
    // Check documents in key collections
    if (collections.find(c => c.name === 'roles')) {
      const rolesCount = await db.collection('roles').countDocuments();
      console.log(`\n🎭 Roles collection: ${rolesCount} documents`);
    }
    
    if (collections.find(c => c.name === 'permissions')) {
      const permissionsCount = await db.collection('permissions').countDocuments();
      console.log(`🔐 Permissions collection: ${permissionsCount} documents`);
    }
    
    if (collections.find(c => c.name === 'users')) {
      const usersCount = await db.collection('users').countDocuments();
      console.log(`👤 Users collection: ${usersCount} documents`);
    }

  } catch (error) {
    console.error('❌ Database Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

checkDatabase();