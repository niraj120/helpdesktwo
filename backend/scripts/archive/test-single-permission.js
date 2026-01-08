const mongoose = require('mongoose');

// Define schemas
const permissionSchema = new mongoose.Schema({
  module: String,
  name: String,
  code: { type: String, unique: true },
  description: String,
  category: String,
});

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  description: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
});

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
});

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);
const User = mongoose.model('User', userSchema);

// Get permission code from command line
const permissionCode = process.argv[2];

async function assignSinglePermission() {
  try {
    if (!permissionCode) {
      console.log('❌ Please provide a permission code');
      console.log('Usage: node test-single-permission.js <PERMISSION_CODE>\n');
      console.log('Available User Management permissions:');
      console.log('  - USER_VIEW_ALL');
      console.log('  - USER_CREATE');
      console.log('  - USER_EDIT');
      console.log('  - USER_DELETE');
      console.log('  - USER_TOGGLE_STATUS');
      console.log('  - USER_ASSIGN_ROLE');
      console.log('  - USER_RESET_PASSWORD');
      console.log('  - USER_IMPORT');
      return;
    }

    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    // Find Priya Sharma
    const priya = await User.findOne({ email: 'priya.sharma@sac.gov.in' }).populate('role');
    if (!priya) {
      console.log('❌ Priya Sharma not found');
      return;
    }

    // Find or create a single-permission test role
    let testRole = await Role.findOne({ code: 'PRIYA_SINGLE_PERMISSION_TEST' });
    
    if (!testRole) {
      testRole = new Role({
        name: 'Priya Single Permission Test',
        code: 'PRIYA_SINGLE_PERMISSION_TEST',
        description: 'Test role with only one permission at a time',
        permissions: []
      });
      await testRole.save();
    }

    // Find the requested permission
    const permission = await Permission.findOne({ code: permissionCode });
    if (!permission) {
      console.log(`❌ Permission "${permissionCode}" not found`);
      return;
    }

    console.log(`📌 Found permission: ${permission.name}`);
    console.log(`   Code: ${permission.code}`);
    console.log(`   Module: ${permission.module}`);
    console.log(`   Description: ${permission.description}\n`);

    // Assign only this permission to the role
    testRole.permissions = [permission._id];
    await testRole.save();

    // Assign role to Priya
    priya.role = testRole._id;
    await priya.save();

    console.log(`✅ Assigned ONLY "${permissionCode}" to Priya Sharma\n`);

    console.log('🎯 TEST THIS PERMISSION:\n');
    console.log('1. Login as Priya Sharma (priya.sharma@sac.gov.in / Agent@123)');
    console.log('2. Navigate to User Management (/users)\n');

    // Provide specific test instructions based on permission
    const testInstructions = {
      'USER_VIEW_ALL': [
        '✅ Expected: Can see Users menu item and access /users page',
        '✅ Expected: Can view list of all users',
        '❌ Should NOT see: Add User, Edit, Delete buttons (no other permissions)'
      ],
      'USER_CREATE': [
        '✅ Expected: Can see "Add User" button',
        '✅ Expected: Can click and open create user modal',
        '✅ Expected: Can fill form and create new user',
        '⚠️ Note: Needs USER_VIEW_ALL to access the page first'
      ],
      'USER_EDIT': [
        '✅ Expected: Can see edit icon (pencil) next to each user',
        '✅ Expected: Can click to open edit modal',
        '✅ Expected: Can modify and save changes',
        '⚠️ Note: Needs USER_VIEW_ALL to access the page first'
      ],
      'USER_DELETE': [
        '✅ Expected: Can see delete icon (trash) next to each user',
        '✅ Expected: Can click and confirm deletion',
        '✅ Expected: User gets removed from list',
        '⚠️ Note: Needs USER_VIEW_ALL to access the page first'
      ],
      'USER_TOGGLE_STATUS': [
        '✅ Expected: Can see activate/deactivate toggle',
        '✅ Expected: Can switch user status (Active ↔ Inactive)',
        '✅ Expected: Status badge updates after toggle',
        '⚠️ Note: Needs USER_VIEW_ALL to access the page first'
      ],
      'USER_ASSIGN_ROLE': [
        '✅ Expected: In edit modal, can see role dropdown',
        '✅ Expected: Can change user\'s role',
        '✅ Expected: Role updates on save',
        '⚠️ Note: Needs USER_VIEW_ALL and USER_EDIT to access edit modal'
      ],
      'USER_RESET_PASSWORD': [
        '✅ Expected: Can see "Reset Password" button',
        '✅ Expected: Can click to open reset password modal',
        '✅ Expected: Can generate/set new password',
        '⚠️ Note: Needs USER_VIEW_ALL to access the page first'
      ],
      'USER_IMPORT': [
        '✅ Expected: Can see "Import Users" button',
        '✅ Expected: Can upload CSV file',
        '✅ Expected: Bulk users get created',
        '⚠️ Note: Needs USER_VIEW_ALL to access the page first'
      ]
    };

    const instructions = testInstructions[permissionCode];
    if (instructions) {
      instructions.forEach(inst => console.log(`   ${inst}`));
    } else {
      console.log(`   ⚠️ No specific test instructions for ${permissionCode}`);
    }

    console.log('\n=====================================');
    console.log('💡 To test with ALL User Management permissions, run:');
    console.log('   node assign-user-permissions-to-priya.js\n');

    console.log('💡 To test a different permission, run:');
    console.log('   node test-single-permission.js <PERMISSION_CODE>\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
}

assignSinglePermission();
