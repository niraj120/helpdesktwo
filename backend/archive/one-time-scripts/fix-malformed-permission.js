/**
 * Fix malformed MY_ASSETS_VIEW permission
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk';

async function fixMalformedPermission() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Permission = mongoose.model('Permission', new mongoose.Schema({
      code: String,
      name: String,
      module: String,
      description: String,
      category: String,
    }, { strict: false }));

    // Find the malformed permission
    const permission = await Permission.findOne({ code: 'MY_ASSETS_VIEW' });
    
    if (!permission) {
      console.log('❌ MY_ASSETS_VIEW permission not found!');
      return;
    }

    console.log('\n📋 Current permission data:');
    console.log(JSON.stringify(permission, null, 2));

    // Check if code field has correct value
    if (typeof permission.code === 'string' && permission.code === 'MY_ASSETS_VIEW') {
      console.log('\n✅ Permission code is correct');
    } else {
      console.log('\n❌ Permission code is malformed:', permission.code);
      console.log('   Type:', typeof permission.code);
    }

    // Try to read the permission normally
    const test = permission.toObject();
    console.log('\n🔍 Permission as plain object:');
    console.log(JSON.stringify(test, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

fixMalformedPermission().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Failed:', error.message);
  process.exit(1);
});
