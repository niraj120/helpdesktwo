const mongoose = require('mongoose');
require('dotenv').config();

// Define Permission Schema directly
const permissionSchema = new mongoose.Schema({
  module: String,
  name: String,
  code: String,
  description: String,
  category: String,
  isActive: { type: Boolean, default: true }
});

const Permission = mongoose.model('Permission', permissionSchema);

async function checkKBActiveStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all KB permissions
    const kbPermissions = await Permission.find({
      code: { $regex: /^KB_/ }
    }).sort({ code: 1 });

    console.log('=== KNOWLEDGE BASE PERMISSIONS STATUS ===');
    console.log(`Total KB Permissions: ${kbPermissions.length}\n`);

    let inactiveCount = 0;
    kbPermissions.forEach((perm, index) => {
      const isActive = perm.isActive !== false; // Default to true if undefined
      if (!isActive) inactiveCount++;
      
      console.log(`${index + 1}. ${perm.code}`);
      console.log(`   Name: ${perm.name}`);
      console.log(`   Category: ${perm.category}`);
      console.log(`   isActive: ${isActive ? '✅ true' : '❌ false'}`);
      console.log('');
    });

    if (inactiveCount > 0) {
      console.log(`\n⚠️  WARNING: ${inactiveCount} KB permissions are inactive!`);
      console.log('These will NOT appear in the grouped permissions API.\n');
      
      // Update all to active
      const result = await Permission.updateMany(
        { code: { $regex: /^KB_/ }, isActive: { $ne: true } },
        { $set: { isActive: true } }
      );
      
      console.log(`✅ Updated ${result.modifiedCount} KB permissions to active status`);
    } else {
      console.log('✅ All KB permissions are active');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkKBActiveStatus();
