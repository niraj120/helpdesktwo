import mongoose from 'mongoose';
import EmailConfig from '../models/EmailConfig';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const checkEmailConfig = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    console.log('Fetching Email Configuration...\n');
    const configs = await EmailConfig.find({});

    if (configs.length === 0) {
      console.log('❌ No Email Configuration found in database');
      console.log('\nPlease configure SMTP settings through the admin panel or insert a configuration document.');
    } else {
      console.log(`✅ Found ${configs.length} Email Configuration(s):\n`);
      
      configs.forEach((config, index) => {
        console.log(`Configuration ${index + 1}:`);
        console.log('─────────────────────────────────────');
        console.log(`Project ID: ${config.projectId}`);
        console.log(`SMTP Host: ${config.smtpHost || '❌ NOT SET'}`);
        console.log(`SMTP Port: ${config.smtpPort || '❌ NOT SET'}`);
        console.log(`SMTP User: ${config.smtpUser || '❌ NOT SET'}`);
        console.log(`SMTP Password: ${config.smtpPassword ? '✅ SET (encrypted)' : '❌ NOT SET'}`);
        console.log(`From Email: ${config.fromEmail || '❌ NOT SET'}`);
        console.log(`From Name: ${config.fromName || 'Not Set'}`);
        console.log(`Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`Created: ${config.createdAt}`);
        console.log(`Updated: ${config.updatedAt}`);
        
        console.log('\nEnabled Triggers:');
        if (config.triggers) {
          console.log(`  - Student Welcome: ${config.triggers.studentWelcome?.enabled ? '✅' : '❌'}`);
          console.log(`  - Ticket Created (Student): ${config.triggers.ticketCreatedStudent?.enabled ? '✅' : '❌'}`);
          console.log(`  - Ticket Created (Agent): ${config.triggers.ticketCreatedAgent?.enabled ? '✅' : '❌'}`);
          console.log(`  - Ticket Status Changed: ${config.triggers.ticketStatusChanged?.enabled ? '✅' : '❌'}`);
          console.log(`  - Ticket Assigned: ${config.triggers.ticketAssigned?.enabled ? '✅' : '❌'}`);
          console.log(`  - Ticket Closed: ${config.triggers.ticketClosed?.enabled ? '✅' : '❌'}`);
          console.log(`  - Ticket Replied: ${config.triggers.ticketReplied?.enabled ? '✅' : '❌'}`);
        } else {
          console.log('  ❌ No triggers configured');
        }
        
        console.log('\n');
        
        // Check if configuration is complete
        const isComplete = config.smtpHost && config.smtpPort && config.smtpUser && config.smtpPassword;
        if (isComplete) {
          console.log('✅ SMTP Configuration is COMPLETE - Emails will be sent');
        } else {
          console.log('❌ SMTP Configuration is INCOMPLETE - Emails will be simulated');
          console.log('\nMissing fields:');
          if (!config.smtpHost) console.log('  - SMTP Host');
          if (!config.smtpPort) console.log('  - SMTP Port');
          if (!config.smtpUser) console.log('  - SMTP User');
          if (!config.smtpPassword) console.log('  - SMTP Password');
        }
        console.log('═════════════════════════════════════\n');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
};

checkEmailConfig();
