require('dotenv').config();
const mongoose = require('mongoose');

async function resetStudentTokenVersion() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find student user
    const db = mongoose.connection.db;
    const student = await db.collection('users').findOne({ 
      email: 'anmol.sharma@hubblehox.com' 
    });

    if (!student) {
      console.log('❌ Student user not found!');
      process.exit(1);
    }

    console.log('=== CURRENT STUDENT USER ===');
    console.log('Email:', student.email);
    console.log('Token Version:', student.tokenVersion);
    console.log('Role:', student.role);

    // Reset tokenVersion to 0
    console.log('\n🔄 Resetting tokenVersion to 0...');
    await db.collection('users').updateOne(
      { email: 'anmol.sharma@hubblehox.com' },
      { $set: { tokenVersion: 0 } }
    );

    // Verify the update
    const updatedStudent = await db.collection('users').findOne({ 
      email: 'anmol.sharma@hubblehox.com' 
    });

    console.log('\n=== UPDATED STUDENT USER ===');
    console.log('Email:', updatedStudent.email);
    console.log('Token Version:', updatedStudent.tokenVersion);

    console.log('\n✅ Done! Now the existing token should work.');
    console.log('📝 If you still see errors, please refresh the page and login again.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetStudentTokenVersion();
