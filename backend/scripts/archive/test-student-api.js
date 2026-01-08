const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({}, { strict: false, collection: 'tickets' });
const UserSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false, collection: 'users' });
const RoleSchema = new mongoose.Schema({}, { strict: false, strictPopulate: false, collection: 'roles' });
const PermissionSchema = new mongoose.Schema({}, { strict: false, collection: 'permissions' });

const Ticket = mongoose.model('Ticket', TicketSchema);
const User = mongoose.model('User', UserSchema);
const Role = mongoose.model('Role', RoleSchema);
const Permission = mongoose.model('Permission', PermissionSchema);

async function testStudentAPI() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    const studentEmail = 'htf.humanteamfoundation@gmail.com';
    
    // Simulate the API logic
    const user = await User.findOne({ email: studentEmail }).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 User found:', user.email);
    console.log('   Role ID:', user.role);

    // Get role and permissions
    const role = await Role.findById(user.role).populate('permissions');
    console.log('\n📋 Role:', role?.name, `(${role?.code})`);
    
    const permissions = role?.permissions || [];
    const permissionCodes = permissions.map(p => p.code);
    console.log('   Permissions:', permissionCodes.join(', '));

    const hasViewAll = permissionCodes.includes('TICKET_VIEW_ALL');
    const hasViewOwn = permissionCodes.includes('TICKET_VIEW_OWN');

    console.log(`\n🔍 Permission Check:`);
    console.log(`   TICKET_VIEW_ALL: ${hasViewAll}`);
    console.log(`   TICKET_VIEW_OWN: ${hasViewOwn}`);

    // Build query based on permissions (same logic as backend)
    let query = {};

    if (hasViewAll) {
      console.log('\n   → User has TICKET_VIEW_ALL: showing all tickets');
    } else if (hasViewOwn) {
      console.log('\n   → User has TICKET_VIEW_OWN: showing assigned tickets');
      query.assignedTo = user._id;
    } else {
      console.log('\n   → User is a student: showing tickets by email');
      query['metadata.studentEmail'] = user.email;
    }

    console.log('\n🔎 Query:', JSON.stringify(query, null, 2));

    const tickets = await Ticket.find(query).sort({ createdAt: -1 });

    console.log(`\n🎫 Tickets found: ${tickets.length}`);
    
    if (tickets.length > 0) {
      tickets.forEach((ticket, index) => {
        console.log(`\n   ${index + 1}. ${ticket.ticketNumber}`);
        console.log(`      Subject: ${ticket.subject || ticket.title || 'N/A'}`);
        console.log(`      Status: ${ticket.status}`);
        console.log(`      Priority: ${ticket.priority}`);
        console.log(`      metadata.studentEmail: ${ticket.metadata?.studentEmail}`);
        console.log(`      assignedTo: ${ticket.assignedTo || 'Unassigned'}`);
      });
    } else {
      console.log('\n   ⚠️  No tickets match the query criteria');
      
      // Check if there are any tickets with this email
      const allTicketsForEmail = await Ticket.find({ 'metadata.studentEmail': studentEmail });
      console.log(`\n   📊 Total tickets with studentEmail "${studentEmail}": ${allTicketsForEmail.length}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

testStudentAPI();
