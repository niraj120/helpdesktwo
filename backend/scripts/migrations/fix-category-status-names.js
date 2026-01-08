const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function fixData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Fix Categories: Move description to name if name is empty
    const categoriesResult = await db.collection('categories').updateMany(
      { $or: [{ name: '' }, { name: { $exists: false } }] },
      [
        {
          $set: {
            name: '$description',
            description: ''
          }
        }
      ]
    );
    console.log(`✅ Updated ${categoriesResult.modifiedCount} categories`);

    // Fix Status: Move code to name if name is empty
    const statusResult = await db.collection('status').updateMany(
      { $or: [{ name: '' }, { name: { $exists: false } }] },
      [
        {
          $set: {
            name: {
              $switch: {
                branches: [
                  { case: { $eq: ['$code', 'IN'] }, then: 'India' },
                  { case: { $eq: ['$code', 'US'] }, then: 'United States' },
                  { case: { $eq: ['$code', 'GB'] }, then: 'United Kingdom' },
                  { case: { $eq: ['$code', 'CA'] }, then: 'Canada' },
                  { case: { $eq: ['$code', 'AU'] }, then: 'Australia' },
                  { case: { $eq: ['$code', 'OPEN'] }, then: 'Open' },
                  { case: { $eq: ['$code', 'RESOLVED'] }, then: 'Resolved' }
                ],
                default: '$code'
              }
            }
          }
        }
      ]
    );
    console.log(`✅ Updated ${statusResult.modifiedCount} status records`);

    // Show sample data
    console.log('\n📊 Sample Categories:');
    const categories = await db.collection('categories').find({}).limit(3).toArray();
    categories.forEach(cat => {
      console.log(`  - ${cat.name} (${cat.description || 'no description'})`);
    });

    console.log('\n📊 Sample Status:');
    const statuses = await db.collection('status').find({}).limit(3).toArray();
    statuses.forEach(stat => {
      console.log(`  - ${stat.name} [${stat.code}]`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixData();
