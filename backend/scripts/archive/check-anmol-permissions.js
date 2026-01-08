const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/sac_helpdesk';

const userSchema = new mongoose.Schema({
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }
});

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
});

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String
});

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function checkStudentUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find the student user (anmol.sharma@hubblehox.com)
    const student = await User.findOne({ email: 'anmol.sharma@hubblehox.com' })
      .populate({
        path: 'role',
        populate: {
          path: 'permissions'
        }
      });

    if (!student) {
      console.log('❌ Student user not found!');
      process.exit(1);
    }

    console.log('\n📧 User:', student.email);
    console.log('👤 Role:', student.role.name);
    console.log('🔐 Permissions count:', student.role.permissions.length);
    console.log('\n📝 Permission codes:');
    student.role.permissions.forEach((perm, idx) => {
      console.log(`  ${idx + 1}. ${perm.code}`);
    });

    // Show what the JWT payload would look like
    console.log('\n🎫 JWT Payload structure:');
    console.log('role.permissions is an array of:', typeof student.role.permissions[0]);
    console.log('First permission:', JSON.stringify(student.role.permissions[0], null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStudentUser();
