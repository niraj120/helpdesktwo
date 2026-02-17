/**
 * Enable audit for specific assets by setting nextAuditDate to today
 * This will make Edit/Submit buttons appear immediately
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function enableAuditToday() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Target specific project: MH CET Extension Centres
  const targetProjectId = '693bd61817834e29eb111ec2';
  
  // Find all mappings for this project
  const mappings = await mongoose.connection.db.collection('centerassetmappings').find({
    projectId: new mongoose.Types.ObjectId(targetProjectId)
  }).toArray();
  
  console.log(`Found ${mappings.length} assets for MH CET Extension Centres project\n`);
  console.log('='.repeat(80));
  
  for (const mapping of mappings) {
    console.log(`\nAsset ID: ${mapping.assetId}`);
    console.log(`  Before:`);
    console.log(`    lastAuditDate: ${mapping.lastAuditDate ? new Date(mapping.lastAuditDate).toLocaleDateString() : 'Not set'}`);
    console.log(`    nextAuditDate: ${mapping.nextAuditDate ? new Date(mapping.nextAuditDate).toLocaleDateString() : 'Not set'}`);
    console.log(`    auditSubmitted: ${mapping.auditSubmitted}`);
    console.log(`    canEdit: Would be ${today >= (mapping.nextAuditDate ? new Date(mapping.nextAuditDate) : new Date('2099-01-01')) ? 'TRUE ✅' : 'FALSE ❌'}`);
    
    // Update: Set nextAuditDate to today (or yesterday to ensure it's due)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const result = await mongoose.connection.db.collection('centerassetmappings').updateOne(
      { _id: mapping._id },
      { 
        $set: { 
          nextAuditDate: today,  // Set to today so today >= nextAuditDate
          auditSubmitted: false,
          lastAuditDate: yesterday  // Set last audit to yesterday
        } 
      }
    );
    
    console.log(`  After:`);
    console.log(`    lastAuditDate: ${yesterday.toLocaleDateString()}`);
    console.log(`    nextAuditDate: ${today.toLocaleDateString()}`);
    console.log(`    auditSubmitted: false`);
    console.log(`    canEdit: Will be TRUE ✅`);
    console.log(`  Modified: ${result.modifiedCount} record(s)`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Done! Refresh the My Assets page to see Edit/Submit buttons enabled');
  console.log(`\n💡 Now when you submit audit:`);
  console.log(`   - lastAuditDate will be set to today (${today.toLocaleDateString()})`);
  console.log(`   - nextAuditDate will be set to ${new Date(today.getTime() + 30*24*60*60*1000).toLocaleDateString()} (1 month later)`);
  console.log(`   - lastAuditSubmittedAt will be set to current timestamp`);
  console.log(`   - Edit/Submit buttons will hide until next audit date\n`);
  
  await mongoose.disconnect();
}

enableAuditToday().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
