const mongoose = require('mongoose');
require('dotenv').config();

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  requirePasswordSetup: Boolean
});

const User = mongoose.model('User', userSchema);

async function checkStudent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const student = await User.findOne({ email: 'anmol.sharma@hubblehox.com' });
    
    if (!student) {
      console.log('❌ Student not found');
      process.exit(1);
    }

    console.log('Student Information:');
    console.log(`Name: ${student.firstName} ${student.lastName}`);
    console.log(`Email: ${student.email}`);
    console.log(`Has Password: ${student.password ? 'YES' : 'NO'}`);
    console.log(`Password Length: ${student.password ? student.password.length : 0}`);
    console.log(`Requires Password Setup: ${student.requirePasswordSetup}`);
    
    if (!student.password || student.requirePasswordSetup) {
      console.log('\n⚠️  Student needs to set up password first!');
      console.log('   They should use the OTP verification flow');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkStudent();
