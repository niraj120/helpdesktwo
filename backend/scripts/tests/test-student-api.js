const axios = require('axios');

const BASE_URL = 'http://localhost:3003/api';

async function testStudentFlow() {
  try {
    console.log('=== TESTING STUDENT LOGIN FLOW ===\n');
    
    // Step 1: Login as student
    console.log('1️⃣ Attempting login...');
    const loginRes = await axios.post(`${BASE_URL}/student-auth/login`, {
      email: 'anmol.sharma@hubblehox.com',
      password: 'password123' // Update this if different
    });
    
    if (loginRes.data.success) {
      console.log('✅ Login successful');
      console.log(`   Token received: ${loginRes.data.data.token.substring(0, 30)}...`);
      console.log(`   User: ${loginRes.data.data.user.firstName} ${loginRes.data.data.user.lastName}`);
      console.log(`   Role: ${loginRes.data.data.user.role.name} (${loginRes.data.data.user.role.code})`);
      
      const token = loginRes.data.data.token;
      
      // Step 2: Fetch my tickets
      console.log('\n2️⃣ Fetching my tickets...');
      const ticketsRes = await axios.get(`${BASE_URL}/tickets/my-tickets`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (ticketsRes.data.success) {
        console.log('✅ Successfully fetched tickets');
        console.log(`   Total tickets: ${ticketsRes.data.data.length}`);
        console.log('   Response:', JSON.stringify(ticketsRes.data, null, 2));
      }
      
    }
    
    console.log('\n✅ ALL TESTS PASSED!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data.message || error.response.statusText}`);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`   Error: ${error.message}`);
    }
    process.exit(1);
  }
}

testStudentFlow();
