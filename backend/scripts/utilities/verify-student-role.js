require('dotenv').config();
const mongoose = require('mongoose');

// Define Role schema directly
const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  isMaster: Boolean,
  roleType: String,
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }]
});

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String,
  module: String
});

const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function verifyStudentRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Student role
    const studentRole = await Role.findOne({ code: 'STUDENT' })
      .populate('permissions');
    
    if (!studentRole) {
      console.log('❌ Student role not found!');
      return;
    }

    console.log('=== STUDENT ROLE DETAILS ===');
    console.log('ID:', studentRole._id);
    console.log('Name:', studentRole.name);
    console.log('Code:', studentRole.code);
    console.log('isMaster:', studentRole.isMaster);
    console.log('roleType:', studentRole.roleType);
    console.log('\nPermissions:');
    
    if (studentRole.permissions && studentRole.permissions.length > 0) {
      studentRole.permissions.forEach((perm) => {
        console.log(`  - ${perm.code} (${perm.name})`);
      });
    } else {
      console.log('  NO PERMISSIONS');
    }

    // Find TICKET_VIEW_OWN permission
    const ticketViewOwnPerm = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
    
    console.log('\n=== TICKET_VIEW_OWN PERMISSION ===');
    console.log('ID:', ticketViewOwnPerm?._id);
    console.log('Code:', ticketViewOwnPerm?.code);
    console.log('Name:', ticketViewOwnPerm?.name);

    // Check if Student role has TICKET_VIEW_OWN
    const hasPermission = studentRole.permissions.some(
      (p) => p._id.toString() === ticketViewOwnPerm._id.toString()
    );

    console.log('\n=== VERIFICATION ===');
    console.log('Student has TICKET_VIEW_OWN:', hasPermission ? '✅ YES' : '❌ NO');
    console.log('Student is modifiable:', !studentRole.isMaster ? '✅ YES' : '❌ NO (System Role)');

    // If Student role is missing permission or is master, fix it
    if (!hasPermission || studentRole.isMaster) {
      console.log('\n=== FIXING STUDENT ROLE ===');
      
      const updates = {};
      if (!hasPermission) {
        updates.permissions = [...studentRole.permissions.map(p => p._id), ticketViewOwnPerm._id];
        console.log('Adding TICKET_VIEW_OWN permission...');
      }
      if (studentRole.isMaster) {
        updates.isMaster = false;
        updates.roleType = 'custom';
        console.log('Changing Student role to custom (non-master)...');
      }

      await Role.findByIdAndUpdate(studentRole._id, updates);
      console.log('✅ Student role updated successfully!');
    }

    console.log('\n✅ Done');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyStudentRole();
