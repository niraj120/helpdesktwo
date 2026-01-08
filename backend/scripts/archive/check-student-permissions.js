const mongoose = require('mongoose');

async function checkStudentPermissions() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    
    const UserSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false, collection: 'users' });
    const RoleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false, collection: 'roles' });
    const User = mongoose.model('User', UserSchema);
    const Role = mongoose.model('Role', RoleSchema);

    const student = await User.findOne({ email: 'htf.humanteamfoundation@gmail.com' }).populate({
      path: 'role',
      populate: {
        path: 'permissions'
      }
    });

    console.log('👤 Student:', student.email);
    console.log('📋 Role ID:', student.role._id);
    console.log('📋 Role Name:', student.role.name);
    console.log('📋 Role Code:', student.role.code);
    console.log('\n🔑 Permissions:');
    student.role.permissions.forEach(p => {
      console.log(`   - ${p.code}: ${p.name}`);
    });

    const hasViewAll = student.role.permissions.some(p => p.code === 'TICKET_VIEW_ALL');
    const hasViewOwn = student.role.permissions.some(p => p.code === 'TICKET_VIEW_OWN');

    console.log(`\n✅ Has TICKET_VIEW_ALL: ${hasViewAll}`);
    console.log(`✅ Has TICKET_VIEW_OWN: ${hasViewOwn}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkStudentPermissions();
