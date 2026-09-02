require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }), 'roles');
    
    const email = 'niraj.mishra1010@gmail.com';
    
    const user = await User.findOne({ email }).lean();
    
    if (!user) {
      console.log(`❌ No account found for ${email}`);
      process.exit(0);
    }
    
    console.log('User Account Details:');
    console.log('='.repeat(50));
    console.log('Name:', user.firstName, user.lastName);
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    
    if (user.roleId) {
      const role = await Role.findById(user.roleId).lean();
      if (role) {
        console.log('\nRole Information:');
        console.log('Role Name:', role.name);
        console.log('Role Code:', role.code);
        console.log('Role Type:', role.type);
        console.log('Is Agent:', role.isAgent || false);
      }
    } else {
      console.log('\n❌ No role assigned to this user');
    }
    
    // Check if user has any tickets
    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }), 'tickets');
    
    const createdTickets = await Ticket.countDocuments({ 'metadata.studentEmail': email });
    const assignedTickets = await Ticket.countDocuments({ assignedTo: user._id });
    
    console.log('\nTicket Statistics:');
    console.log('Created tickets:', createdTickets);
    console.log('Assigned tickets:', assignedTickets);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
