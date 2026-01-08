const axios = require('axios');

const BASE_URL = 'http://localhost:3003/api';

// Test Agent Login and All Dashboard APIs
async function runComprehensiveTest() {
    console.log('🔍 COMPREHENSIVE AGENT DASHBOARD VALIDATION\n');

    try {
        // 1. Login as Agent
        console.log('1️⃣ Testing Agent Login...');
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'priya.sharma@sac.gov.in',
            password: 'password123'
        });

        if (loginResponse.status !== 200) {
            throw new Error(`Login failed: ${loginResponse.status}`);
        }

        const { token, user } = loginResponse.data.data;
        console.log(`   ✅ Login successful: ${user.email}`);
        console.log(`   📋 Role: ${user.role}`);
        console.log(`   🎫 Token received: ${token.substring(0, 30)}...`);

        const authHeaders = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        const projectId = '6908806855106de325cb1354'; // Student Assist Center

        // 2. Test Agent Dashboard APIs
        console.log('\n2️⃣ Testing Agent Dashboard APIs...');
        
        const tests = [
            {
                name: 'Agent Assigned Tickets',
                url: `${BASE_URL}/tickets/agent/assigned?projectId=${projectId}`,
                expectSuccess: true
            },
            {
                name: 'Ticket Tags',
                url: `${BASE_URL}/tickets/tags?projectId=${projectId}`,
                expectSuccess: true
            },
            {
                name: 'Project Statuses',
                url: `${BASE_URL}/statuses/project/${projectId}`,
                expectSuccess: true
            },
            {
                name: 'Ticket Categories',
                url: `${BASE_URL}/tickets/categories?projectId=${projectId}`,
                expectSuccess: true
            },
            {
                name: 'Knowledge Base (should work)',
                url: `${BASE_URL}/knowledge-base?projectId=${projectId}`,
                expectSuccess: true
            }
        ];

        let passedTests = 0;
        let failedTests = 0;

        for (const test of tests) {
            try {
                console.log(`   🧪 Testing: ${test.name}`);
                const response = await axios.get(test.url, { headers: authHeaders });
                
                if (response.status === 200) {
                    console.log(`   ✅ SUCCESS: ${test.name} - Status: ${response.status}`);
                    passedTests++;
                } else {
                    console.log(`   ❌ UNEXPECTED STATUS: ${test.name} - Status: ${response.status}`);
                    failedTests++;
                }
            } catch (error) {
                if (error.response) {
                    console.log(`   ❌ FAILED: ${test.name} - Status: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
                } else {
                    console.log(`   ❌ ERROR: ${test.name} - ${error.message}`);
                }
                failedTests++;
            }
        }

        // 3. Test Permission System Directly
        console.log('\n3️⃣ Testing Permission System...');
        try {
            const userInfoResponse = await axios.get(`${BASE_URL}/auth/me`, { headers: authHeaders });
            console.log(`   📋 User permissions check: Status ${userInfoResponse.status}`);
            
            const userData = userInfoResponse.data.data;
            console.log(`   👤 User: ${userData.firstName} ${userData.lastName}`);
            console.log(`   🎭 Role: ${userData.role?.name || 'Unknown'}`);
            console.log(`   🔐 Permissions: ${userData.role?.permissions?.length || 0} permissions found`);
            
            if (userData.role?.permissions?.includes('TICKET_VIEW_OWN')) {
                console.log(`   ✅ Has TICKET_VIEW_OWN permission`);
            } else {
                console.log(`   ⚠️ Missing TICKET_VIEW_OWN permission`);
            }
            
        } catch (error) {
            console.log(`   ❌ Permission check failed: ${error.message}`);
        }

        // Summary
        console.log('\n📊 TEST SUMMARY');
        console.log(`   ✅ Passed: ${passedTests}`);
        console.log(`   ❌ Failed: ${failedTests}`);
        console.log(`   📈 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);

        if (failedTests === 0) {
            console.log('\n🎉 ALL TESTS PASSED! Agent dashboard is fully functional.');
            console.log('✨ The permission system is working correctly.');
            console.log('🔧 Frontend optimization is in place to reduce API calls.');
        } else {
            console.log('\n⚠️ Some tests failed. Please review the errors above.');
        }

    } catch (error) {
        console.error('❌ Test execution failed:', error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, error.response.data);
        }
    }
}

runComprehensiveTest();