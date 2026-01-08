const mongoose = require('mongoose');
require('dotenv').config();

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  type: String
});

const Role = mongoose.model('Role', roleSchema);

async function checkRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const roles = await Role.find({}).sort({ name: 1 });
    console.log(`Total roles in database: ${roles.length}\n`);
    
    roles.forEach((role, index) => {
      console.log(`${index + 1}. ${role.name}`);
      console.log(`   Code: ${role.code}`);
      console.log(`   Type: ${role.type}`);
      console.log(`   ID: ${role._id}`);
      console.log('');
    });

    const studentRole = roles.find(r => r.code === 'STUDENT');
    if (studentRole) {
      console.log('✅ STUDENT role EXISTS');
    } else {
      console.log('❌ STUDENT role NOT FOUND - Need to run seed!');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkRoles();
