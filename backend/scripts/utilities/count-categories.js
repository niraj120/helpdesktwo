const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const project = await db.collection('projects').findOne({});
    
    const ticketFields = project.configuration.offlineModuleSettings.ticketFields;
    
    console.log(`Total fields in database: ${ticketFields.length}\n`);
    
    ticketFields.forEach((field, i) => {
      console.log(`Field ${i + 1}:`);
      console.log(`  ID: ${field.id}`);
      console.log(`  Name: ${field.fieldName}`);
      console.log(`  Type: ${field.fieldType}`);
      console.log(`  Fixed: ${field.isFixed}`);
      console.log(`  Order: ${field.order}`);
      console.log('');
    });
    
    // Count Category fields
    const categoryFields = ticketFields.filter(f => f.fieldName === 'Category');
    console.log(`\n⚠️  Total Category fields: ${categoryFields.length}`);
    
    if (categoryFields.length > 1) {
      console.log('\n❌ DUPLICATE CATEGORY FIELDS FOUND!');
      console.log('Category field IDs:', categoryFields.map(f => f.id));
    }
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
