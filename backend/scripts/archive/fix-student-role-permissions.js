const mongoose = require('mongoose');

async function checkStudentRolePermissions() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected\n');

    const UserSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false, collection: 'users' });
    const RoleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false, collection: 'roles' });
    const PermissionSchema = new mongoose.Schema({}, { strict: false, collection: 'permissions' });

    const User = mongoose.model('User', UserSchema);
    const Role = mongoose.model('Role', RoleSchema);
    const Permission = mongoose.model('Permission', PermissionSchema);

    const student = await User.findOne({ email: 'htf.humanteamfoundation@gmail.com' });
    console.log('👤 Student:', student.email);
    console.log('   Role ID:', student.role);

    const role = await Role.findById(student.role).populate('permissions');
    console.log('\n📋 Role:', role.name, `(${role.code})`);
    console.log('   Permissions:');
    
    if (role.permissions && role.permissions.length > 0) {
      role.permissions.forEach(p => {
        console.log(`   - ${p.code}: ${p.name}`);
      });
    } else {
      console.log('   (No permissions)');
    }

    // Check specific permissions
    const permCodes = role.permissions ? role.permissions.map(p => p.code) : [];
    console.log('\n🔍 Checking key permissions:');
    console.log(`   TICKET_VIEW_ALL: ${permCodes.includes('TICKET_VIEW_ALL')}`);
    console.log(`   TICKET_VIEW_OWN: ${permCodes.includes('TICKET_VIEW_OWN')}`);

    // Fix: Remove TICKET_VIEW_OWN from Student role if it exists
    if (permCodes.includes('TICKET_VIEW_OWN')) {
      console.log('\n⚠️  STUDENT role has TICKET_VIEW_OWN permission - this is incorrect!');
      console.log('   Students should see tickets by metadata.studentEmail, not assignedTo');
      
      const viewOwnPerm = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
      if (viewOwnPerm) {
        role.permissions = role.permissions.filter(p => p.code !== 'TICKET_VIEW_OWN');
        await role.save();
        console.log('✅ Removed TICKET_VIEW_OWN from Student role');
      }
    } else {
      console.log('\n✅ Student role correctly has NO TICKET_VIEW_OWN permission');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkStudentRolePermissions();
