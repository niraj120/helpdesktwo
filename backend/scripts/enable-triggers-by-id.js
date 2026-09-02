require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

const projectId = '6938f34bedea0c244850566d'; // From user's email config queries

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    const EmailConfig = mongoose.model('EmailConfig', new mongoose.Schema({}, { strict: false }), 'emailconfigs');
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    
    // Check if project exists
    const project = await Project.findById(projectId).lean();
    
    if (project) {
      console.log('✅ Project found:', project.name);
      console.log('   Custom URL:', project.branding?.customUrlPath || 'N/A');
    } else {
      console.log('⚠️  Project not found in database, but email config may still exist');
    }
    
    // Get email config for this projectId
    const emailConfig = await EmailConfig.findOne({ projectId });
    
    if (!emailConfig) {
      console.log(`\n❌ No email configuration found for projectId: ${projectId}`);
      process.exit(1);
    }
    
    console.log('\n📧 Email Configuration Found:');
    console.log('SMTP Host:', emailConfig.smtpHost);
    console.log('SMTP User:', emailConfig.smtpUser);
    console.log('From Email:', emailConfig.fromEmail);
    console.log('From Name:', emailConfig.fromName);
    console.log('Main Enabled:', emailConfig.enabled);
    
    console.log('\n📋 Email Triggers Status:');
    
    const triggers = emailConfig.triggers || {};
    
    // Check all triggers
    const allTriggerNames = Object.keys(triggers);
    
    if (allTriggerNames.length === 0) {
      console.log('❌ No triggers configured');
      process.exit(1);
    }
    
    allTriggerNames.forEach(triggerName => {
      const trigger = triggers[triggerName];
      console.log(`\n${triggerName}:`);
      console.log('  Enabled:', trigger.enabled ? '✅ YES' : '❌ NO');
      console.log('  Subject:', trigger.subject ? `"${trigger.subject.substring(0, 50)}..."` : '(not set)');
      console.log('  Has Body:', trigger.body ? 'Yes' : 'No');
    });
    
    // Enable ticket creation triggers
    let updated = false;
    const toEnable = ['ticketCreatedStudent', 'ticketCreatedOnline'];
    
    console.log('\n🔧 Enabling ticket creation triggers...');
    
    toEnable.forEach(triggerName => {
      if (triggers[triggerName]) {
        if (!triggers[triggerName].enabled) {
          console.log(`  ✅ Enabling ${triggerName}`);
          triggers[triggerName].enabled = true;
          updated = true;
        } else {
          console.log(`  ℹ️  ${triggerName} already enabled`);
        }
      } else {
        console.log(`  ⚠️  ${triggerName} not found in configuration`);
      }
    });
    
    if (updated) {
      await EmailConfig.updateOne(
        { projectId },
        { $set: { triggers } }
      );
      console.log('\n✅ Email triggers have been enabled and saved!');
      console.log('   You can now submit a ticket to test email delivery.');
    } else {
      console.log('\n✅ All ticket creation triggers are already enabled.');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
