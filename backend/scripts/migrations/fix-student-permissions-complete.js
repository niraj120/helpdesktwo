const mongoose = require('mongoose');
require('dotenv').config();

// Define schemas
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  tokenVersion: { type: Number, default: 0 }
});

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
});

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String
});

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function fixStudentPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find STUDENT role
    const studentRole = await Role.findOne({ code: 'STUDENT' }).populate('permissions');
    
    if (!studentRole) {
      console.log('❌ STUDENT role not found!');
      process.exit(1);
    }

    console.log('✅ Found STUDENT role:', studentRole.name);
    console.log('Current permissions:', studentRole.permissions.length);

    // Find required permissions
    const requiredPermissionCodes = [
      'TICKET_VIEW_OWN',
      'TICKET_CREATE',
      'TICKET_ADD_COMMENT',
      'TICKET_ADD_ATTACHMENT',
      'KB_VIEW'
    ];

    const requiredPermissions = await Permission.find({
      code: { $in: requiredPermissionCodes }
    });

    console.log(`\n✅ Found ${requiredPermissions.length} required permissions:`);
    requiredPermissions.forEach(p => {
      console.log(`   - ${p.code}: ${p.name}`);
    });

    // Update STUDENT role with permissions
    studentRole.permissions = requiredPermissions.map(p => p._id);
    await studentRole.save();
    console.log('\n✅ Updated STUDENT role with all required permissions');

    // Find and update student user
    const studentUser = await User.findOne({ 
      email: 'anmol.sharma@hubblehox.com' 
    }).populate('role');

    if (!studentUser) {
      console.log('\n❌ Student user not found!');
      process.exit(1);
    }

    console.log(`\n✅ Found student user: ${studentUser.firstName} ${studentUser.lastName}`);
    console.log(`   Email: ${studentUser.email}`);
    console.log(`   Current role: ${studentUser.role ? studentUser.role.name : 'None'}`);

    // Assign STUDENT role if not already assigned
    if (!studentUser.role || studentUser.role._id.toString() !== studentRole._id.toString()) {
      studentUser.role = studentRole._id;
      await studentUser.save();
      console.log('✅ Assigned STUDENT role to user');
    } else {
      console.log('✅ User already has STUDENT role');
    }

    // Increment tokenVersion to force re-login
    studentUser.tokenVersion = (studentUser.tokenVersion || 0) + 1;
    await studentUser.save();
    
    console.log(`\n✅ Incremented tokenVersion to ${studentUser.tokenVersion}`);
    console.log('\n⚠️  Student must logout and login again to get new permissions!');
    console.log('\nStudent permissions after update:');
    requiredPermissions.forEach(p => {
      console.log(`   ✅ ${p.code} - ${p.name}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixStudentPermissions();
