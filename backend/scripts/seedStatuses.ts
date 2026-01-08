/**
 * Seed Standard Statuses for All Projects
 * 
 * This creates the 5 standard statuses that match the Ticket model enum:
 * - open, in-progress, resolved, closed, on-hold
 * 
 * Run: npx ts-node scripts/seedStatuses.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

// Standard statuses that match Ticket model enum
const STANDARD_STATUSES = [
  {
    name: 'Open',
    code: 'open',
    color: '#3b82f6', // blue
    isDefault: true,
    isClosed: false,
    displayOrder: 1,
    description: 'Ticket is open and awaiting action',
    isActive: true
  },
  {
    name: 'In Progress',
    code: 'in-progress',
    color: '#f59e0b', // orange
    isDefault: false,
    isClosed: false,
    displayOrder: 2,
    description: 'Ticket is being worked on',
    isActive: true
  },
  {
    name: 'On Hold',
    code: 'on-hold',
    color: '#6b7280', // gray
    isDefault: false,
    isClosed: false,
    displayOrder: 3,
    description: 'Ticket is temporarily paused',
    isActive: true
  },
  {
    name: 'Resolved',
    code: 'resolved',
    color: '#10b981', // green
    isDefault: false,
    isClosed: true,
    displayOrder: 4,
    description: 'Issue has been resolved',
    isActive: true
  },
  {
    name: 'Closed',
    code: 'closed',
    color: '#8b5cf6', // purple
    isDefault: false,
    isClosed: true,
    displayOrder: 5,
    description: 'Ticket is closed',
    isActive: true
  }
];

async function seedStatuses() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Get all projects
    const projectCollection = db.collection('projects');
    const projects = await projectCollection.find({}).toArray();
    
    console.log(`📊 Found ${projects.length} project(s) in database\n`);

    if (projects.length === 0) {
      console.log('⚠️  No projects found. Creating global statuses (no projectId)...');
      
      const statusCollection = db.collection('statuses');
      
      for (const status of STANDARD_STATUSES) {
        const exists = await statusCollection.findOne({ code: status.code, projectId: null });
        
        if (exists) {
          console.log(`   ⏭️  Status "${status.name}" (${status.code}) already exists globally`);
        } else {
          await statusCollection.insertOne({
            ...status,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log(`   ✅ Created global status: "${status.name}" (${status.code})`);
        }
      }
    } else {
      // Create statuses for each project
      const statusCollection = db.collection('statuses');
      
      for (const project of projects) {
        console.log(`📁 Processing project: ${project.name} (${project._id})`);
        
        for (const status of STANDARD_STATUSES) {
          const exists = await statusCollection.findOne({ 
            code: status.code, 
            projectId: project._id 
          });
          
          if (exists) {
            console.log(`   ⏭️  Status "${status.name}" (${status.code}) already exists`);
          } else {
            await statusCollection.insertOne({
              ...status,
              projectId: project._id,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`   ✅ Created status: "${status.name}" (${status.code})`);
          }
        }
        console.log('');
      }
    }

    // Verify
    const statusCollection = db.collection('statuses');
    const totalStatuses = await statusCollection.countDocuments();
    console.log(`\n📊 Total statuses in database: ${totalStatuses}`);

    // Show breakdown
    const statusCodes = await statusCollection.distinct('code');
    console.log(`✅ Status codes available: ${statusCodes.join(', ')}`);

    console.log('\n✅ Status seeding completed successfully!');
    console.log('\n💡 Note: These status codes match the Ticket model enum:');
    console.log('   open, in-progress, resolved, closed, on-hold');

  } catch (error) {
    console.error('❌ Error seeding statuses:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

seedStatuses()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  });
