const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/sac_helpdesk';

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
});

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String
});

const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function checkStudentPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const studentRole = await Role.findOne({ name: 'Student' })
      .populate('permissions');

    if (!studentRole) {
      console.log('❌ Student role not found!');
      return;
    }

    console.log('\n📋 Student Role Information:');
    console.log('Name:', studentRole.name);
    console.log('Number of permissions:', studentRole.permissions.length);
    console.log('\n📝 Permissions:');
    
    if (studentRole.permissions.length === 0) {
      console.log('❌ NO PERMISSIONS ASSIGNED TO STUDENT ROLE!');
    } else {
      studentRole.permissions.forEach((perm, index) => {
        console.log(`${index + 1}. ${perm.code} - ${perm.name}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStudentPermissions();
