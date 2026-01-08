const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const project = await db.collection('projects').findOne({});
    
    console.log('📝 Project:', project.name);
    console.log('\n=== CURRENT OFFLINE SETTINGS ===');
    console.log(JSON.stringify(project.configuration?.offlineModuleSettings, null, 2));
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
