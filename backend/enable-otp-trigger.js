const mongoose = require('mongoose');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    const db = mongoose.connection.db;
    const collection = db.collection('smsconfigs');

    // Enable studentOTP trigger for all projects
    const result = await collection.updateMany(
      {},
      { 
        $set: { 
          'triggers.studentOTP.enabled': true 
        } 
      }
    );

    console.log('Updated', result.modifiedCount, 'configurations');

    // Verify
    const configs = await collection.find({}).toArray();
    configs.forEach(config => {
      console.log('Project:', config.projectId.toString(), 
        '- studentOTP:', config.triggers?.studentOTP?.enabled ? '✅ enabled' : '❌ disabled');
    });

    await mongoose.disconnect();
    console.log('\nDone!');
  })
  .catch(err => console.error(err));
