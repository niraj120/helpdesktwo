const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const project = await db.collection('projects').findOne({});
    
    console.log('📝 Current ticket fields:');
    project.configuration.offlineModuleSettings.ticketFields.forEach((field, i) => {
      console.log(`${i + 1}. ${field.fieldName} (${field.fieldType}) - Fixed: ${field.isFixed}`);
    });
    
    // Remove all Category fields and add only one
    const filteredFields = project.configuration.offlineModuleSettings.ticketFields.filter(
      field => field.fieldName !== 'Category'
    );
    
    // Add single Category field at the beginning
    const updatedFields = [
      {
        id: 'category-fixed',
        fieldName: 'Category',
        fieldType: 'category-select',
        required: true,
        placeholder: 'Select category',
        isFixed: true,
        isEnabled: true,
        order: 1
      },
      ...filteredFields.map((field, index) => ({
        ...field,
        order: index + 2
      }))
    ];
    
    console.log('\n📝 Updated ticket fields:');
    updatedFields.forEach((field, i) => {
      console.log(`${i + 1}. ${field.fieldName} (${field.fieldType}) - Fixed: ${field.isFixed}, Order: ${field.order}`);
    });
    
    // Update database
    await db.collection('projects').updateOne(
      { _id: project._id },
      { 
        $set: { 
          'configuration.offlineModuleSettings.ticketFields': updatedFields 
        } 
      }
    );
    
    console.log('\n✅ Fixed duplicate Category field!');
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
