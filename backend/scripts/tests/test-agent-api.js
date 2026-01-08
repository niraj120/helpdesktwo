const axios = require('axios');

const TEST_PROJECT_ID = '6908806855106de325cb1354';
const TEST_AGENT_EMAIL = 'priya.sharma@sac.gov.in';
const TEST_AGENT_PASSWORD = 'password123';

let authToken = '';

async function loginAgent() {
  try {
    console.log('🔐 Logging in agent...');
    const response = await axios.post('http://localhost:3003/api/auth/login', {
      email: TEST_AGENT_EMAIL,
      password: TEST_AGENT_PASSWORD
    });
    
    console.log('Login response:', JSON.stringify(response.data, null, 2));
    
    authToken = response.data.token || response.data.data?.token;
    console.log('✅ Agent logged in successfully');
    console.log('🎫 Token (first 50 chars):', authToken?.substring(0, 50));
    console.log('📋 User info:', {
      email: response.data.data?.user?.email || response.data.user?.email,
      role: response.data.data?.user?.role?.name || response.data.user?.role?.name,
      permissions: (response.data.data?.user?.role?.permissions || response.data.user?.role?.permissions)?.length || 'unknown'
    });
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function testAPI(endpoint, description) {
  try {
    console.log(`\n🧪 Testing ${description}: ${endpoint}`);
    const response = await axios.get(`http://localhost:3003${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log(`✅ SUCCESS: ${description} - Status: ${response.status}`);
    return true;
  } catch (error) {
    console.error(`❌ FAILED: ${description} - Status: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Agent API Permission Tests\n');
  
  // Login first
  const loginSuccess = await loginAgent();
  if (!loginSuccess) {
    console.log('❌ Cannot proceed without login');
    return;
  }
  
  // Test all agent endpoints
  const testResults = [];
  
  testResults.push(await testAPI(`/api/tickets/agent/assigned?projectId=${TEST_PROJECT_ID}`, 'Agent Assigned Tickets'));
  testResults.push(await testAPI(`/api/tickets/tags?projectId=${TEST_PROJECT_ID}`, 'Ticket Tags'));
  testResults.push(await testAPI(`/api/statuses/project/${TEST_PROJECT_ID}`, 'Project Statuses'));
  
  // Summary
  const passed = testResults.filter(r => r).length;
  const total = testResults.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED! Permission system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check permission configuration.');
  }
}

// Run the tests
runTests().catch(console.error);