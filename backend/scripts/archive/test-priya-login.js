require('dotenv').config();
const axios = require('axios');

async function testPriyaLoginAPI() {
    try {
        console.log('🧪 Testing Priya Login API Call\n');

        const loginData = {
            email: 'priya.sharma@sac.gov.in',
            password: 'agent@123'
        };

        console.log(`📧 Email: ${loginData.email}`);
        console.log(`🔑 Password: ${loginData.password}`);
        console.log('🌐 URL: http://localhost:3003/api/auth/project/studentassistcenters/login\n');

        console.log('Making request...');
        
        const response = await axios.post(
            'http://localhost:3003/api/auth/project/studentassistcenters/login',
            loginData,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.status === 200 && response.data.success) {
            console.log('✅ LOGIN SUCCESS!\n');

            const { token, user } = response.data.data;
            console.log('🎫 JWT Token:');
            console.log(`   Length: ${token.length} characters`);
            console.log(`   Preview: ${token.substring(0, 50)}...`);
            console.log('');

            console.log('👤 User Data:');
            console.log(`   ID: ${user.id}`);
            console.log(`   Name: ${user.name}`);
            console.log(`   Email: ${user.email}`);
            console.log(`   Role: ${user.role.name} (${user.role.code})`);
            console.log(`   Permissions: ${user.role.permissions ? user.role.permissions.length : 0}`);
            console.log('');

            if (user.role.permissions && user.role.permissions.length > 0) {
                console.log('🔐 PERMISSIONS IN RESPONSE:');
                user.role.permissions.forEach((perm, index) => {
                    console.log(`   ${index + 1}. ${perm}`);
                });
                console.log('');

                // Decode JWT token to verify permissions are in token too
                try {
                    const parts = token.split('.');
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                    
                    console.log('🎫 JWT TOKEN PAYLOAD:');
                    console.log(`   User ID: ${payload.userId}`);
                    console.log(`   Email: ${payload.email}`);
                    console.log(`   Role Code: ${payload.role?.code}`);
                    console.log(`   Role Name: ${payload.role?.name}`);
                    console.log(`   Permissions in Token: ${payload.role?.permissions ? payload.role.permissions.length : 0}`);
                    
                    if (payload.role?.permissions) {
                        console.log('');
                        console.log('🔑 PERMISSIONS IN JWT TOKEN:');
                        payload.role.permissions.forEach((perm, index) => {
                            console.log(`   ${index + 1}. ${perm}`);
                        });
                    }
                    console.log('');

                    // Test specific permissions
                    const hasTicketView = payload.role?.permissions?.includes('TICKET_VIEW_OWN');
                    const hasOfflineAccess = payload.role?.permissions?.includes('OFFLINE_MODULE_ACCESS');
                    const hasTicketCreate = payload.role?.permissions?.includes('TICKET_CREATE');
                    
                    console.log('🧪 PERMISSION TESTS:');
                    console.log(`   TICKET_VIEW_OWN: ${hasTicketView ? '✅ YES' : '❌ NO'}`);
                    console.log(`   OFFLINE_MODULE_ACCESS: ${hasOfflineAccess ? '✅ YES' : '❌ NO'}`);
                    console.log(`   TICKET_CREATE: ${hasTicketCreate ? '✅ YES' : '❌ NO'}`);
                    console.log('');

                    // Final assessment
                    if (hasTicketView && hasOfflineAccess && hasTicketCreate) {
                        console.log('🎉 PERFECT! All expected permissions found in JWT token.');
                        console.log('   ✅ Dynamic JWT permission system is working correctly');
                        console.log('   ✅ Priya can login and get proper permissions');
                        console.log('   ✅ Frontend should now be able to access permissions');
                    } else {
                        console.log('⚠️  Some expected permissions are missing');
                    }

                } catch (decodeError) {
                    console.log('❌ Failed to decode JWT token:', decodeError.message);
                }

            } else {
                console.log('❌ NO PERMISSIONS in response');
            }

        } else {
            console.log('❌ LOGIN FAILED');
            console.log(`Status: ${response.status}`);
            console.log('Response:', response.data);
        }

    } catch (error) {
        console.error('❌ Error testing login:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        
        if (error.response?.status === 429) {
            console.log('\n⚠️  Rate limiting detected. Please wait 15 minutes and try again.');
        }
    }
}

testPriyaLoginAPI();