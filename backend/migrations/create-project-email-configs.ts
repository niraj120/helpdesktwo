/**
 * Migration: Create ProjectEmailConfigs Collection
 * 
 * Purpose: Create table to store email configurations for projects
 * This allows multiple email addresses per project for email-to-ticket functionality
 * 
 * Task: 2.1 - Create API to Add Email Configuration
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProjectEmailConfig from '../src/models/ProjectEmailConfig';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

async function runMigration() {
  try {
    console.log('🚀 Starting ProjectEmailConfigs migration...\n');

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get collection info
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const collectionExists = collections.some(col => col.name === 'projectemailconfigs');

    if (collectionExists) {
      console.log('⚠️  Collection "projectemailconfigs" already exists\n');
    } else {
      console.log('📦 Creating collection "projectemailconfigs"...');
      await db.createCollection('projectemailconfigs');
      console.log('✅ Collection created\n');
    }

    // Create indexes
    console.log('🔨 Creating indexes...');
    
    const indexes = [
      { fields: { projectId: 1 }, options: { name: 'idx_projectId' } },
      { fields: { emailAddress: 1 }, options: { name: 'idx_emailAddress' } },
      { fields: { isEnabled: 1 }, options: { name: 'idx_isEnabled' } },
      { fields: { projectId: 1, emailAddress: 1 }, options: { unique: true, name: 'idx_project_email_unique' } },
      { fields: { createdAt: 1 }, options: { name: 'idx_createdAt' } },
      { fields: { updatedAt: 1 }, options: { name: 'idx_updatedAt' } },
    ];

    for (const index of indexes) {
      try {
        await ProjectEmailConfig.collection.createIndex(index.fields, index.options);
        console.log(`  ✅ Created index: ${index.options.name}`);
      } catch (error: any) {
        if (error.code === 85 || error.code === 86) {
          console.log(`  ⚠️  Index ${index.options.name} already exists`);
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ All indexes created successfully\n');

    // Test sample insertion (will be deleted)
    console.log('🧪 Testing sample record insertion...');
    
    const testConfig = new ProjectEmailConfig({
      projectId: new mongoose.Types.ObjectId(),
      emailAddress: 'test@example.com',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapUsername: 'test@example.com',
      imapPassword: 'test-password-123', // Will be encrypted
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUsername: 'test@example.com',
      smtpPassword: 'test-smtp-password-456', // Will be encrypted
      isEnabled: true,
      lastCheckedAt: new Date(),
      lastCheckStatus: 'success',
    });

    await testConfig.save();
    console.log('✅ Sample record inserted');

    // Verify encryption
    const savedConfig = await ProjectEmailConfig.findById(testConfig._id);
    if (savedConfig) {
      const hasColon = savedConfig.imapPassword.includes(':');
      const isLongerThanOriginal = savedConfig.imapPassword.length > 'test-password-123'.length;
      
      if (hasColon && isLongerThanOriginal) {
        console.log('✅ Password encryption verified (IMAP password is encrypted)');
      } else {
        console.log('⚠️  Password may not be encrypted properly');
      }

      // Test decryption
      const decryptedImapPassword = savedConfig.getDecryptedImapPassword();
      const decryptedSmtpPassword = savedConfig.getDecryptedSmtpPassword();
      
      if (decryptedImapPassword === 'test-password-123' && decryptedSmtpPassword === 'test-smtp-password-456') {
        console.log('✅ Password decryption verified (passwords decrypt correctly)');
      } else {
        console.log('❌ Password decryption failed');
        console.log(`   Expected IMAP: "test-password-123", Got: "${decryptedImapPassword}"`);
        console.log(`   Expected SMTP: "test-smtp-password-456", Got: "${decryptedSmtpPassword}"`);
      }
    }

    // Clean up test data
    await ProjectEmailConfig.findByIdAndDelete(testConfig._id);
    console.log('✅ Test record deleted\n');

    // Test unique constraint
    console.log('🧪 Testing unique constraint (projectId + emailAddress)...');
    const testProjectId = new mongoose.Types.ObjectId();
    
    const config1 = new ProjectEmailConfig({
      projectId: testProjectId,
      emailAddress: 'duplicate-test@example.com',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapUsername: 'duplicate-test@example.com',
      imapPassword: 'password1',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUsername: 'duplicate-test@example.com',
      smtpPassword: 'password1',
    });
    await config1.save();
    console.log('✅ First config with email inserted');

    try {
      const config2 = new ProjectEmailConfig({
        projectId: testProjectId, // Same project
        emailAddress: 'duplicate-test@example.com', // Same email
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapUsername: 'duplicate-test@example.com',
        imapPassword: 'password2',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUsername: 'duplicate-test@example.com',
        smtpPassword: 'password2',
      });
      await config2.save();
      console.log('❌ Duplicate email was allowed (FAILED)');
    } catch (error: any) {
      if (error.code === 11000) {
        console.log('✅ Unique constraint working (duplicate rejected)');
      } else {
        throw error;
      }
    }

    // Clean up
    await ProjectEmailConfig.deleteOne({ _id: config1._id });
    console.log('✅ Test data cleaned up\n');

    // Show statistics
    console.log('📊 Migration Statistics:');
    const count = await ProjectEmailConfig.countDocuments();
    const stats = await ProjectEmailConfig.collection.stats();
    
    console.log(`   Total documents: ${count}`);
    console.log(`   Storage size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Index count: ${stats.nindexes}`);
    console.log(`   Collection: ${stats.ns}\n`);

    console.log('✅ Migration completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
runMigration();
