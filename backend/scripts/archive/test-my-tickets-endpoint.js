const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testMyTicketsEndpoint() {
  try {
    const studentId = '6924951cddf5ef394dddbb4d';
    const jwtSecret = 'your-super-secret-jwt-key-change-this-in-production';
    
    // Generate a token for the student
    const token = jwt.sign({ userId: studentId }, jwtSecret, { expiresIn: '1h' });
    
    console.log('🔑 Generated token for student:', studentId);
    console.log('🌐 Testing endpoint: http://localhost:3003/api/tickets/my-tickets\n');
    
    // Make API request
    const response = await axios.get('http://localhost:3003/api/tickets/my-tickets', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ API Response Status:', response.status);
    console.log('📊 Success:', response.data.success);
    console.log('🎫 Tickets returned:', response.data.data?.length || 0);
    
    if (response.data.data && response.data.data.length > 0) {
      console.log('\n📋 Ticket Details:');
      response.data.data.forEach((ticket, index) => {
        console.log(`\n${index + 1}. ${ticket.ticketNumber}`);
        console.log(`   Subject: ${ticket.subject}`);
        console.log(`   Status: ${ticket.status}`);
        console.log(`   Priority: ${ticket.priority}`);
        console.log(`   Student Email: ${ticket.metadata?.studentEmail}`);
      });
    } else {
      console.log('\n⚠️  No tickets returned');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.log('\nResponse data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMyTicketsEndpoint();
