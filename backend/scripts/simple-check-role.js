const mongoose = require('mongoose');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
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
