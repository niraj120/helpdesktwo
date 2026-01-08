const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: String,
  description: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
});

const permissionSchema = new mongoose.Schema({
  name: String,
  description: String,
  category: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
});

const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);

async function checkAgentPermissions() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('Connected to MongoDB');

    const role = await Role.findOne({ name: 'Agent' }).populate('permissions');
    
    if (!role) {
      console.log('❌ AGENT role not found');
      process.exit(1);
    }

    console.log('\n✅ AGENT role found');
    console.log(`Total permissions: ${role.permissions.length}`);
    console.log('\nCurrent permissions:');
    role.permissions
      .map(p => p.name)
      .sort()
      .forEach(name => console.log(`  - ${name}`));

    // Check for missing critical permissions
    const permissionNames = role.permissions.map(p => p.name);
    
    console.log('\n=== PERMISSION CHECK ===');
    console.log('TICKET_VIEW_ALL:', permissionNames.includes('TICKET_VIEW_ALL') ? '✅' : '❌');
    console.log('TICKET_VIEW_ASSIGNED:', permissionNames.includes('TICKET_VIEW_ASSIGNED') ? '✅' : '❌');
    console.log('MASTER_DATA_VIEW:', permissionNames.includes('MASTER_DATA_VIEW') ? '✅' : '❌');
    console.log('STATUS_VIEW:', permissionNames.includes('STATUS_VIEW') ? '✅' : '❌');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAgentPermissions();
