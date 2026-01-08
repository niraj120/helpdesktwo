const axios = require('axios');

async function testAPI() {
  try {
    console.log('Testing /api/users?populate=role endpoint...\n');
    
    const response = await axios.get('http://localhost:3003/api/users?populate=role', {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MjNmOGI1ODcwMDQ1ZjAxZjI5MzVjZSIsImVtYWlsIjoiZGVlcGEucmFvQHNhYy5nb3YuaW4iLCJpYXQiOjE3MzI0NjYzMDEsImV4cCI6MTczNTA1ODMwMX0.m9PdWqXbXC3yV8rQR7gf4Y47lUyvRqQHODXZTNwQf2Q'
      }
    });

    if (response.data.success && response.data.data) {
      const users = response.data.data;
      console.log(`Found ${users.length} users\n`);
      
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
        if (user.role) {
          console.log(`   Role: ${user.role.name} (${user.role.code})`);
          console.log(`   Role ID: ${user.role._id}`);
          console.log(`   isAgent field present: ${user.role.hasOwnProperty('isAgent')}`);
          if (user.role.hasOwnProperty('isAgent')) {
            console.log(`   isAgent value: ${user.role.isAgent}`);
          }
          console.log(`   All role fields: ${Object.keys(user.role).join(', ')}`);
        }
        console.log('');
      });

      // Specifically check Priya Sharma (Counselor)
      const priya = users.find(u => u.email === 'priya.sharma@sac.gov.in');
      if (priya) {
        console.log('🎯 Priya Sharma (Counselor) Details:');
        console.log('Role object:', JSON.stringify(priya.role, null, 2));
      }
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testAPI();
