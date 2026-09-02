require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

async function checkAndEnableEmailTriggers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const EmailConfig = mongoose.model('EmailConfig', new mongoose.Schema({}, { strict: false }), 'emailconfigs');
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    
    // Get the only project
    const project = await Project.findOne({});
    
    if (!project) {
      console.log('❌ No project found');
      return;
    }

    console.log(`📧 Project: ${project.name}`);
    console.log(`   ID: ${project._id}\n`);

    // Get email config
    const emailConfig = await EmailConfig.findOne({ projectId: project._id });
    
    if (!emailConfig) {
      console.log('❌ No email configuration found');
      return;
    }

    console.log('✅ Email Configuration Found');
    console.log('============================');
    console.log(`SMTP Host: ${emailConfig.smtpHost}`);
    console.log(`SMTP Port: ${emailConfig.smtpPort}`);
    console.log(`From Email: ${emailConfig.fromEmail}`);
    console.log(`From Name: ${emailConfig.fromName}\n`);

    // Check and enable triggers
    console.log('📬 Checking Email Triggers...\n');
    
    const triggers = emailConfig.triggers || {};
    let updated = false;
    
    // List of triggers that should be enabled for ticket creation
    const triggerKeys = [
      'ticketCreatedStudent',
      'ticketCreatedOnline',
      'ticketAssigned',
      'ticketStatusChanged',
      'ticketCommentAdded'
    ];
    
    triggerKeys.forEach(key => {
      const trigger = triggers[key];
      if (trigger) {
        const wasEnabled = trigger.enabled;
        console.log(`${key}:`);
        console.log(`  Current: ${wasEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        
        if (!wasEnabled) {
          trigger.enabled = true;
          updated = true;
          console.log(`  Updated: ✅ Enabled`);
        }
      } else {
        console.log(`${key}: ⚠️  Not configured`);
      }
      console.log('');
    });

    if (updated) {
      emailConfig.markModified('triggers');
      await emailConfig.save();
      console.log('\n✅ Email triggers have been enabled!');
      console.log('📧 Your project will now send emails when tickets are created.');
    } else {
      console.log('\n✅ All email triggers are already enabled!');
      console.log('📧 Your project should be sending emails.');
      console.log('\nIf emails are still not being sent, check:');
      console.log('1. SMTP credentials are correct');
      console.log('2. Backend logs for email sending errors');
      console.log('3. Email may be in spam folder');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkAndEnableEmailTriggers();
