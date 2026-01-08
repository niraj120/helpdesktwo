const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
require('./dist/models/User');
require('./dist/models/Role');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    const User = mongoose.model('User');
    
    console.log('\n🔍 SEARCHING FOR USER ID: 691f4de071e5c184729774e7\n');
    
    // Try different formats
    try {
      const user1 = await User.findById('691f4de071e5c184729774e7').populate({ path: 'role', populate: 'permissions' });
      if (user1) {
        console.log('✅ Found with string ID');
        printUser(user1);
      } else {
        console.log('❌ Not found with string ID');
      }
    } catch (e) {
      console.log('❌ Error with string ID:', e.message);
    }
    
    try {
      const user2 = await User.findById(new ObjectId('691f4de071e5c184729774e7')).populate({ path: 'role', populate: 'permissions' });
      if (user2) {
        console.log('\n✅ Found with ObjectId');
        printUser(user2);
      } else {
        console.log('\n❌ Not found with ObjectId');
      }
    } catch (e) {
      console.log('\n❌ Error with ObjectId:', e.message);
    }
    
    // List all users
    console.log('\n\n📋 LISTING ALL USERS:\n');
    const allUsers = await User.find({}).populate('role').limit(20);
    console.log(`Total users: ${allUsers.length}\n`);
    
    allUsers.forEach((u, i) => {
      console.log(`${i + 1}. ID: ${u._id}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Name: ${u.firstName} ${u.lastName}`);
      console.log(`   Role: ${u.role ? `${u.role.name} (${u.role.code})` : 'None'}`);
      console.log('');
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

function printUser(user) {
  console.log('─'.repeat(60));
  console.log('Email:', user.email);
  console.log('Name:', user.firstName, user.lastName);
  if (user.role) {
    console.log('Role:', user.role.name, `(${user.role.code})`);
    if (user.role.permissions) {
      console.log(`\nPermissions (${user.role.permissions.length}):`);
      user.role.permissions.sort((a, b) => a.code.localeCompare(b.code)).forEach(p => {
        console.log(`  ✓ ${p.code}`);
      });
    }
  }
  console.log('─'.repeat(60));
}
