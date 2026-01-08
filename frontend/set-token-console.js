// Copy this entire script and paste it into your browser console at http://localhost:3001
// This will set the authentication token in localStorage

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NTMyZmQxYmY4OWYyNzcxMjVjN2YwNzdlIiwiZW1haWwiOiJhZG1pbkBzeWFzYy5pbiIsInJvbGUiOiJzdXBlcmFkbWluIiwiaWF0IjoxNzYyOTEzMjU4LCJleHAiOjE3NjU1MDUyNTh9.kZgB-IMUuEAj5zZYpGEnKsPfL2vAKhVhphD_7_875PE';

localStorage.setItem('token', TOKEN);
console.log('✅ Token set successfully!');
console.log('Token:', TOKEN.substring(0, 50) + '...');

// Test the API
async function testSLAAPI() {
    try {
        const response = await fetch('http://localhost:3003/api/sla-rules', {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('✅ SLA Rules Response:', data);
        console.log(`Found ${data.data?.length || 0} SLA rules`);
        
        // Now reload the page to see the data
        console.log('🔄 Reloading page to show SLA rules...');
        setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testSLAAPI();
