/**
 * Reset audit status for assets that should be editable today
 * This sets lastAuditDate to today and auditSubmitted to false
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function resetAuditForToday() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find all center asset mappings where auditSubmitted is true
  const mappings = await mongoose.connection.db.collection('centerassetmappings').find({
    auditSubmitted: true
  }).toArray();
  
  console.log(`\nFound ${mappings.length} assets with auditSubmitted=true`);
  
  for (const mapping of mappings) {
    console.log(`\n--- Asset Mapping: ${mapping._id} ---`);
    console.log('  lastAuditDate:', mapping.lastAuditDate);
    console.log('  nextAuditDate:', mapping.nextAuditDate);
    console.log('  auditSubmitted:', mapping.auditSubmitted);
    
    // Reset: set lastAuditDate to today and auditSubmitted to false
    const result = await mongoose.connection.db.collection('centerassetmappings').updateOne(
      { _id: mapping._id },
      { 
        $set: { 
          lastAuditDate: today,
          auditSubmitted: false 
        } 
      }
    );
    
    console.log('  => Reset: lastAuditDate=today, auditSubmitted=false');
    console.log('  => Modified:', result.modifiedCount);
  }
  
  console.log('\n✅ Done! Refresh the My Assets page to see Edit/Submit buttons');
  
  await mongoose.disconnect();
}

resetAuditForToday().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
