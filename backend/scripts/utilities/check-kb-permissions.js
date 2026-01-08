const mongoose = require('mongoose');
require('dotenv').config();

// Define Permission Schema directly
const permissionSchema = new mongoose.Schema({
  module: String,
  name: String,
  code: String,
  description: String,
  category: String
});

const Permission = mongoose.model('Permission', permissionSchema);

async function checkKBPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all KB permissions
    const kbPermissions = await Permission.find({
      code: { $regex: /^KB_/ }
    }).sort({ code: 1 });

    console.log('=== KNOWLEDGE BASE PERMISSIONS ===');
    console.log(`Total KB Permissions: ${kbPermissions.length}\n`);

    if (kbPermissions.length === 0) {
      console.log('❌ NO KB PERMISSIONS FOUND IN DATABASE!');
      console.log('\nExpected KB permissions:');
      console.log('  - KB_VIEW');
      console.log('  - KB_CREATE');
      console.log('  - KB_EDIT');
      console.log('  - KB_DELETE');
      console.log('  - KB_PUBLISH');
      console.log('  - KB_UNPUBLISH');
      console.log('  - KB_MANAGE_CATEGORIES');
      console.log('  - KB_APPROVE');
      console.log('  - KB_EXPORT');
    } else {
      kbPermissions.forEach((perm, index) => {
        console.log(`${index + 1}. ${perm.code}`);
        console.log(`   Name: ${perm.name}`);
        console.log(`   Description: ${perm.description}`);
        console.log(`   Category: ${perm.category}`);
        console.log(`   Module: ${perm.module}`);
        console.log(`   ID: ${perm._id}`);
        console.log('');
      });
    }

    // Check if all expected permissions exist
    const expectedPermissions = [
      'KB_VIEW',
      'KB_CREATE',
      'KB_EDIT',
      'KB_DELETE',
      'KB_PUBLISH',
      'KB_UNPUBLISH',
      'KB_MANAGE_CATEGORIES',
      'KB_APPROVE',
      'KB_EXPORT'
    ];

    console.log('=== PERMISSION CHECK ===');
    const existingCodes = kbPermissions.map(p => p.code);
    const missing = expectedPermissions.filter(code => !existingCodes.includes(code));

    if (missing.length > 0) {
      console.log('❌ Missing Permissions:');
      missing.forEach(code => console.log(`   - ${code}`));
    } else {
      console.log('✅ All KB permissions are present in database');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkKBPermissions();
