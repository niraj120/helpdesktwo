const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk';

// Project ID to check
const PROJECT_ID = '6938f34bedea0c244850566d'; // State Common Entrance Test Cell

async function checkEmailConfig() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const EmailConfig = mongoose.model('EmailConfig', new mongoose.Schema({}, { strict: false }), 'emailconfigs');
    
    const emailConfig = await EmailConfig.findOne({ projectId: PROJECT_ID });
    
    if (!emailConfig) {
      console.log('❌ No email configuration found for this project');
      console.log('\nTo fix this:');
      console.log('1. Go to Email Configuration page in the admin panel');
      console.log('2. Set up SMTP settings for your project');
      console.log('3. Enable the "Ticket Created (Student)" trigger');
      return;
    }

    console.log('📧 Email Configuration Found:');
    console.log('============================');
    console.log('SMTP Host:', emailConfig.smtpHost || 'Not configured');
    console.log('SMTP Port:', emailConfig.smtpPort || 'Not configured');
    console.log('From Email:', emailConfig.fromEmail || 'Not configured');
    console.log('From Name:', emailConfig.fromName || 'Not configured');
    console.log('\n📬 Email Triggers:');
    console.log('=================');
    
    const triggers = emailConfig.triggers || {};
    
    console.log('\n1. Ticket Created (Student):');
    const ticketCreatedStudent = triggers.ticketCreatedStudent || {};
    console.log('   - Enabled:', ticketCreatedStudent.enabled ? '✅ YES' : '❌ NO');
    console.log('   - Subject:', ticketCreatedStudent.subject || 'Not set');
    
    console.log('\n2. Ticket Created (Online):');
    const ticketCreatedOnline = triggers.ticketCreatedOnline || {};
    console.log('   - Enabled:', ticketCreatedOnline.enabled ? '✅ YES' : '❌ NO');
    console.log('   - Subject:', ticketCreatedOnline.subject || 'Not set');
    
    if (!ticketCreatedStudent.enabled && !ticketCreatedOnline.enabled) {
      console.log('\n⚠️  WARNING: Both ticket creation email triggers are DISABLED!');
      console.log('\nTo fix this:');
      console.log('1. Go to Email Configuration page');
      console.log('2. Find "Ticket Created (Student)" or "Ticket Created (Online)" trigger');
      console.log('3. Enable it by toggling the switch');
      console.log('4. Save the configuration');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkEmailConfig();
