require('dotenv').config();
const mongoose = require('mongoose');

const fixCenterManagerCode = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Find all roles with space in code
    const rolesWithSpace = await db.collection('roles').find({
      code: /\s/
    }).toArray();

    console.log(`Found ${rolesWithSpace.length} role(s) with spaces in code:\n`);
    
    rolesWithSpace.forEach(role => {
      const newCode = role.code.replace(/\s+/g, '_').toUpperCase();
      console.log(`   ${role.name}: "${role.code}" → "${newCode}"`);
    });

    console.log('\n🔧 Fixing codes...\n');

    for (const role of rolesWithSpace) {
      const newCode = role.code.replace(/\s+/g, '_').toUpperCase();
      await db.collection('roles').updateOne(
        { _id: role._id },
        { $set: { code: newCode } }
      );
      console.log(`   ✅ Updated: ${role.name}`);
    }

    console.log('\n✅ All role codes fixed!');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixCenterManagerCode();
