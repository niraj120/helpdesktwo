require('dotenv').config();
const mongoose = require('mongoose');

async function checkTicketFields() {
  await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
  console.log('✅ Connected to MongoDB\n');
  
  try {
    const db = mongoose.connection.db;
    
    // Find first project
    const project = await db.collection('projects').findOne({});
    
    if (!project) {
      console.log('❌ Project not found');
      return;
    }
    
    console.log('📝 Project:', project.name);
    console.log('📝 Submission Mode:', project.configuration?.ticketSubmissionSettings?.mode);
    console.log('\n=== OFFLINE MODULE TICKET FIELDS ===');
    
    const ticketFields = project.configuration?.offlineModuleSettings?.ticketFields || [];
    console.log('Total Ticket Fields:', ticketFields.length);
    
    ticketFields.forEach((field, index) => {
      console.log(`\nField ${index + 1}:`);
      console.log('  Name:', field.fieldName);
      console.log('  Type:', field.fieldType);
      console.log('  Required:', field.required);
      console.log('  Fixed:', field.isFixed);
      console.log('  Enabled:', field.isEnabled);
      console.log('  Order:', field.order);
      if (field.allowedFileTypes) {
        console.log('  Allowed File Types:', field.allowedFileTypes.join(', '));
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkTicketFields();
