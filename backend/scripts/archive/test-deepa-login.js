const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sac_helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema (simplified)
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  firstName: String,
  lastName: String,
  isActive: Boolean,
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function testDeepaLogin() {
  try {
    // Find user
    const email = 'deepa.rao@sac.gov.in';
    console.log(`\n🔍 Searching for user: ${email}`);
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('❌ User not found');
      console.log('\n📋 All users in database:');
      const allUsers = await User.find({}, 'email firstName lastName isActive');
      allUsers.forEach(u => {
        console.log(`   - ${u.email} | ${u.firstName} ${u.lastName} | Active: ${u.isActive}`);
      });
    } else {
      console.log('✅ User found:');
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Active: ${user.isActive}`);
      console.log(`   Password Hash: ${user.password.substring(0, 30)}...`);
      
      // Test password
      const testPassword = 'centermanager@123';
      console.log(`\n🔐 Testing password: ${testPassword}`);
      
      const isMatch = await bcrypt.compare(testPassword, user.password);
      console.log(`   Password match: ${isMatch ? '✅ YES' : '❌ NO'}`);
      
      if (!isMatch) {
        console.log('\n💡 Resetting password to: centermanager@123');
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(testPassword, salt);
        user.password = hashedPassword;
        await user.save();
        console.log('✅ Password reset complete');
        
        // Verify again
        const newUser = await User.findOne({ email: email.toLowerCase() });
        const isMatchNow = await bcrypt.compare(testPassword, newUser.password);
        console.log(`   Password match now: ${isMatchNow ? '✅ YES' : '❌ NO'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

testDeepaLogin();
