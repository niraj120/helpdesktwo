const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sac_helpdesk')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const TicketSchema = new mongoose.Schema({}, { strict: false, collection: 'tickets' });

const User = mongoose.model('User', UserSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);

async function assignTicket() {
  try {
    // Find Priya Sharma (agent)
    const agent = await User.findOne({ 
      $or: [
        { name: /priya/i },
        { email: /priya/i }
      ]
    });

    if (!agent) {
      console.log('Agent not found. Available users:');
      const users = await User.find({}).select('name email role');
      console.log(JSON.stringify(users, null, 2));
      return;
    }

    console.log('Found agent:', {
      id: agent._id,
      name: agent.name,
      email: agent.email
    });

    // Find any unassigned ticket
    const ticket = await Ticket.findOne({
      $or: [
        { assignedTo: { $exists: false } },
        { assignedTo: null },
        { assignedTo: [] }
      ]
    });

    if (!ticket) {
      console.log('No unassigned tickets found. All tickets:');
      const allTickets = await Ticket.find({}).select('ticketNumber subject assignedTo status');
      console.log(JSON.stringify(allTickets, null, 2));
      
      // Assign the first ticket anyway
      const firstTicket = await Ticket.findOne({});
      if (firstTicket) {
        console.log('\nAssigning first available ticket...');
        firstTicket.assignedTo = agent._id;
        await firstTicket.save();
        console.log('✅ Ticket assigned successfully!');
        console.log('Ticket Number:', firstTicket.ticketNumber);
        console.log('Assigned to:', agent.name);
      }
      return;
    }

    console.log('Found ticket:', {
      id: ticket._id,
      number: ticket.ticketNumber,
      subject: ticket.subject
    });

    // Assign ticket to agent
    ticket.assignedTo = agent._id;
    await ticket.save();

    console.log('\n✅ Ticket assigned successfully!');
    console.log('Ticket Number:', ticket.ticketNumber);
    console.log('Assigned to:', agent.name, '(' + agent.email + ')');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

assignTicket();
