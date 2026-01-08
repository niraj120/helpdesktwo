const mongoose = require('mongoose');

// Define schemas
const permissionSchema = new mongoose.Schema({
  code: String,
  name: String
}, { collection: 'permissions' });

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { collection: 'roles' });

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);

async function checkAndFixCounselor() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/student-assist-center', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to database\n');

    // Find Counselor role
    const counselorRole = await Role.findOne({ code: 'COUNSELOR' }).populate('permissions');
    
    if (!counselorRole) {
      console.log('❌ Counselor role not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('📊 Current Counselor Role Status:');
    console.log('Name:', counselorRole.name);
    console.log('Code:', counselorRole.code);
    console.log('Permissions count:', counselorRole.permissions?.length || 0);
    
    if (counselorRole.permissions && counselorRole.permissions.length > 0) {
      console.log('\n Current permissions:');
      counselorRole.permissions.forEach(p => {
        console.log(`   - ${p.code}: ${p.name}`);
      });
    } else {
      console.log('\n⚠️  NO PERMISSIONS - This is why User Management disappeared!');
    }

    // Expected Counselor permissions (all USER permissions except CREATE and DELETE)
    const expectedPermissionCodes = [
      // USER permissions (minus CREATE and DELETE as you wanted)
      'USER_VIEW_ALL',
      'USER_EDIT', 
      'USER_ASSIGN_ROLE',
      'USER_RESET_PASSWORD',
      'USER_MANAGE_GROUPS',
      'USER_IMPORT',
      'USER_TOGGLE_STATUS',
      
      // TICKET permissions
      'TICKET_VIEW_OWN',
      'TICKET_CREATE',
      'TICKET_CHANGE_STATUS',
      'TICKET_CHANGE_PRIORITY',
      'TICKET_ADD_COMMENT',
      'TICKET_ADD_ATTACHMENT',
      'TICKET_BULK_UPDATE',
      
      // OFFLINE permissions
      'OFFLINE_MODULE_ACCESS',
      'OFFLINE_STUDENT_REGISTER',
      'OFFLINE_TICKET_CREATE',
      'OFFLINE_TICKET_RESOLVE',
      'OFFLINE_TICKET_ESCALATE',
      'OFFLINE_STUDENT_VIEW',
      'OFFLINE_STUDENT_EDIT',
      
      // KNOWLEDGE BASE permission
      'KB_VIEW'
    ];

    console.log('\n\n📋 Expected Counselor permissions (24 total, excluding USER_CREATE and USER_DELETE):');
    expectedPermissionCodes.forEach(code => console.log(`   - ${code}`));

    // Find all these permissions in database
    const foundPermissions = await Permission.find({
      code: { $in: expectedPermissionCodes }
    });

    console.log(`\n✅ Found ${foundPermissions.length} / ${expectedPermissionCodes.length} expected permissions in database`);

    if (foundPermissions.length < expectedPermissionCodes.length) {
      const foundCodes = foundPermissions.map(p => p.code);
      const missing = expectedPermissionCodes.filter(code => !foundCodes.includes(code));
      console.log('⚠️  Missing permissions:', missing);
    }

    // Ask if we should fix
    console.log('\n\n❓ Do you want to update Counselor role with the correct permissions?');
    console.log('   (This will restore all Counselor permissions EXCEPT USER_CREATE and USER_DELETE)');
    console.log('\n   Type YES to proceed, anything else to cancel:');

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('> ', async (answer) => {
      if (answer.trim().toUpperCase() === 'YES') {
        // Update role with correct permissions
        counselorRole.permissions = foundPermissions.map(p => p._id);
        await counselorRole.save();
        
        console.log('\n✅ Successfully updated Counselor role!');
        console.log(`   Assigned ${foundPermissions.length} permissions`);
        
        // Verify
        const updated = await Role.findById(counselorRole._id).populate('permissions');
        console.log('\n📊 Updated Counselor permissions:');
        updated.permissions.forEach(p => {
          console.log(`   - ${p.code}`);
        });
      } else {
        console.log('\n❌ Update cancelled');
      }
      
      readline.close();
      await mongoose.disconnect();
      console.log('\n✅ Disconnected from database');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

checkAndFixCounselor();
