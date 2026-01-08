const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

async function updateStudentRolePermissions() {
  try {
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    
    // Find STUDENT role
    const studentRole = await Role.findOne({ code: 'STUDENT' });
    
    if (!studentRole) {
      console.log('❌ STUDENT role not found!');
      process.exit(1);
    }
    
    console.log('✅ Found STUDENT role');
    
    // Find all required permissions
    const requiredPermissionCodes = [
      'TICKET_VIEW_OWN',
      'TICKET_CREATE',
      'TICKET_ADD_COMMENT',
      'TICKET_ADD_ATTACHMENT',
    ];
    
    const permissions = await Permission.find({
      code: { $in: requiredPermissionCodes }
    });
    
    console.log(`✅ Found ${permissions.length} permissions`);
    permissions.forEach(p => console.log(`   - ${p.code}: ${p.name}`));
    
    // Update role permissions
    studentRole.permissions = permissions.map(p => p._id);
    await studentRole.save();
    
    console.log('\n✅ Updated STUDENT role with permissions');
    
    // Find student user and ensure they have the role
    const studentUser = await User.findOne({ email: /anmol\.sharma|student/i });
    
    if (studentUser) {
      console.log(`\n👨‍🎓 Found student user: ${studentUser.email}`);
      
      // Check if user has correct role
      if (!studentUser.role || studentUser.role.toString() !== studentRole._id.toString()) {
        studentUser.role = studentRole._id;
        // Increment tokenVersion to force new login
        studentUser.tokenVersion = (studentUser.tokenVersion || 0) + 1;
        await studentUser.save();
        console.log('✅ Assigned STUDENT role to user');
        console.log('✅ Incremented tokenVersion - user must re-login');
      } else {
        console.log('✅ User already has STUDENT role');
        // Still increment token version to force re-login with new permissions
        studentUser.tokenVersion = (studentUser.tokenVersion || 0) + 1;
        await studentUser.save();
        console.log('✅ Incremented tokenVersion - user must re-login');
      }
      
      console.log(`   Token Version: ${studentUser.tokenVersion}`);
    } else {
      console.log('\nℹ️  No student user found');
    }
    
    console.log('\n✨ Update complete!');
    console.log('\n⚠️  Students must logout and login again to get new permissions');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

updateStudentRolePermissions();
