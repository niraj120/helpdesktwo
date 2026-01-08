const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin');
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

const checkUserRole = async () => {
  await connectDB();

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }), 'roles');

  const email = 'niraj.mishra1010@gmail.com';
  
  console.log(`\nChecking user: ${email}`);
  console.log('='.repeat(50));

  const user = await User.findOne({ email }).lean();
  
  if (!user) {
    console.log('❌ User not found');
    process.exit(0);
  }

  console.log('\nUser Details:');
  console.log('- ID:', user._id);
  console.log('- Name:', user.firstName, user.lastName);
  console.log('- Email:', user.email);
  console.log('- Role ID:', user.roleId);

  if (user.roleId) {
    const role = await Role.findById(user.roleId).lean();
    if (role) {
      console.log('\nRole Details:');
      console.log('- Role Name:', role.name);
      console.log('- Role Code:', role.code);
      console.log('- Role Type:', role.type);
    }
  }

  console.log('\n✅ Query complete');
  process.exit(0);
};

checkUserRole().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
