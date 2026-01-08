const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const projects = await db.collection('projects').find({}).toArray();
    
    console.log('📋 Projects with Offline Mode Configuration:\n');
    
    projects.forEach(project => {
      console.log(`Project: ${project.name}`);
      console.log(`  Code: ${project.code}`);
      console.log(`  Offline Mode Enabled: ${project.offlineModeEnabled || false}`);
      
      if (project.offlineModeConfig) {
        console.log('  Offline Mode Config:');
        console.log(`    Enabled: ${project.offlineModeConfig.enabled || false}`);
        console.log(`    Max Offline Duration: ${project.offlineModeConfig.maxOfflineDuration || 'Not set'}`);
        console.log(`    Require Reason: ${project.offlineModeConfig.requireReason || false}`);
        console.log(`    Require Manager Approval: ${project.offlineModeConfig.requireManagerApproval || false}`);
      } else {
        console.log('  Offline Mode Config: Not configured');
      }
      console.log('');
    });
    
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
