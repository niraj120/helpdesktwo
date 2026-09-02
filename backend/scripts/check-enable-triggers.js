require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    const EmailConfig = mongoose.model('EmailConfig', new mongoose.Schema({}, { strict: false }), 'emailconfigs');
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    
    // Get mhtcet project
    const project = await Project.findOne({ customUrlPath: 'mhtcet' }).lean();
    
    if (!project) {
      console.log('❌ Project not found');
      process.exit(1);
    }
    
    console.log('Project:', project.name);
    console.log('Project ID:', project._id);
    
    // Get email config
    const emailConfig = await EmailConfig.findOne({ projectId: project._id });
    
    if (!emailConfig) {
      console.log('\n❌ No email configuration found for this project');
      process.exit(1);
    }
    
    console.log('\n📧 Email Configuration:');
    console.log('SMTP Host:', emailConfig.smtpHost);
    console.log('SMTP User:', emailConfig.smtpUser);
    console.log('From Email:', emailConfig.fromEmail);
    console.log('From Name:', emailConfig.fromName);
    console.log('Enabled:', emailConfig.enabled);
    
    console.log('\n📋 Email Triggers:');
    
    const triggers = emailConfig.triggers || {};
    
    // Check key triggers
    const keyTriggers = ['ticketCreatedStudent', 'ticketCreatedOnline', 'ticketCreatedAgent'];
    
    keyTriggers.forEach(triggerName => {
      const trigger = triggers[triggerName];
      if (trigger) {
        console.log(`\n${triggerName}:`);
        console.log('  Enabled:', trigger.enabled);
        console.log('  Subject:', trigger.subject || '(not set)');
        console.log('  Recipients:', trigger.recipients || '(not set)');
      } else {
        console.log(`\n${triggerName}: NOT CONFIGURED`);
      }
    });
    
    // Enable ticket creation triggers if they exist
    let updated = false;
    
    if (triggers.ticketCreatedStudent && !triggers.ticketCreatedStudent.enabled) {
      console.log('\n✅ Enabling ticketCreatedStudent trigger...');
      triggers.ticketCreatedStudent.enabled = true;
      updated = true;
    }
    
    if (triggers.ticketCreatedOnline && !triggers.ticketCreatedOnline.enabled) {
      console.log('✅ Enabling ticketCreatedOnline trigger...');
      triggers.ticketCreatedOnline.enabled = true;
      updated = true;
    }
    
    if (updated) {
      await EmailConfig.updateOne(
        { projectId: project._id },
        { $set: { triggers } }
      );
      console.log('\n✅ Email triggers have been enabled!');
    } else {
      console.log('\n✅ All triggers are already configured correctly');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
