const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk');

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String
}, { collection: 'permissions' });

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { collection: 'roles' });

const Permission = mongoose.model('Permission', permissionSchema);
const Role = mongoose.model('Role', roleSchema);

async function listAllRoles() {
  try {
    console.log('🔍 Listing all roles in database...\n');
    
    const roles = await Role.find({}).populate('permissions');
    
    if (roles.length === 0) {
      console.log('❌ No roles found in database');
      return;
    }

    console.log(`📊 Found ${roles.length} role(s):\n`);
    
    roles.forEach((role, index) => {
      console.log(`${index + 1}. 🎭 Role: "${role.name}"`);
      console.log(`   📝 ID: ${role._id}`);
      console.log(`   🔐 Permissions: ${role.permissions.length}`);
      
      if (role.permissions.length > 0) {
        console.log('   📋 Permission Codes:');
        role.permissions.forEach(perm => {
          console.log(`      - ${perm.code}`);
        });
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

listAllRoles();