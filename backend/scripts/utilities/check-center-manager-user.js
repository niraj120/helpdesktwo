require('dotenv').config();
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  isActive: Boolean,
});

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
});

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  category: String,
});

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

const checkUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find Subhangi Mathur
    const user = await User.findOne({ 
      firstName: /subhangi/i,
      lastName: /mathur/i 
    }).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        select: 'code name category'
      }
    });

    if (!user) {
      console.log('❌ User not found: Subhangi Mathur');
      process.exit(1);
    }

    console.log('👤 User Details:');
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   Role: ${user.role?.name} (${user.role?.code})`);
    console.log('');

    // Check user management permissions
    const userPermissions = user.role?.permissions || [];
    const userMgmtPerms = userPermissions.filter(p => p.code?.startsWith('USER_'));

    console.log('📋 User Management Permissions:');
    if (userMgmtPerms.length === 0) {
      console.log('   ❌ NO USER MANAGEMENT PERMISSIONS FOUND');
    } else {
      userMgmtPerms.forEach(p => {
        console.log(`   ✅ ${p.code} - ${p.name}`);
      });
    }
    console.log('');

    console.log(`📊 Total Permissions: ${userPermissions.length}`);
    console.log('');

    // Show all permission categories
    const categories = {};
    userPermissions.forEach(p => {
      if (!categories[p.category]) {
        categories[p.category] = 0;
      }
      categories[p.category]++;
    });

    console.log('📂 Permissions by Category:');
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkUser();
