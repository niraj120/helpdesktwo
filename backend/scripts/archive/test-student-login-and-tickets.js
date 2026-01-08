const axios = require('axios');

const API_BASE_URL = 'http://localhost:3003/api';
const studentEmail = 'htf.humanteamfoundation@gmail.com';

async function testStudentFlow() {
  try {
    console.log('🧪 Testing Student Login and Ticket Viewing Flow\n');
    console.log('=' .repeat(60));

    // Step 1: Login as student
    console.log('\n📝 Step 1: Logging in as student...');
    console.log(`   Email: ${studentEmail}`);
    
    const loginResponse = await axios.post(`${API_BASE_URL}/student-auth/login`, {
      email: studentEmail,
      password: 'test123' // Use the password the student set
    });

    if (!loginResponse.data.success) {
      console.log('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log(`   Token: ${token.substring(0, 20)}...`);

    // Step 2: Fetch My Tickets
    console.log('\n📋 Step 2: Fetching student\'s tickets...');
    
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
        console.log(`      Created: ${new Date(ticket.createdAt).toLocaleString()}`);
      });
      console.log('\n' + '='.repeat(60));
      console.log('✅ TEST PASSED: Student can see their tickets!');
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('❌ TEST FAILED: No tickets returned');
      console.log('   Full response:', JSON.stringify(ticketsResponse.data, null, 2));
    }

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TEST FAILED WITH ERROR:');
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${error.response.data?.message || error.response.data?.error}`);
      console.log(`   Full response:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`   Error: ${error.message}`);
    }
  }
}

testStudentFlow();
