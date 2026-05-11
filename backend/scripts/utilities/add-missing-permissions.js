const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sac_helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const permissionSchema = new mongoose.Schema({
  module: String,
  name: String,
  code: { type: String, unique: true },
  description: String,
  category: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Permission = mongoose.model('Permission', permissionSchema);

const roleSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
});

const Role = mongoose.model('Role', roleSchema);

const newPermissions = [
  // TICKET CONFIGURATION CATEGORY
  {
    module: 'Ticket Configuration',
    name: 'View Ticket Configuration',
    code: 'TICKET_CONFIG_VIEW',
    description: 'Can view ticket configuration settings',
    category: 'ticket-configuration',
  },
  {
    module: 'Ticket Configuration',
    name: 'Manage Categories',
    code: 'TICKET_CONFIG_MANAGE_CATEGORIES',
    description: 'Can create, edit, and delete ticket categories',
    category: 'ticket-configuration',
  },
  {
    module: 'Ticket Configuration',
    name: 'Manage Statuses',
    code: 'TICKET_CONFIG_MANAGE_STATUSES',
    description: 'Can create, edit, and delete ticket statuses',
    category: 'ticket-configuration',
  },
  {
    module: 'Ticket Configuration',
    name: 'Manage Priorities',
    code: 'TICKET_CONFIG_MANAGE_PRIORITIES',
    description: 'Can create, edit, and delete ticket priorities',
    category: 'ticket-configuration',
  },
  {
    module: 'Ticket Configuration',
    name: 'Manage Types',
    code: 'TICKET_CONFIG_MANAGE_TYPES',
    description: 'Can create, edit, and delete ticket types',
    category: 'ticket-configuration',
  },
  {
    module: 'Ticket Configuration',
    name: 'Manage Templates',
    code: 'TICKET_CONFIG_MANAGE_TEMPLATES',
    description: 'Can create and manage ticket templates',
    category: 'ticket-configuration',
  },
  {
    module: 'Ticket Configuration',
    name: 'Manage Table Columns',
    code: 'TICKET_CONFIG_MANAGE_TABLE_COLUMNS',
    description: 'Can configure query table columns by project',
    category: 'ticket-configuration',
  },
  // KNOWLEDGE BASE CATEGORY
  {
    module: 'Knowledge Base',
    name: 'View Knowledge Base',
    code: 'KB_VIEW',
    description: 'Can view knowledge base articles',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Create Articles',
    code: 'KB_CREATE',
    description: 'Can create new knowledge base articles',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Edit Articles',
    code: 'KB_EDIT',
    description: 'Can edit existing knowledge base articles',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Delete Articles',
    code: 'KB_DELETE',
    description: 'Can delete knowledge base articles',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Publish Articles',
    code: 'KB_PUBLISH',
    description: 'Can publish knowledge base articles',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Unpublish Articles',
    code: 'KB_UNPUBLISH',
    description: 'Can unpublish knowledge base articles',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Manage Categories',
    code: 'KB_MANAGE_CATEGORIES',
    description: 'Can create and manage KB categories',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Approve Articles',
    code: 'KB_APPROVE',
    description: 'Can approve KB articles for publishing',
    category: 'knowledge-base',
  },
  {
    module: 'Knowledge Base',
    name: 'Export Articles',
    code: 'KB_EXPORT',
    description: 'Can export knowledge base articles',
    category: 'knowledge-base',
  },
];

async function addMissingPermissions() {
  try {
    console.log('🔍 Checking for missing permissions...');
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const perm of newPermissions) {
      const exists = await Permission.findOne({ code: perm.code });
      
      if (!exists) {
        await Permission.create(perm);
        console.log(`✅ Added: ${perm.code} - ${perm.name}`);
        addedCount++;
      } else {
        console.log(`⏭️  Skipped (already exists): ${perm.code}`);
        skippedCount++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Added: ${addedCount} permissions`);
    console.log(`   Skipped: ${skippedCount} permissions`);
    console.log(`   Total permissions in DB: ${await Permission.countDocuments()}`);

    // Keep Super Admin synced with any newly introduced permissions.
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    if (superAdminRole) {
      const permissionDocs = await Permission.find({
        code: { $in: newPermissions.map((p) => p.code) },
      }).select('_id code');

      const existing = new Set(
        (superAdminRole.permissions || []).map((id) => id.toString()),
      );
      const missingPermissionIds = permissionDocs
        .map((p) => p._id)
        .filter((id) => !existing.has(id.toString()));

      if (missingPermissionIds.length > 0) {
        superAdminRole.permissions.push(...missingPermissionIds);
        await superAdminRole.save();
        console.log(
          `🔑 Added ${missingPermissionIds.length} missing permission(s) to SUPER_ADMIN`,
        );
      } else {
        console.log('🔑 SUPER_ADMIN already has all listed permissions');
      }
    } else {
      console.log('⚠️ SUPER_ADMIN role not found. Permission records were added only.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addMissingPermissions();
