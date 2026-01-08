const axios = require('axios');

async function testTicketDetailAccess() {
    console.log('🔍 Testing Agent Ticket Detail Access\n');

    try {
        // 1. Login
        const loginResponse = await axios.post('http://localhost:3003/api/auth/login', {
            email: 'priya.sharma@sac.gov.in',
            password: 'password123'
        });
        
        const { token } = loginResponse.data.data;
        console.log('✅ Agent logged in successfully');
        
        // 2. Get assigned tickets first
        const ticketsResponse = await axios.get('http://localhost:3003/api/tickets/agent/assigned?projectId=6908806855106de325cb1354', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const tickets = ticketsResponse.data.data || [];
        console.log(`📋 Found ${tickets.length} assigned tickets`);
        
        if (tickets.length === 0) {
            console.log('ℹ️ No assigned tickets to test with - creating a test scenario');
            console.log('🔚 Test completed - no tickets available for detail testing');
            return;
        }
        
        const testTicket = tickets[0];
        console.log(`🎫 Testing with ticket: ${testTicket.ticketNumber} (ID: ${testTicket._id})`);
        
        // 3. Try to access ticket detail - this is what was failing before
        const detailResponse = await axios.get(`http://localhost:3003/api/tickets/${testTicket._id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (detailResponse.status === 200) {
            console.log('✅ SUCCESS: Ticket detail endpoint accessible');
            console.log(`📄 Ticket Details Retrieved:`);
            console.log(`   - Number: ${detailResponse.data.data.ticketNumber}`);
            console.log(`   - Status: ${detailResponse.data.data.status}`);
            console.log(`   - Priority: ${detailResponse.data.data.priority}`);
            console.log(`   - Category: ${detailResponse.data.data.category}`);
            console.log(`   - Created: ${new Date(detailResponse.data.data.createdAt).toLocaleDateString()}`);
            
            if (detailResponse.data.data.assignedTo) {
                console.log(`   - Assigned to: ${detailResponse.data.data.assignedTo.firstName} ${detailResponse.data.data.assignedTo.lastName}`);
            }
            
            console.log('\n🎉 RESOLVED: Session expiry issue is FIXED!');
            console.log('🔧 Agents can now click on tickets and view details without getting "Session expired" message');
        }
        
    } catch (error) {
        if (error.response?.status === 401) {
            console.error('❌ FAILED: Still getting 401 Unauthorized');
            console.error('🔍 The token authentication is still failing');
            console.error(`   Error: ${error.response.data?.message}`);
        } else if (error.response?.status === 403) {
            console.error('❌ FAILED: Getting 403 Forbidden');
            console.error('🔍 Permission issue still exists');
            console.error(`   Error: ${error.response.data?.message}`);
        } else {
            console.error(`❌ ERROR: ${error.message}`);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Message: ${error.response.data?.message}`);
            }
        }
    }
}

testTicketDetailAccess();