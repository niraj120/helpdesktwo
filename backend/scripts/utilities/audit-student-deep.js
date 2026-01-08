const mongoose = require('mongoose');
require('dotenv').config();

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  tokenVersion: Number
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

async function auditStudent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('=== DEEP AUDIT: STUDENT USER ===\n');

    // Find student user with full population
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

    console.log('1️⃣ USER INFORMATION:');
    console.log(`   Name: ${student.firstName} ${student.lastName}`);
    console.log(`   Email: ${student.email}`);
    console.log(`   User ID: ${student._id}`);
    console.log(`   Token Version: ${student.tokenVersion}`);
    console.log(`   Role ID: ${student.role ? student.role._id : 'NULL'}`);
    console.log(`   Role Type: ${typeof student.role}`);

    if (!student.role) {
      console.log('\n❌ CRITICAL: User has NO ROLE assigned!');
      process.exit(1);
    }

    console.log('\n2️⃣ ROLE INFORMATION:');
    console.log(`   Role Name: ${student.role.name}`);
    console.log(`   Role Code: ${student.role.code}`);
    console.log(`   Role Type: ${student.role.type}`);
    console.log(`   Permissions Count: ${student.role.permissions ? student.role.permissions.length : 0}`);
    console.log(`   Permissions Type: ${typeof student.role.permissions}`);
    console.log(`   Is Array: ${Array.isArray(student.role.permissions)}`);

    if (!student.role.permissions || student.role.permissions.length === 0) {
      console.log('\n❌ CRITICAL: Role has NO PERMISSIONS!');
      
      // Let's check the role directly
      const roleCheck = await Role.findById(student.role._id).populate('permissions');
      console.log('\n🔍 Direct Role Check:');
      console.log(`   Permissions: ${roleCheck.permissions.length}`);
      if (roleCheck.permissions.length > 0) {
        console.log('   Permission Objects:');
        roleCheck.permissions.forEach(p => {
          console.log(`      - ${p.code}: ${p.name} (ID: ${p._id})`);
        });
      }
    } else {
      console.log('\n3️⃣ ASSIGNED PERMISSIONS:');
      student.role.permissions.forEach((perm, index) => {
        if (typeof perm === 'object' && perm.code) {
          console.log(`   ${index + 1}. ${perm.code} - ${perm.name}`);
          console.log(`      ID: ${perm._id}`);
        } else {
          console.log(`   ${index + 1}. Permission is not populated: ${perm}`);
        }
      });

      // Check for TICKET_VIEW_OWN specifically
      const hasTicketViewOwn = student.role.permissions.some(p => 
        (typeof p === 'object' && p.code === 'TICKET_VIEW_OWN') ||
        p.toString() === '69133e04cdf807d363168a76'
      );
      
      console.log(`\n4️⃣ PERMISSION CHECK:`);
      console.log(`   Has TICKET_VIEW_OWN: ${hasTicketViewOwn ? '✅ YES' : '❌ NO'}`);

      if (!hasTicketViewOwn) {
        console.log('\n❌ CRITICAL: Missing TICKET_VIEW_OWN permission!');
        
        // Find the permission
        const ticketViewOwn = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
        if (ticketViewOwn) {
          console.log(`\n   TICKET_VIEW_OWN exists in DB:`);
          console.log(`   ID: ${ticketViewOwn._id}`);
          console.log(`   Code: ${ticketViewOwn.code}`);
          console.log(`   Name: ${ticketViewOwn.name}`);
        }
      }
    }

    console.log('\n5️⃣ TOKEN INFORMATION:');
    console.log(`   Current tokenVersion: ${student.tokenVersion}`);
    console.log(`   ⚠️  User MUST logout and login again to get updated JWT token`);
    console.log(`   ⚠️  Old tokens (version < ${student.tokenVersion}) will be rejected`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

auditStudent();
