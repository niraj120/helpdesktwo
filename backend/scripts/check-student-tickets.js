const mongoose = require('mongoose');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }), 'tickets');
    
    const email = 'niraj10101996@gmail.com';
    
    // Search by metadata.studentEmail
    const tickets = await Ticket.find({ 'metadata.studentEmail': email }).lean();
    
    console.log(`\nTickets for ${email}:`);
    console.log(`Found ${tickets.length} tickets\n`);
    
    tickets.forEach((ticket, index) => {
      console.log(`${index + 1}. Ticket #${ticket.ticketNumber || 'N/A'}`);
      console.log(`   Title: ${ticket.title || 'N/A'}`);
      console.log(`   Status: ${ticket.status || 'N/A'}`);
      console.log(`   Priority: ${ticket.priority || 'N/A'}`);
      console.log(`   Created: ${ticket.createdAt || 'N/A'}`);
      console.log(`   Project ID: ${ticket.projectId || 'N/A'}`);
      console.log(`   Student Email: ${ticket.metadata?.studentEmail || 'N/A'}`);
      console.log(`   Student Name: ${ticket.metadata?.studentName || 'N/A'}`);
      console.log('');
    });
    
    // Also check user account
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }), 'roles');
    
    const user = await User.findOne({ email }).lean();
    
    if (user) {
      console.log('\nUser Account:');
      console.log('- Name:', user.firstName, user.lastName);
      console.log('- Email:', user.email);
      
      if (user.roleId) {
        const role = await Role.findById(user.roleId).lean();
        console.log('- Role:', role?.name, '(', role?.code, ')');
      }
    } else {
      console.log('\n❌ No user account found for this email');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
