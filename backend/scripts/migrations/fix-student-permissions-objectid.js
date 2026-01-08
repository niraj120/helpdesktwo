require('dotenv').config();
const mongoose = require('mongoose');

// Define schemas
const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.Mixed }], // Accept both String and ObjectId
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

async function fixStudentPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Student role
    const studentRole = await Role.findOne({ code: 'STUDENT' });
    
    if (!studentRole) {
      console.log('❌ Student role not found!');
      process.exit(1);
    }

    console.log('=== CURRENT STUDENT ROLE ===');
    console.log('ID:', studentRole._id);
    console.log('Name:', studentRole.name);
    console.log('Permissions (RAW):', studentRole.permissions);
    console.log('Permission types:', studentRole.permissions.map(p => typeof p));

    // Find TICKET_VIEW_OWN permission
    const ticketViewOwnPerm = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
    
    if (!ticketViewOwnPerm) {
      console.log('❌ TICKET_VIEW_OWN permission not found!');
      process.exit(1);
    }

    console.log('\n=== TICKET_VIEW_OWN PERMISSION ===');
    console.log('ID:', ticketViewOwnPerm._id);
    console.log('ID type:', typeof ticketViewOwnPerm._id);
    console.log('Code:', ticketViewOwnPerm.code);

    // Check if any permissions are strings
    const hasStringPermissions = studentRole.permissions.some(p => typeof p === 'string');
    
    if (hasStringPermissions) {
      console.log('\n⚠️  PROBLEM DETECTED: Permissions stored as STRINGS!');
      console.log('Converting to ObjectId references...\n');

      // Convert all string permissions to ObjectIds
      const fixedPermissions = [];
      
      for (const perm of studentRole.permissions) {
        if (typeof perm === 'string') {
          // It's a string, try to convert to ObjectId
          try {
            const objectId = new mongoose.Types.ObjectId(perm);
            fixedPermissions.push(objectId);
            console.log(`✅ Converted string "${perm}" to ObjectId`);
          } catch (err) {
            console.log(`❌ Failed to convert "${perm}" - invalid ObjectId format`);
          }
        } else {
          // Already an ObjectId
          fixedPermissions.push(perm);
          console.log(`✅ Kept ObjectId ${perm}`);
        }
      }

      // Update the role with fixed permissions
      await Role.findByIdAndUpdate(studentRole._id, {
        $set: { permissions: fixedPermissions }
      });

      console.log('\n✅ Student role permissions FIXED!');
      
      // Verify the fix
      const updatedRole = await Role.findById(studentRole._id);
      console.log('\n=== UPDATED STUDENT ROLE ===');
      console.log('Permissions (RAW):', updatedRole.permissions);
      console.log('Permission types:', updatedRole.permissions.map(p => typeof p));
      
    } else {
      console.log('\n✅ All permissions are already ObjectId references!');
    }

    // Final verification
    const finalRole = await Role.findById(studentRole._id).populate('permissions');
    console.log('\n=== FINAL VERIFICATION ===');
    console.log('Populated permissions:');
    if (finalRole.permissions && finalRole.permissions.length > 0) {
      finalRole.permissions.forEach(perm => {
        console.log(`  - ${perm.code}: ${perm.name} (${perm._id})`);
      });
    }

    console.log('\n✅ Done! Student can now login and view tickets.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixStudentPermissions();
