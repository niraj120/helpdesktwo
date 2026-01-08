const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    
    // Find Student role directly from database
    const studentRole = await Role.findOne({ code: 'STUDENT' }).lean();
    
    console.log('=== STUDENT ROLE (RAW FROM DATABASE) ===');
    console.log('Role ID:', studentRole._id.toString());
    console.log('Role Code:', studentRole.code);
    console.log('Role Name:', studentRole.name);
    console.log('Permissions Array:', studentRole.permissions);
    console.log('Permissions Count:', studentRole.permissions?.length || 0);
    console.log('');
    
    if (studentRole.permissions && studentRole.permissions.length > 0) {
      console.log('=== PERMISSION DETAILS ===');
      studentRole.permissions.forEach((p, i) => {
        console.log(`Permission ${i}:`);
        console.log('  Type:', typeof p);
        console.log('  Value:', p);
        if (typeof p === 'object' && p._id) {
          console.log('  ObjectId:', p._id.toString());
        } else if (typeof p === 'object') {
          console.log('  ObjectId:', p.toString());
        }
        console.log('');
      });
    } else {
      console.log('❌ No permissions found in Student role!');
    }
    
    // Check what TICKET_VIEW_OWN permission ID should be
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    const ticketViewOwn = await Permission.findOne({ code: 'TICKET_VIEW_OWN' }).lean();
    
    console.log('=== TICKET_VIEW_OWN PERMISSION ===');
    console.log('Permission ID:', ticketViewOwn?._id.toString());
    console.log('Permission Code:', ticketViewOwn?.code);
    
    // Check if it exists in the role
    if (studentRole.permissions && ticketViewOwn) {
      const exists = studentRole.permissions.some(p => {
        const pStr = typeof p === 'string' ? p : (p._id || p).toString();
        return pStr === ticketViewOwn._id.toString();
      });
      console.log('\nExists in Student role:', exists ? '✅ YES' : '❌ NO');
    }
    
    mongoose.disconnect();
    console.log('\n✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
