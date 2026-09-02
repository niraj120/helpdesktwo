require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }), 'roles');
    
    const user = await User.findOne({ email: 'niraj.mishra1010@gmail.com' }).lean();
    
    if (!user) {
      console.log('User not found');
      process.exit(0);
    }
    
    console.log('\nUser:', user.firstName, user.lastName, '-', user.email);
    
    if (user.roleId) {
      const role = await Role.findById(user.roleId).lean();
      console.log('Role:', role?.name, '- Code:', role?.code);
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
