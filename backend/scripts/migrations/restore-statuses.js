const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
const PROJECT_ID = '6908806855106de325cb1354'; // Student Assist Center

async function restoreStatuses() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Status = mongoose.model('Status', new mongoose.Schema({
      name: String,
      code: String,
      color: String,
      projectId: mongoose.Schema.Types.ObjectId,
      isDefault: Boolean,
      isClosed: Boolean,
      displayOrder: Number,
      isActive: Boolean,
    }, { timestamps: true }));

    // Get current status count
    const beforeActive = await Status.countDocuments({ 
      projectId: new mongoose.Types.ObjectId(PROJECT_ID), 
      isActive: true 
    });
    const beforeInactive = await Status.countDocuments({ 
      projectId: new mongoose.Types.ObjectId(PROJECT_ID), 
      isActive: false 
    });

    console.log(`📊 Current Status:`);
    console.log(`   Active: ${beforeActive}`);
    console.log(`   Inactive: ${beforeInactive}\n`);

    // Restore all statuses
    const result = await Status.updateMany(
      { projectId: new mongoose.Types.ObjectId(PROJECT_ID) },
      { $set: { isActive: true } }
    );

    console.log(`✅ Restored ${result.modifiedCount} statuses\n`);

    // Get final count
    const afterActive = await Status.countDocuments({ 
      projectId: new mongoose.Types.ObjectId(PROJECT_ID), 
      isActive: true 
    });

    console.log(`📊 Final Status:`);
    console.log(`   Active: ${afterActive}`);
    console.log(`   Total: ${afterActive}\n`);

    // List all statuses
    const allStatuses = await Status.find({ 
      projectId: new mongoose.Types.ObjectId(PROJECT_ID) 
    }).sort({ displayOrder: 1 });

    console.log(`📋 All Statuses:`);
    allStatuses.forEach(status => {
      const defaultTag = status.isDefault ? ' [DEFAULT]' : '';
      const closedTag = status.isClosed ? ' [CLOSED]' : '';
      console.log(`   ${status.displayOrder}. ${status.name} (${status.code})${defaultTag}${closedTag}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

restoreStatuses();
