const mongoose = require('mongoose');

const sourceProjectId = '6923190ff823462759296988'; // Student assist center
const targetProjectId = '6938f34bedea0c244850566d'; // mhtcet

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    const EmailConfig = mongoose.model('EmailConfig', new mongoose.Schema({}, { strict: false }), 'emailconfigs');
    
    // Get source email config
    const sourceConfig = await EmailConfig.findOne({ projectId: sourceProjectId }).lean();
    
    if (!sourceConfig) {
      console.log('❌ Source email configuration not found');
      process.exit(1);
    }
    
    console.log('✅ Found source email configuration');
    console.log('SMTP Host:', sourceConfig.smtpHost);
    console.log('SMTP User:', sourceConfig.smtpUser);
    console.log('From Email:', sourceConfig.fromEmail);
    
    // Create new config for target project
    const newConfig = {
      projectId: targetProjectId,
      enabled: sourceConfig.enabled,
      smtpHost: sourceConfig.smtpHost,
      smtpPort: sourceConfig.smtpPort,
      smtpSecure: sourceConfig.smtpSecure,
      smtpUser: sourceConfig.smtpUser,
      smtpPassword: sourceConfig.smtpPassword,
      fromEmail: sourceConfig.fromEmail,
      fromName: 'MHTCET Helpdesk',
      triggers: sourceConfig.triggers,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Check if target already has config
    const existingConfig = await EmailConfig.findOne({ projectId: targetProjectId });
    
    if (existingConfig) {
      console.log('\n⚠️  Email configuration already exists for target project');
      console.log('Updating with source configuration...');
      await EmailConfig.updateOne(
        { projectId: targetProjectId },
        { $set: newConfig }
      );
    } else {
      console.log('\n✅ Creating new email configuration for target project');
      await EmailConfig.create(newConfig);
    }
    
    console.log('\n✅ Email configuration copied successfully!');
    console.log('SMTP settings and all email triggers have been replicated.');
    console.log('\nYou can now submit tickets and receive email notifications.');
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
