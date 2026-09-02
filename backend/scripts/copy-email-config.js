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

// Source: Student Assist Center (original project with email config)
const SOURCE_PROJECT_NAME = 'Student assist center';

// Target: The second project
const TARGET_PROJECT_ID = '6938f34bedea0c244850566d';

async function copyEmailConfig() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const EmailConfig = mongoose.model('EmailConfig', new mongoose.Schema({}, { strict: false }), 'emailconfigs');
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    
    // Find source project by name
    const sourceProject = await Project.findOne({ name: SOURCE_PROJECT_NAME });
    
    if (!sourceProject) {
      console.log(`❌ Source project "${SOURCE_PROJECT_NAME}" not found`);
      console.log('\nAvailable projects:');
      const allProjects = await Project.find({}, { name: 1, code: 1 });
      allProjects.forEach(p => console.log(`  - ${p.name} (${p.code}) - ID: ${p._id}`));
      return;
    }

    console.log(`📧 Found source project: ${sourceProject.name}`);
    console.log(`   Project ID: ${sourceProject._id}\n`);

    // Find target project by ID
    const targetProject = await Project.findById(TARGET_PROJECT_ID);
    
    if (!targetProject) {
      console.log(`❌ Target project not found with ID: ${TARGET_PROJECT_ID}`);
      console.log('\nAvailable projects:');
      const allProjects = await Project.find({}, { name: 1, code: 1 });
      allProjects.forEach(p => console.log(`  - ${p.name} (${p.code}) - ID: ${p._id}`));
      return;
    }

    console.log(`🎯 Target project: ${targetProject.name}`);
    console.log(`   Project ID: ${targetProject._id}\n`);

    // Get source email config
    const sourceConfig = await EmailConfig.findOne({ projectId: sourceProject._id });
    
    if (!sourceConfig) {
      console.log(`❌ No email configuration found for source project "${SOURCE_PROJECT_NAME}"`);
      return;
    }

    console.log('✅ Found source email configuration');
    console.log(`   SMTP Host: ${sourceConfig.smtpHost}`);
    console.log(`   SMTP Port: ${sourceConfig.smtpPort}`);
    console.log(`   From Email: ${sourceConfig.fromEmail}`);
    console.log(`   From Name: ${sourceConfig.fromName}\n`);

    // Check if target already has email config
    const existingTargetConfig = await EmailConfig.findOne({ projectId: TARGET_PROJECT_ID });
    
    if (existingTargetConfig) {
      console.log('⚠️  Target project already has email configuration');
      console.log('   Updating existing configuration...\n');
      
      // Update existing config
      existingTargetConfig.smtpHost = sourceConfig.smtpHost;
      existingTargetConfig.smtpPort = sourceConfig.smtpPort;
      existingTargetConfig.smtpSecure = sourceConfig.smtpSecure;
      existingTargetConfig.smtpUser = sourceConfig.smtpUser;
      existingTargetConfig.smtpPassword = sourceConfig.smtpPassword;
      existingTargetConfig.fromEmail = sourceConfig.fromEmail;
      existingTargetConfig.fromName = targetProject.name; // Use target project name
      existingTargetConfig.replyToEmail = sourceConfig.replyToEmail;
      existingTargetConfig.triggers = sourceConfig.triggers;
      existingTargetConfig.isActive = sourceConfig.isActive;
      
      await existingTargetConfig.save();
      console.log('✅ Email configuration updated successfully!');
    } else {
      console.log('📝 Creating new email configuration for target project...\n');
      
      // Create new config for target
      const newConfig = new EmailConfig({
        projectId: TARGET_PROJECT_ID,
        smtpHost: sourceConfig.smtpHost,
        smtpPort: sourceConfig.smtpPort,
        smtpSecure: sourceConfig.smtpSecure,
        smtpUser: sourceConfig.smtpUser,
        smtpPassword: sourceConfig.smtpPassword,
        fromEmail: sourceConfig.fromEmail,
        fromName: targetProject.name, // Use target project name
        replyToEmail: sourceConfig.replyToEmail,
        triggers: sourceConfig.triggers,
        isActive: sourceConfig.isActive,
      });
      
      await newConfig.save();
      console.log('✅ Email configuration created successfully!');
    }

    console.log('\n📬 Enabled Email Triggers:');
    console.log('=========================');
    
    const triggers = sourceConfig.triggers || {};
    let enabledCount = 0;
    
    Object.keys(triggers).forEach(triggerKey => {
      const trigger = triggers[triggerKey];
      if (trigger.enabled) {
        enabledCount++;
        console.log(`  ✅ ${triggerKey}`);
        if (trigger.subject) {
          console.log(`     Subject: ${trigger.subject}`);
        }
      }
    });

    if (enabledCount === 0) {
      console.log('  ⚠️  No triggers are enabled');
    }

    console.log('\n🎉 Email configuration copied successfully!');
    console.log(`\n${targetProject.name} will now send emails using the same SMTP settings as ${sourceProject.name}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

copyEmailConfig();
