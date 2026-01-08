/**
 * Migration script to create default statuses in Status master table for all projects
 * Run this script once to set up initial statuses
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const statusSchema = new mongoose.Schema({
  name: String,
  code: String,
  color: String,
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  isDefault: { type: Boolean, default: false },
  isClosed: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  description: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Status = mongoose.model('Status', statusSchema);

const defaultStatuses = [
  { name: 'Open', code: 'OPEN', color: '#3b82f6', isDefault: true, isClosed: false, displayOrder: 1, description: 'New ticket' },
  { name: 'In Progress', code: 'IN_PROGRESS', color: '#f59e0b', isDefault: false, isClosed: false, displayOrder: 2, description: 'Being worked on' },
  { name: 'Pending', code: 'PENDING', color: '#8b5cf6', isDefault: false, isClosed: false, displayOrder: 3, description: 'Waiting for response' },
  { name: 'Resolved', code: 'RESOLVED', color: '#10b981', isDefault: false, isClosed: false, displayOrder: 4, description: 'Issue resolved' },
  { name: 'Closed', code: 'CLOSED', color: '#6b7280', isDefault: false, isClosed: true, displayOrder: 5, description: 'Ticket closed' },
];

async function migrateStatuses() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const projectsCollection = db.collection('projects');
    
    // Find all projects
    const projects = await projectsCollection.find({}).toArray();
    console.log(`📋 Found ${projects.length} projects`);

    let totalStatusesCreated = 0;
    let totalStatusesSkipped = 0;

    for (const project of projects) {
      console.log(`\n🔍 Processing project: ${project.name} (${project._id})`);
      
      // Check if project already has statuses
      const existingStatuses = await Status.find({ projectId: project._id });
      
      if (existingStatuses.length > 0) {
        console.log(`  ⏭️  Project already has ${existingStatuses.length} statuses, skipping`);
        totalStatusesSkipped += existingStatuses.length;
        continue;
      }

      console.log(`  📦 Creating ${defaultStatuses.length} default statuses`);

      // Create default statuses for this project
      for (const statusData of defaultStatuses) {
        const status = new Status({
          ...statusData,
          projectId: project._id,
        });

        await status.save();
        console.log(`  ✅ Created status: ${statusData.name} (${statusData.code})`);
        totalStatusesCreated++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Statuses created: ${totalStatusesCreated}`);
    console.log(`  ⏭️  Statuses skipped (already exist): ${totalStatusesSkipped}`);
    console.log(`  📋 Total processed: ${totalStatusesCreated + totalStatusesSkipped}`);

    await mongoose.connection.close();
    console.log('\n✅ Migration completed successfully');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateStatuses();
