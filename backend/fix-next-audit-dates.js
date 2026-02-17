const mongoose = require('mongoose');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    const db = mongoose.connection.db;
    
    console.log('=== Fixing nextAuditDate for unsubmitted audits ===');
    
    // Clear nextAuditDate for mappings that haven't submitted their first audit
    // The first audit date is stored in lastAuditDate
    // nextAuditDate should only be set AFTER the first audit is submitted
    const result = await db.collection('centerassetmappings').updateMany(
      { 
        auditSubmitted: { $ne: true }, 
        nextAuditDate: { $exists: true }
      }, 
      { 
        $unset: { nextAuditDate: "" }
      }
    );
    
    console.log('Cleared nextAuditDate from', result.modifiedCount, 'mappings');
    
    // Verify
    const remaining = await db.collection('centerassetmappings').countDocuments({
      auditSubmitted: { $ne: true },
      nextAuditDate: { $exists: true }
    });
    console.log('Remaining with nextAuditDate (should be 0):', remaining);
    
    await mongoose.disconnect();
    console.log('Done!');
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
