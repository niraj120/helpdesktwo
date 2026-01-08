const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const projects = await db.collection('projects').find({}).toArray();
    
    console.log('=== ALL PROJECTS ===\n');
    projects.forEach(project => {
      console.log('Project Name:', project.name);
      console.log('Custom URL Path:', project.customUrlPath);
      console.log('Code:', project.code);
      console.log('---');
    });
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
