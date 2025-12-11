/**
 * Remove TICKET_CREATE permission from Student role
 * Students should use the public submit form, not the portal create form
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

mongoose.connect(MONGODB_URI);

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log('✅ Connected to MongoDB\n');

  try {
    const Permission = mongoose.connection.collection('permissions');
    const Role = mongoose.connection.collection('roles');

    // Find TICKET_CREATE permission
    const ticketCreatePerm = await Permission.findOne({ code: 'TICKET_CREATE' });
    
    if (!ticketCreatePerm) {
      console.log('❌ TICKET_CREATE permission not found!');
      process.exit(1);
    }

    console.log('✅ Found TICKET_CREATE permission:', ticketCreatePerm._id);

    // Find Student role
    const studentRole = await Role.findOne({ code: 'STUDENT' });
    
    if (!studentRole) {
      console.log('❌ Student role not found!');
      process.exit(1);
    }

    console.log(`📋 Student role current permissions: ${studentRole.permissions.length}`);

    // Check if TICKET_CREATE exists in student permissions
    const ticketCreateId = ticketCreatePerm._id.toString();
    const hasPermission = studentRole.permissions.some(p => p.toString() === ticketCreateId);

    if (!hasPermission) {
      console.log('✅ Student role does not have TICKET_CREATE permission (correct!)');
    } else {
      // Remove TICKET_CREATE from Student role
      const updatedPermissions = studentRole.permissions.filter(p => 
        p.toString() !== ticketCreateId
      );
      
      await Role.updateOne(
        { code: 'STUDENT' },
        { 
          $set: { 
            permissions: updatedPermissions,
            updatedAt: new Date()
          } 
        }
      );

      console.log('✅ Removed TICKET_CREATE permission from Student role');
      console.log(`📊 Total permissions now: ${updatedPermissions.length}`);
      console.log('\n📝 Students will no longer see "Create Query" submenu');
      console.log('   They should use the public "Submit Ticket" form instead\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
});
