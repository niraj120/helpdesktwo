import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const TARGET_PROJECT_ID = '693bd61817834e29eb111ec2';

async function cleanupDuplicateStatuses() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const statusCollection = db.collection('statuses');

    // Find ALL statuses
    const allStatuses = await statusCollection.find({ 
      projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID)
    }).toArray();
    
    console.log(`📊 Found ${allStatuses.length} total status records\n`);
    
    // Separate numeric vs string codes
    const numericStatuses = allStatuses.filter((s: any) => typeof s.code === 'number');
    const stringStatuses = allStatuses.filter((s: any) => typeof s.code === 'string');
    
    console.log(`✅ Numeric codes: ${numericStatuses.length} records`);
    numericStatuses.forEach((s: any) => {
      console.log(`   ${s.name}: ${s.code} (ID: ${s._id})`);
    });
    
    console.log(`\n⚠️  String codes: ${stringStatuses.length} records`);
    stringStatuses.forEach((s: any) => {
      console.log(`   ${s.name}: "${s.code}" (ID: ${s._id})`);
    });

    if (stringStatuses.length > 0) {
      console.log('\n🗑️  Deleting string-based status records...');
      const idsToDelete = stringStatuses.map((s: any) => s._id);
      const result = await statusCollection.deleteMany({
        _id: { $in: idsToDelete }
      });
      console.log(`✅ Deleted ${result.deletedCount} string-based status records`);
    }

    // Verify final state
    console.log('\n📊 FINAL STATUS TABLE:');
    const final = await statusCollection.find({ 
      projectId: new mongoose.Types.ObjectId(TARGET_PROJECT_ID)
    }).toArray();
    
    final.forEach((s: any) => {
      console.log(`  ${s.name}: code=${s.code} (type: ${typeof s.code})`);
    });

    console.log(`\n🎉 Cleanup complete! ${final.length} statuses remain.`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

cleanupDuplicateStatuses();
