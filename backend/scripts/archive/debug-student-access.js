const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({}, { strict: false, collection: 'tickets' });
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const RoleSchema = new mongoose.Schema({}, { strict: false, collection: 'roles' });

const Ticket = mongoose.model('Ticket', TicketSchema);
const User = mongoose.model('User', UserSchema);
const Role = mongoose.model('Role', RoleSchema);

async function debugStudentAccess() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    const studentEmail = 'htf.humanteamfoundation@gmail.com';
    
    // Find the student
    const student = await User.findOne({ email: studentEmail }).populate('role');
    if (!student) {
      console.log('❌ Student not found');
      return;
    }

    console.log('👤 Student Details:');
    console.log(`   ID: ${student._id}`);
    console.log(`   Email: ${student.email}`);
    console.log(`   Role ID: ${student.role}`);
    console.log(`   requirePasswordSetup: ${student.requirePasswordSetup}`);
    console.log(`   isActive: ${student.isActive}`);

    // Get role details
    const role = await Role.findById(student.role).populate('permissions');
    console.log(`\n📋 Role Details:`);
    console.log(`   Name: ${role?.name}`);
    console.log(`   Code: ${role?.code}`);
    console.log(`   Permissions: ${role?.permissions?.map(p => p.code).join(', ') || 'None'}`);

    // Query tickets the way the API does
    const query = { 'metadata.studentEmail': student.email };
    console.log(`\n🔍 Query: ${JSON.stringify(query)}`);

    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    console.log(`\n🎫 Tickets found: ${tickets.length}`);
    
    tickets.forEach((ticket, index) => {
      console.log(`\n   ${index + 1}. Ticket: ${ticket.ticketNumber}`);
      console.log(`      Subject: ${ticket.subject || ticket.title || 'N/A'}`);
      console.log(`      Description: ${(ticket.description || '').substring(0, 50)}...`);
      console.log(`      Status: ${ticket.status}`);
      console.log(`      Priority: ${ticket.priority}`);
      console.log(`      Created: ${ticket.createdAt}`);
      console.log(`      metadata.studentEmail: ${ticket.metadata?.studentEmail}`);
      console.log(`      metadata.projectId: ${ticket.metadata?.projectId}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

debugStudentAccess();
