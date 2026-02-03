/**
 * List all roles in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk';

async function listRoles() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Role = mongoose.model('Role', new mongoose.Schema({
      code: String,
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    }));

    const roles = await Role.find({}).select('code name permissions');
    
    console.log(`\n📋 Found ${roles.length} roles:\n`);
    roles.forEach(role => {
      console.log(`   - ${role.code}: ${role.name} (${role.permissions.length} permissions)`);
    });

  } catch (error) {
    console.error('❌ Error listing roles:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the update
listRoles().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Failed:', error.message);
  process.exit(1);
});
