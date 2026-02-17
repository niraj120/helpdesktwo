const mongoose = require('mongoose');
const MONGO_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function fixFieldNames() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  
  // Find documents with wrong field names
  const wrongDocs = await db.collection('rolepermissions').find({ 
    role: { $exists: true } 
  }).toArray();
  
  console.log('Documents with wrong field names (role instead of roleId):', wrongDocs.length);
  
  if (wrongDocs.length > 0) {
    for (const doc of wrongDocs) {
      await db.collection('rolepermissions').updateOne(
        { _id: doc._id }, 
        { 
          $set: { roleId: doc.role, permissionId: doc.permission }, 
          $unset: { role: 1, permission: 1 } 
        }
      );
    }
    console.log('Fixed', wrongDocs.length, 'documents');
  }
  
  // Verify
  const totalDocs = await db.collection('rolepermissions').countDocuments();
  const correctDocs = await db.collection('rolepermissions').countDocuments({ roleId: { $exists: true } });
  console.log(`\nTotal documents: ${totalDocs}`);
  console.log(`Documents with correct field names (roleId): ${correctDocs}`);
  
  await mongoose.disconnect();
}

fixFieldNames().catch(e => console.error(e));
