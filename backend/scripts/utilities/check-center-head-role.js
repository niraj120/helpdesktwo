require('dotenv').config();
const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  category: String
}, { timestamps: true });

const Permission = mongoose.model('Permission', permissionSchema);

async function checkCenterHeadRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find Center Manager role by ID
    const centerHeadRole = await Role.findById('691eaaff97b5ad11bf7f98b8').populate('permissions');

    if (centerHeadRole) {
      console.log('\n📋 CENTER MANAGER ROLE DETAILS:');
      console.log('   ID:', centerHeadRole._id);
      console.log('   Name:', centerHeadRole.name);
      console.log('   Code:', centerHeadRole.code);
      console.log('   Permissions Count:', centerHeadRole.permissions.length);
      
      if (centerHeadRole.permissions.length === 0) {
        console.log('\n❌ NO PERMISSIONS ASSIGNED TO THIS ROLE!');
      } else {
        console.log('\n🔑 PERMISSIONS BY CATEGORY:');
        const permsByCategory = {};
        
        centerHeadRole.permissions.forEach(perm => {
          if (!permsByCategory[perm.category]) {
            permsByCategory[perm.category] = [];
          }
          permsByCategory[perm.category].push({
            code: perm.code,
            name: perm.name
          });
        });
        
        Object.entries(permsByCategory).forEach(([category, perms]) => {
          console.log(`\n   📁 ${category.toUpperCase()}: (${perms.length} permissions)`);
          perms.forEach(p => console.log(`      • ${p.code} - ${p.name}`));
        });
      }

      // Check users with this role
      const userSchema = new mongoose.Schema({}, { strict: false });
      const User = mongoose.model('User', userSchema);
      const users = await User.find({ role: centerHeadRole._id }).select('name email');
      
      console.log('\n👥 USERS WITH CENTER MANAGER ROLE:', users.length);
      users.forEach(u => console.log(`   • ${u.name} (${u.email})`));
      
    } else {
      console.log('\n❌ Role with ID 691eaaff97b5ad11bf7f98b8 not found');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCenterHeadRole();
