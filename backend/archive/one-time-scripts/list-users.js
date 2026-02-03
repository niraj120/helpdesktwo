const mongoose = require('mongoose');

async function listAdminUsers() {
  try {
    const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';
    
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    
    const allUsers = await User.find({}).select('email name role roleId').limit(20);

    console.log(`👤 All Users (${allUsers.length} found):`);
    console.log('='.repeat(80));
    admins.forEach((user, i) => {
      console.log(`${i + 1}. Email: ${user.email}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Role: ${user.role || 'N/A'}`);
      console.log('');
    });

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listAdminUsers();
