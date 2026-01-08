require('dotenv').config();
const mongoose = require('mongoose');

// Define schemas
const userSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false });
const User = mongoose.model('users', userSchema);

async function checkAgentToken() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const agent = await User.findOne({ email: 'priya.sharma@sac.gov.in' });
    
    if (agent) {
      console.log('📋 Agent Token Status:');
      console.log('Email:', agent.email);
      console.log('Current tokenVersion:', agent.tokenVersion);
      console.log('');
      console.log('⚠️  If agent is getting 401 errors, they need to logout and login again.');
      console.log('   The tokenVersion was incremented to force a fresh login with new permissions.');
    } else {
      console.log('❌ Agent not found');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

checkAgentToken();
