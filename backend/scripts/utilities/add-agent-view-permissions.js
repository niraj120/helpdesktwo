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

async function addAgentPermissions() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('Connected to MongoDB');

    const agentRole = await Role.findOne({ name: 'Agent' }).populate('permissions');
    
    if (!agentRole) {
      console.log('❌ Agent role not found');
      process.exit(1);
    }

    console.log('\n✅ Agent role found');
    console.log(`Current permissions: ${agentRole.permissions.length}`);

    // Find permissions to add
    const permissionsToAdd = [
      'TICKET_VIEW_ASSIGNED',  // View tickets assigned to them
      'STATUS_VIEW',           // View statuses
      'CATEGORY_VIEW'          // View categories
    ];

    const existingPermNames = agentRole.permissions.map(p => p.name);
    const missingPermNames = permissionsToAdd.filter(p => !existingPermNames.includes(p));

    if (missingPermNames.length === 0) {
      console.log('\n✅ All required permissions already exist');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log('\nMissing permissions:', missingPermNames);

    // Find the permission documents
    const permissionsToAddDocs = await Permission.find({
      name: { $in: missingPermNames }
    });

    if (permissionsToAddDocs.length !== missingPermNames.length) {
      console.log('\n⚠️  Some permissions not found in database:');
      const foundNames = permissionsToAddDocs.map(p => p.name);
      const notFound = missingPermNames.filter(n => !foundNames.includes(n));
      console.log('Not found:', notFound);
    }

    if (permissionsToAddDocs.length > 0) {
      // Add permissions to role
      const permissionIds = permissionsToAddDocs.map(p => p._id);
      agentRole.permissions.push(...permissionIds);
      await agentRole.save();

      console.log('\n✅ Added permissions:');
      permissionsToAddDocs.forEach(p => {
        console.log(`  - ${p.name}: ${p.description}`);
      });

      console.log(`\n✅ Total permissions now: ${agentRole.permissions.length}`);
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addAgentPermissions();
