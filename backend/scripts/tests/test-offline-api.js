const mongoose = require('mongoose');
const axios = require('axios');

async function testOfflineAPI() {
  try {
    // First get the project ID
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const projects = await db.collection('projects').find({}).toArray();
    
    if (projects.length === 0) {
      console.log('❌ No projects found');
      process.exit(1);
    }
    
    const project = projects[0];
    console.log(`📋 Testing offline settings API for project: ${project.name}\n`);
    console.log(`Project ID: ${project._id}\n`);
    
    // Test the API endpoint
    try {
      const response = await axios.get(`http://localhost:3003/api/projects/${project._id}/offline-settings`);
      
      console.log('API Response:');
      console.log('Status:', response.status);
      console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (apiError) {
      console.log('❌ API Error:', apiError.response?.data || apiError.message);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testOfflineAPI();
