const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function updateLoginSettings() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // First check current value
    const projectBefore = await mongoose.connection.db.collection('projects').findOne({ code: 'MHCETEXTEN' });
    console.log('\\nBefore update - loginSettings:', JSON.stringify(projectBefore.configuration?.loginSettings, null, 2));
    
    // Update the loginSettings.enableFormLogin to true
    const result = await mongoose.connection.db.collection('projects').updateOne(
      { code: 'MHCETEXTEN' },
      { $set: { 'configuration.loginSettings.enableFormLogin': true } }
    );
    
    console.log('\\nUpdate result:', result.modifiedCount, 'document(s) modified');
    
    // Verify the update
    const projectAfter = await mongoose.connection.db.collection('projects').findOne({ code: 'MHCETEXTEN' });
    console.log('\\nAfter update - loginSettings:', JSON.stringify(projectAfter.configuration?.loginSettings, null, 2));
    
    await mongoose.disconnect();
    console.log('\\nDone!');
  } catch (error) {
    console.error('Error:', error);
  }
}

updateLoginSettings();
