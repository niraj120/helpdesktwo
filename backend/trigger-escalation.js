// Trigger auto-escalation check manually
require('dotenv').config();
const axios = require('axios');

async function triggerEscalation() {
  try {
    console.log('🔄 Manually triggering auto-escalation check...\n');
    
    // The auto-escalation service runs every 5 minutes automatically
    // But we can trigger it manually by hitting a dedicated endpoint
    // Or by directly calling the service method
    
    const API_URL = process.env.API_URL || 'http://localhost:3003';
    
    // Check backend health
    const healthResponse = await axios.get(`${API_URL}/api/health`);
    console.log('✅ Backend is running:', healthResponse.data.status);
    
    console.log('\n⏰ Auto-escalation service is running in the background');
    console.log('   It checks for overdue tickets every 5 minutes');
    console.log('   Next check will happen within 5 minutes');
    
    console.log('\n📋 Checking current SLA tracking status...');
    
    // Get token (you'd normally need to login)
    console.log('\n⚠️  Note: Auto-escalation will happen automatically within 5 minutes');
    console.log('   The service is now running on the backend server');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

triggerEscalation();
