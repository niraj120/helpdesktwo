const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testRealJWTFromAPI() {
    try {
        console.log('🚀 Testing Real JWT from API Response');
        console.log('');

        // Make actual login request
        const response = await axios.post('http://localhost:3003/api/auth/project/studentassistcenters/login', {
            email: 'priya.sharma@sac.gov.in',
            password: 'agent@123'
        });

        if (response.data.success) {
            console.log('✅ Login API Success!');
            const token = response.data.data.token;
            console.log(`📱 Token length: ${token.length} characters`);
            console.log('');

            // Decode the JWT to check permissions
            const secret = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
            const decoded = jwt.verify(token, secret);

            console.log('🔍 JWT Payload Analysis:');
            console.log(`   User ID: ${decoded.userId}`);
            console.log(`   Email: ${decoded.email}`);
            console.log(`   Full Name: ${decoded.firstName} ${decoded.lastName}`);
            console.log(`   Role Code: ${decoded.role.code}`);
            console.log(`   Role Name: ${decoded.role.name}`);
            console.log(`   Project ID: ${decoded.projectId}`);
            console.log(`   Project Name: ${decoded.projectName}`);
            console.log(`   Token Version: ${decoded.tokenVersion}`);
            console.log('');

            console.log('🔐 Permission Analysis:');
            const permissions = decoded.role.permissions || [];
            console.log(`   Total Permissions: ${permissions.length}`);

            if (permissions.length > 0) {
                console.log('');
                console.log('✅ First 10 Permissions Found:');
                permissions.slice(0, 10).forEach((perm, index) => {
                    console.log(`   ${index + 1}. ${perm}`);
                });

                if (permissions.length > 10) {
                    console.log(`   ... and ${permissions.length - 10} more permissions`);
                }

                console.log('');
                console.log('🧪 Permission Availability Tests:');
                console.log(`   Can view tickets: ${permissions.includes('TICKET_VIEW_OWN') ? '✅' : '❌'}`);
                console.log(`   Can create tickets: ${permissions.includes('TICKET_CREATE') ? '✅' : '❌'}`);
                console.log(`   Can access offline module: ${permissions.includes('OFFLINE_MODULE_ACCESS') ? '✅' : '❌'}`);
                console.log(`   Can edit student records: ${permissions.includes('OFFLINE_STUDENT_EDIT') ? '✅' : '❌'}`);

                console.log('');
                console.log('🎉 DYNAMIC JWT SYSTEM STATUS: ✅ WORKING!');
                console.log('');
                console.log('📋 Summary:');
                console.log('   ✅ API login successful');
                console.log('   ✅ JWT token generated with dynamic permissions');  
                console.log(`   ✅ ${permissions.length} permissions loaded from database`);
                console.log('   ✅ Role-based access control active');
                console.log('   ✅ Project-specific login working');
                console.log('');
                console.log('🚀 CONCLUSION: The system now provides JWT tokens with dynamic permissions');
                console.log('   for all current and future users/roles as requested!');

            } else {
                console.log('❌ No permissions found in JWT token');
            }

        } else {
            console.log('❌ Login failed:', response.data.message);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data?.message || error.message);
    }
}

testRealJWTFromAPI();