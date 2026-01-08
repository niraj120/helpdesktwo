const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE_URL = 'http://localhost:3003/api';
const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';

async function testWithDirectToken() {
  try {
    const mongoose = require('mongoose');
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    
    const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
    const User = mongoose.model('User', UserSchema);
    
    const student = await User.findOne({ email: 'htf.humanteamfoundation@gmail.com' });
    
    if (!student) {
      console.log('❌ Student not found');
      mongoose.connection.close();
      return;
    }

    console.log('🧪 Testing Student Ticket Viewing\n');
    console.log('=' .repeat(60));
    console.log('\n👤 Student Info:');
    console.log(`   ID: ${student._id}`);
    console.log(`   Email: ${student.email}`);
    console.log(`   Role: ${student.role}`);
    
    // Generate token directly
    const token = jwt.sign(
      { userId: student._id.toString(), email: student.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log(`\n🔑 Generated Token: ${token.substring(0, 30)}...`);

    // Test API call
    console.log('\n📋 Fetching tickets...');
    
    const ticketsResponse = await axios.get(`${API_BASE_URL}/tickets/my-tickets`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('\n📊 API Response:');
    console.log(`   Success: ${ticketsResponse.data.success}`);
    console.log(`   Tickets Found: ${ticketsResponse.data.data?.length || 0}`);

    if (ticketsResponse.data.data && ticketsResponse.data.data.length > 0) {
      console.log('\n🎫 Tickets:');
      ticketsResponse.data.data.forEach((ticket, index) => {
        console.log(`\n   ${index + 1}. ${ticket.ticketNumber}`);
        console.log(`      Subject: ${ticket.subject || ticket.title || 'N/A'}`);
        console.log(`      Status: ${ticket.status}`);
        console.log(`      Priority: ${ticket.priority}`);
      });
      console.log('\n' + '='.repeat(60));
      console.log('✅ TEST PASSED: Student can see their tickets!');
      console.log('='.repeat(60));
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('❌ TEST FAILED: No tickets returned');
      console.log('='.repeat(60));
    }

    mongoose.connection.close();

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TEST FAILED WITH ERROR:');
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${error.response.data?.message || error.response.data?.error}`);
    } else {
      console.log(`   Error: ${error.message}`);
    }
    console.log('='.repeat(60));
    process.exit(1);
  }
}

testWithDirectToken();
