/**
 * Create database indexes for optimal query performance
 * Run: node create-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function createIndexes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // KBTable indexes
    console.log('📊 Creating KBTable indexes...');
    await db.collection('kbtables').createIndex({ projectId: 1, status: 1, createdAt: -1 });
    await db.collection('kbtables').createIndex({ levelIds: 1 });
    await db.collection('kbtables').createIndex({ createdAt: -1 });
    await db.collection('kbtables').createIndex({ tableName: 'text' });
    await db.collection('kbtables').createIndex({ dataSource: 1 });
    console.log('   ✅ KBTable indexes created');

    // KBArticle indexes
    console.log('📝 Creating KBArticle indexes...');
    await db.collection('kbarticles').createIndex({ projectId: 1, levelIds: 1, status: 1 });
    await db.collection('kbarticles').createIndex({ status: 1, publishedDate: -1 });
    await db.collection('kbarticles').createIndex({ levelIds: 1 });
    await db.collection('kbarticles').createIndex({ documentName: 'text', description: 'text' });
    await db.collection('kbarticles').createIndex({ createdAt: -1 });
    console.log('   ✅ KBArticle indexes created');

    // Ticket indexes
    console.log('🎫 Creating Ticket indexes...');
    await db.collection('tickets').createIndex({ ticketNumber: 1 }, { unique: true });
    await db.collection('tickets').createIndex({ projectId: 1, status: 1, createdAt: -1 });
    await db.collection('tickets').createIndex({ assignedTo: 1, status: 1 });
    await db.collection('tickets').createIndex({ createdBy: 1, createdAt: -1 });
    await db.collection('tickets').createIndex({ priority: 1, status: 1 });
    await db.collection('tickets').createIndex({ status: 1, createdAt: -1 });
    console.log('   ✅ Ticket indexes created');

    // User indexes
    console.log('👤 Creating User indexes...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ projects: 1 });
    await db.collection('users').createIndex({ isActive: 1 });
    console.log('   ✅ User indexes created');

    // Role indexes
    console.log('🔐 Creating Role indexes...');
    await db.collection('roles').createIndex({ code: 1 });
    await db.collection('roles').createIndex({ projects: 1 });
    await db.collection('roles').createIndex({ type: 1 });
    await db.collection('roles').createIndex({ isActive: 1 });
    console.log('   ✅ Role indexes created');

    // Project indexes
    console.log('📁 Creating Project indexes...');
    await db.collection('projects').createIndex({ code: 1 }, { unique: true });
    await db.collection('projects').createIndex({ 'branding.customUrlPath': 1 });
    await db.collection('projects').createIndex({ status: 1 });
    console.log('   ✅ Project indexes created');

    // Asset indexes
    console.log('🏢 Creating Asset indexes...');
    await db.collection('assets').createIndex({ projectId: 1, name: 1 });
    await db.collection('assets').createIndex({ projectId: 1, isActive: 1 });
    await db.collection('assets').createIndex({ createdAt: -1 });
    console.log('   ✅ Asset indexes created');

    // Center indexes
    console.log('🏫 Creating Center indexes...');
    await db.collection('centers').createIndex({ centerId: 1, projectId: 1 });
    await db.collection('centers').createIndex({ projectId: 1 });
    await db.collection('centers').createIndex({ name: 'text' });
    console.log('   ✅ Center indexes created');

    // ActivityLog indexes
    console.log('📋 Creating ActivityLog indexes...');
    await db.collection('activitylogs').createIndex({ timestamp: -1 });
    await db.collection('activitylogs').createIndex({ userId: 1, timestamp: -1 });
    await db.collection('activitylogs').createIndex({ entity: 1, timestamp: -1 });
    console.log('   ✅ ActivityLog indexes created');

    // Email queue indexes
    console.log('📧 Creating Email queue indexes...');
    await db.collection('emailqueues').createIndex({ status: 1, createdAt: 1 });
    await db.collection('emailqueues').createIndex({ ticketId: 1 });
    await db.collection('emailqueues').createIndex({ retryCount: 1, status: 1 });
    console.log('   ✅ Email queue indexes created');

    console.log('\n✅ All indexes created successfully!');
    console.log('\n📊 Verifying indexes...');
    
    // List all indexes for kbtables
    const kbtableIndexes = await db.collection('kbtables').indexes();
    console.log('\nKBTable indexes:');
    kbtableIndexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

createIndexes();
