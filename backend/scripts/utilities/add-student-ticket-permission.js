const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    
    // Find Student role
    const studentRole = await Role.findOne({ code: 'STUDENT' });
    if (!studentRole) {
      console.log('❌ Student role not found');
      process.exit(1);
    }
    
    console.log('📋 Current Student role permissions:', studentRole.permissions);
    
    // Find TICKET_VIEW_OWN permission
    const permission = await Permission.findOne({ code: 'TICKET_VIEW_OWN' });
    if (!permission) {
      console.log('❌ TICKET_VIEW_OWN permission not found');
      process.exit(1);
    }
    
    console.log('🔑 TICKET_VIEW_OWN permission ID:', permission._id.toString());
    
    // Check if permission already exists in role
    const permissionExists = studentRole.permissions.some(p => {
      const pStr = typeof p === 'string' ? p : p.toString();
      return pStr === 'TICKET_VIEW_OWN' || pStr === permission._id.toString();
    });
    
    if (permissionExists) {
      console.log('✅ Student role already has TICKET_VIEW_OWN permission');
    } else {
      // Add permission to Student role (as string code, not ObjectId)
      studentRole.permissions.push('TICKET_VIEW_OWN');
      await studentRole.save();
      console.log('✅ Added TICKET_VIEW_OWN permission to Student role');
      console.log('📋 Updated permissions:', studentRole.permissions);
    }
    
    // Also increment tokenVersion to force re-login
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const result = await User.updateMany(
      { 'role.code': 'STUDENT' },
      { $inc: { tokenVersion: 1 } }
    );
    console.log(`🔄 Incremented tokenVersion for ${result.modifiedCount} student users`);
    console.log('⚠️  Students will need to re-login to get updated permissions');
    
    mongoose.disconnect();
    console.log('✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
