import axios from 'axios';

const API_URL = 'http://localhost:3003/api';

async function testGroupedPermissions() {
  try {
    // You'll need to replace this with an actual token from localStorage
    const token = process.env.TEST_TOKEN || 'YOUR_TOKEN_HERE';
    
    console.log('🔍 Fetching grouped permissions from API...');
    const response = await axios.get(`${API_URL}/permissions/grouped`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const grouped = response.data.data;
    const categories = Object.keys(grouped).sort();
    
    console.log(`\n📂 Categories returned by API (${categories.length}):`);
    categories.forEach(cat => {
      const modules = Object.keys(grouped[cat]);
      const permCount = modules.reduce((sum, mod) => sum + grouped[cat][mod].length, 0);
      console.log(`   - ${cat} (${permCount} permissions across ${modules.length} modules)`);
      modules.forEach(mod => {
        console.log(`      └─ ${mod}: ${grouped[cat][mod].length} permissions`);
      });
    });

    // Check specifically for feedback
    if (grouped['feedback']) {
      console.log('\n✅ Feedback category found in API response!');
      console.log('📋 Feedback permissions:');
      Object.entries(grouped['feedback']).forEach(([module, perms]: [string, any[]]) => {
        console.log(`   Module: ${module}`);
        perms.forEach(p => console.log(`      - ${p.name} (${p.code})`));
      });
    } else {
      console.log('\n❌ Feedback category NOT found in API response!');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testGroupedPermissions();
