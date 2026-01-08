require('dotenv').config();
const mongoose = require('mongoose');

async function checkPermissionDocument() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const permissionId = '69133e04cdf807d363168a76';
    
    // Check the permission document directly
    const db = mongoose.connection.db;
    const permission = await db.collection('permissions').findOne({ 
      _id: new mongoose.Types.ObjectId(permissionId) 
    });

    console.log('=== PERMISSION DOCUMENT (RAW) ===');
    console.log(JSON.stringify(permission, null, 2));

    // Also check Student role with raw query
    const studentRole = await db.collection('roles').findOne({ code: 'STUDENT' });
    
    console.log('\n=== STUDENT ROLE (RAW) ===');
    console.log(JSON.stringify(studentRole, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPermissionDocument();
