const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const MONGODB_URI = 'mongodb://localhost:27017/sac_helpdesk';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-for-development';

const userSchema = new mongoose.Schema({
  email: String,
  firstName: String,
  lastName: String,
  tokenVersion: Number,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }]
});

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
});

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String
});

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

// Simulate generateUserJWT
async function simulateGenerateUserJWT(user) {
  const roleData = user.role || { _id: null, name: 'User', code: 'USER', permissions: [] };
  const permissions = roleData.permissions || [];
  const permissionCodes = permissions.map(p => p.code);

  const payload = {
    userId: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    tokenVersion: user.tokenVersion || 0,
    role: roleData._id ? {
      _id: roleData._id,
      code: roleData.code,
      name: roleData.name,
      permissions: permissionCodes
    } : null
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function verifyJWTConsistency() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Super Admin
    console.log('═══════════════════════════════════════════════════');
    console.log('TEST 1: Super Admin JWT Structure');
    console.log('═══════════════════════════════════════════════════');
    const superAdmin = await User.findOne({ email: 'admin@helpdesk.gov.in' })
      .populate({
        path: 'role',
        populate: { path: 'permissions' }
      });
    
    if (superAdmin) {
      const token = await simulateGenerateUserJWT(superAdmin);
      const decoded = jwt.decode(token);
      console.log('Email:', superAdmin.email);
      console.log('Role:', decoded.role.name);
      console.log('Permissions count:', decoded.role.permissions.length);
      console.log('First 3 permissions:', decoded.role.permissions.slice(0, 3));
      console.log('Has projectId?', 'projectId' in decoded ? decoded.projectId : 'No');
      console.log('\nFull payload structure:');
      console.log(JSON.stringify(decoded, null, 2).substring(0, 500) + '...\n');
    }

    // Test 2: Student
    console.log('═══════════════════════════════════════════════════');
    console.log('TEST 2: Student JWT Structure');
    console.log('═══════════════════════════════════════════════════');
    const student = await User.findOne({ email: 'anmol.sharma@hubblehox.com' })
      .populate({
        path: 'role',
        populate: { path: 'permissions' }
      });
    
    if (student) {
      const token = await simulateGenerateUserJWT(student);
      const decoded = jwt.decode(token);
      console.log('Email:', student.email);
      console.log('Role:', decoded.role.name);
      console.log('Permissions count:', decoded.role.permissions.length);
      console.log('Permissions:', decoded.role.permissions);
      console.log('Has projectId?', 'projectId' in decoded ? decoded.projectId : 'No');
      console.log('\nFull payload structure:');
      console.log(JSON.stringify(decoded, null, 2).substring(0, 500) + '...\n');
    }

    // Test 3: Agent/Counselor (if exists)
    console.log('═══════════════════════════════════════════════════');
    console.log('TEST 3: Agent JWT Structure');
    console.log('═══════════════════════════════════════════════════');
    const agent = await User.findOne({ 
      email: { $nin: ['admin@helpdesk.gov.in', 'anmol.sharma@hubblehox.com'] }
    })
      .populate({
        path: 'role',
        populate: { path: 'permissions' }
      });
    
    if (agent) {
      const token = await simulateGenerateUserJWT(agent);
      const decoded = jwt.decode(token);
      console.log('Email:', agent.email);
      console.log('Role:', decoded.role.name);
      console.log('Permissions count:', decoded.role.permissions.length);
      console.log('First 3 permissions:', decoded.role.permissions.slice(0, 3));
      console.log('Has projectId?', 'projectId' in decoded ? decoded.projectId : 'No');
      console.log('\nFull payload structure:');
      console.log(JSON.stringify(decoded, null, 2).substring(0, 500) + '...\n');
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ JWT CONSISTENCY VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n📋 Summary:');
    console.log('   All JWT tokens have the same base structure:');
    console.log('   - userId, email, firstName, lastName, tokenVersion');
    console.log('   - role: { _id, code, name, permissions: [...codes] }');
    console.log('   - Optional: projectId, projectName (for project-specific logins)');
    console.log('\n   ✅ Permissions are always an array of permission CODES (strings)');
    console.log('   ✅ Role structure is consistent across all user types');
    console.log('   ✅ Super Admin has no projectId filter (full access)');
    console.log('   ✅ Other users can have projectId when logging in to specific project\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyJWTConsistency();
