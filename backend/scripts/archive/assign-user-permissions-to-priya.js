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

async function assignUserPermissionsToPriya() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    // Find Priya Sharma
    const priya = await User.findOne({ email: 'priya.sharma@sac.gov.in' }).populate('role');
    if (!priya) {
      console.log('❌ Priya Sharma not found');
      return;
    }
    console.log(`📌 Found user: ${priya.firstName} ${priya.lastName} (${priya.email})`);
    console.log(`   Current role: ${priya.role?.name || 'No role'}\n`);

    // Find or create a custom role for Priya to test individual permissions
    let testRole = await Role.findOne({ code: 'PRIYA_TEST_ROLE' });
    
    if (!testRole) {
      testRole = new Role({
        name: 'Priya Test Role',
        code: 'PRIYA_TEST_ROLE',
        description: 'Custom role for testing individual User Management permissions',
        permissions: []
      });
      await testRole.save();
      console.log('✅ Created new test role: Priya Test Role\n');
    } else {
      console.log('📌 Using existing test role: Priya Test Role\n');
    }

    // Get all User Management permissions
    const userManagementPermissions = [
      'DASHBOARD_VIEW',  // Add dashboard access
      'USER_VIEW_ALL',
      'USER_CREATE',
      'USER_EDIT',
      'USER_DELETE',
      'USER_TOGGLE_STATUS',
      'USER_ASSIGN_ROLE',
      'USER_RESET_PASSWORD',
      'USER_IMPORT'
    ];

    console.log('🔍 Finding User Management permissions...\n');
    const permissions = await Permission.find({ code: { $in: userManagementPermissions } });

    console.log('📋 User Management Permissions to assign:\n');
    permissions.forEach((perm, index) => {
      console.log(`   ${index + 1}. ${perm.code}`);
      console.log(`      Name: ${perm.name}`);
      console.log(`      Description: ${perm.description}`);
      console.log('');
    });

    // Assign permissions to test role
    testRole.permissions = permissions.map(p => p._id);
    await testRole.save();
    console.log(`✅ Assigned ${permissions.length} permissions to test role\n`);

    // Assign test role to Priya
    priya.role = testRole._id;
    await priya.save();
    console.log(`✅ Assigned test role to Priya Sharma\n`);

    // Verify the assignment
    const updatedPriya = await User.findById(priya._id).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    });

    console.log('✅ VERIFICATION:\n');
    console.log(`   User: ${updatedPriya.firstName} ${updatedPriya.lastName}`);
    console.log(`   Email: ${updatedPriya.email}`);
    console.log(`   Role: ${updatedPriya.role.name} (${updatedPriya.role.code})`);
    console.log(`   Total Permissions: ${updatedPriya.role.permissions.length}\n`);

    console.log('📋 Assigned Permissions:\n');
    updatedPriya.role.permissions.forEach((perm, index) => {
      console.log(`   ${index + 1}. ${perm.code} - ${perm.name}`);
    });

    console.log('\n\n🎯 TESTING GUIDE:');
    console.log('=====================================\n');
    console.log('Login with Priya Sharma\'s credentials:');
    console.log('   Email: priya.sharma@sac.gov.in');
    console.log('   Password: Agent@123\n');

    console.log('Navigate to User Management (/users) and verify:\n');

    console.log('✅ USER_VIEW_ALL:');
    console.log('   - Should see "Users" menu item in sidebar');
    console.log('   - Can access /users page');
    console.log('   - Can view list of all users\n');

    console.log('✅ USER_CREATE:');
    console.log('   - Should see "Add User" button at top');
    console.log('   - Can click to open create user modal');
    console.log('   - Can fill form and create new user\n');

    console.log('✅ USER_EDIT:');
    console.log('   - Should see edit icon (pencil) next to each user');
    console.log('   - Can click edit to open edit user modal');
    console.log('   - Can modify user details and save\n');

    console.log('✅ USER_DELETE:');
    console.log('   - Should see delete icon (trash) next to each user');
    console.log('   - Can click delete and confirm deletion');
    console.log('   - User should be removed from list\n');

    console.log('✅ USER_TOGGLE_STATUS:');
    console.log('   - Should see activate/deactivate button');
    console.log('   - Can toggle user status (Active ↔ Inactive)');
    console.log('   - Status badge should update\n');

    console.log('✅ USER_ASSIGN_ROLE:');
    console.log('   - In edit user modal, can see role dropdown');
    console.log('   - Can change user\'s role');
    console.log('   - Role should update on save\n');

    console.log('✅ USER_RESET_PASSWORD:');
    console.log('   - Should see "Reset Password" button for each user');
    console.log('   - Can click to open reset password modal');
    console.log('   - Can generate new password\n');

    console.log('✅ USER_IMPORT:');
    console.log('   - Should see "Import Users" button');
    console.log('   - Can upload CSV file with user data');
    console.log('   - Bulk users should be created\n');

    console.log('=====================================\n');
    console.log('💡 To test individual permissions, run:');
    console.log('   node test-single-permission.js <PERMISSION_CODE>\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

assignUserPermissionsToPriya();
