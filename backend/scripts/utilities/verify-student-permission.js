const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const studentRole = await Role.findOne({ code: 'STUDENT' }).lean();
    
    console.log('=== STUDENT ROLE ===');
    console.log('Role Code:', studentRole?.code);
    console.log('Permissions:', studentRole?.permissions);
    console.log('Has TICKET_VIEW_OWN:', studentRole?.permissions?.includes('TICKET_VIEW_OWN'));
    
    if (!studentRole?.permissions?.includes('TICKET_VIEW_OWN')) {
      console.log('\n❌ PROBLEM: Student role is missing TICKET_VIEW_OWN permission');
      console.log('Running fix...\n');
      
      const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
      const permission = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
      
      if (permission) {
        console.log('Found permission:', permission.code, permission._id.toString());
        studentRole.permissions.push('TICKET_VIEW_OWN');
        await Role.updateOne({ code: 'STUDENT' }, { permissions: studentRole.permissions });
        console.log('✅ Added TICKET_VIEW_OWN to Student role');
      }
    } else {
      console.log('\n✅ Student role HAS TICKET_VIEW_OWN permission');
    }
    
    console.log('\n=== NEXT STEPS ===');
    console.log('1. User MUST logout from student dashboard');
    console.log('2. User MUST login again to get new token');
    console.log('3. Old token does not have this permission');
    console.log('4. Only new tokens (after login) will work');
    
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
