require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function resetAdminPassword() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      password: String,
      firstname: String,
      lastname: String,
      role: mongoose.Schema.Types.ObjectId
    }));

    // Find admin user
    const admin = await User.findOne({ email: 'admin@helpdesk.gov.in' });
    
    if (!admin) {
      console.log('Admin user not found!');
      process.exit(1);
    }

    console.log('Found admin user:', admin.email);

    // Hash new password
    const newPassword = 'admin@123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    admin.password = hashedPassword;
    await admin.save();

    console.log('✓ Password updated successfully!');
    console.log('Email:', admin.email);
    console.log('Password:', newPassword);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetAdminPassword();
