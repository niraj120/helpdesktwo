const axios = require('axios');
const FormData = require('form-data');

async function testOfflineSubmission() {
  try {
    // Login first
    const loginRes = await axios.post('http://localhost:3003/api/auth/login', {
      email: 'priya.sharma@sac.gov.in',
      password: 'Priya@123'
    });
    
    const token = loginRes.data.token;
    console.log('✅ Logged in successfully\n');
    
    // Create form data
    const formData = new FormData();
    formData.append('category', '6919af9a407fece535614073');
    formData.append('description', 'Test ticket from script');
    formData.append('userId', '6915b1a61ef91168f90ff7cf');
    formData.append('studentId', '6915b1a61ef91168f90ff7cf');
    formData.append('projectId', '6908806855106de325cb1354');
    formData.append('submissionType', 'offline');
    
    console.log('Sending offline ticket submission...\n');
    
    const response = await axios.post(
      'http://localhost:3003/api/tickets/offline-submission',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('✅ SUCCESS!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
    if (error.response?.data) {
      console.log('\nFull error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testOfflineSubmission();
