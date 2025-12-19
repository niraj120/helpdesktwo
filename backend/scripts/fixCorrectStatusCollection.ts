import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const TARGET_PROJECT_ID = '693bd61817834e29eb111ec2';

async function fixCorrectStatusCollection() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const statusCollection = db.collection('status'); // SINGULAR - correct one!

    console.log('📊 Checking STATUS collection (singular)...');
    const statuses = await statusCollection.find({ 
      projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID)
    }).toArray();
    
    console.log(`Found ${statuses.length} status records\n`);
    
    console.log('CURRENT STATE:');
    statuses.forEach((s: any) => {
      console.log(`  Name: "${s.name}"`);
      console.log(`  Code: ${JSON.stringify(s.code)} (type: ${typeof s.code})`);
      console.log(`  ID: ${s._id}`);
      console.log('  ---');
    });

    // Update to numbers
    console.log('\n🔄 Updating to numeric codes...');
    
    const updates = [
      { name: /^open$/i, code: 1 },
      { name: /^in.?progress$/i, code: 2 },
      { name: /^on.?hold$/i, code: 3 },
      { name: /^resolved$/i, code: 4 },
      { name: /^close(d)?$/i, code: 5 },
    ];

    let totalUpdated = 0;
    for (const update of updates) {
      const result = await statusCollection.updateMany(
        { 
          projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID),
          name: update.name
        },
        { $set: { code: update.code } }
      );
      
      if (result.matchedCount > 0) {
        console.log(`  ✅ Updated ${update.name.source} → ${update.code} (${result.modifiedCount} modified)`);
        totalUpdated += result.modifiedCount;
      }
    }

    // Verify
    console.log('\n✅ FINAL STATE:');
    const final = await statusCollection.find({ 
      projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID)
    }).toArray();
    
    final.forEach((s: any) => {
      console.log(`  ${s.name}: code=${s.code} (type: ${typeof s.code})`);
    });

    console.log(`\n🎉 Updated ${totalUpdated} records in the STATUS collection!`);

    // Delete the wrong collection
    console.log('\n🗑️  Deleting the STATUSES (plural) collection...');
    await db.collection('statuses').drop();
    console.log('✅ Deleted statuses collection');

  } catch (error: any) {
    if (error.message.includes('ns not found')) {
      console.log('⏭️  statuses collection already deleted or never existed');
    } else {
      console.error('❌ Error:', error);
    }
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected');
  }
}

fixCorrectStatusCollection();
