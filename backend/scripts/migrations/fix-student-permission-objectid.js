const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    
    // Find Student role
    const studentRole = await Role.findOne({ code: 'STUDENT' });
    if (!studentRole) {
      console.log('❌ Student role not found');
      process.exit(1);
    }
    
    console.log('=== STUDENT ROLE (BEFORE) ===');
    console.log('Permissions:', studentRole.permissions);
    console.log('Type of first permission:', typeof studentRole.permissions[0]);
    
    // Find TICKET_VIEW_OWN permission
    const permission = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
    if (!permission) {
      console.log('❌ TICKET_VIEW_OWN permission not found in database');
      process.exit(1);
    }
    
    console.log('\n=== TICKET_VIEW_OWN PERMISSION ===');
    console.log('Permission ID:', permission._id.toString());
    console.log('Permission Code:', permission.code);
    
    // Remove any string 'TICKET_VIEW_OWN' that was incorrectly added
    studentRole.permissions = studentRole.permissions.filter(p => {
      const isString = typeof p === 'string';
      if (isString && p === 'TICKET_VIEW_OWN') {
        console.log('\n⚠️  Found incorrect string permission, removing...');
        return false;
      }
      return true;
    });
    
    // Check if ObjectId already exists
    const permissionExists = studentRole.permissions.some(p => {
      const pId = p._id || p;
      return pId.toString() === permission._id.toString();
    });
    
    if (!permissionExists) {
      // Add as ObjectId reference
      studentRole.permissions.push(permission._id);
      console.log('✅ Added TICKET_VIEW_OWN permission as ObjectId');
    } else {
      console.log('✅ TICKET_VIEW_OWN permission already exists as ObjectId');
    }
    
    await studentRole.save();
    
    console.log('\n=== STUDENT ROLE (AFTER) ===');
    console.log('Permissions:', studentRole.permissions);
    console.log('Permission count:', studentRole.permissions.length);
    
    // Verify by checking if the permission ObjectId exists
    const hasPermission = studentRole.permissions.some(p => {
      const pId = p._id || p;
      return pId.toString() === permission._id.toString();
    });
    console.log('\nHas TICKET_VIEW_OWN ObjectId:', hasPermission ? '✅ YES' : '❌ NO');
    
    if (hasPermission) {
      // Increment token version for all students to force re-login
      const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
      const result = await User.updateMany(
        { email: 'anmol.sharma@hubblehox.com' },
        { $inc: { tokenVersion: 1 } }
      );
      
      console.log(`\n🔄 Incremented tokenVersion for ${result.modifiedCount} user(s)`);
      console.log('\n📋 NEXT STEPS:');
      console.log('1. Refresh the student dashboard page');
      console.log('2. User will be logged out (token invalidated)');
      console.log('3. Login again as anmol.sharma@hubblehox.com');
      console.log('4. New token will have TICKET_VIEW_OWN permission (as ObjectId)');
      console.log('5. Tickets will load successfully');
    }
    
    mongoose.disconnect();
    console.log('\n✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
