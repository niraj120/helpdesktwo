import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const TARGET_PROJECT_ID = '693bd61817834e29eb111ec2'; // MHCET

async function forceUpdateAllStatuses() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const statusCollection = db.collection('statuses');

    // Find ALL statuses for MHCET project
    console.log(`📊 Finding all statuses for project ${TARGET_PROJECT_ID}...`);
    const allStatuses = await statusCollection.find({ 
      projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID)
    }).toArray();
    
    console.log(`Found ${allStatuses.length} status records\n`);
    
    console.log('CURRENT STATE:');
    allStatuses.forEach((s: any) => {
      console.log(`  ID: ${s._id}`);
      console.log(`  Name: "${s.name}"`);
      console.log(`  Code: ${JSON.stringify(s.code)} (type: ${typeof s.code})`);
      console.log('  ---');
    });

    // Force update each one
    console.log('\n🔄 FORCE UPDATING ALL STATUSES...');
    
    const updates = [
      { name: 'Open', code: 1 },
      { name: 'In Progress', code: 2 },
      { name: 'On Hold', code: 3 },
      { name: 'Resolved', code: 4 },
      { name: 'Closed', code: 5 },
      { name: 'Close', code: 5 }, // In case it's named "Close" instead of "Closed"
    ];

    let updated = 0;
    for (const update of updates) {
      const result = await statusCollection.updateMany(
        { 
          projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID),
          name: { $regex: new RegExp(`^${update.name}$`, 'i') } // Case insensitive
        },
        { $set: { code: update.code } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Updated "${update.name}" → ${update.code} (${result.modifiedCount} records)`);
        updated += result.modifiedCount;
      }
    }

    // Verify
    console.log('\n✅ FINAL STATE:');
    const final = await statusCollection.find({ 
      projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID)
    }).toArray();
    
    final.forEach((s: any) => {
      console.log(`  ${s.name}: code=${JSON.stringify(s.code)} (type: ${typeof s.code})`);
    });

    console.log(`\n🎉 Updated ${updated} status records!`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected');
  }
}

forceUpdateAllStatuses();
