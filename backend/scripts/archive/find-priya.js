const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    
    const users = await User.find({ 
      $or: [
        { email: /priya/i },
        { firstName: /priya/i }
      ]
    }).select('firstName lastName email');

    console.log('Found users:', users.length);
    users.forEach(u => {
      console.log(`  - ${u.firstName} ${u.lastName} (${u.email})`);
    });

    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
