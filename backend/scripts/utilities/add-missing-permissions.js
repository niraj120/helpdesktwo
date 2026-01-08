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
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addMissingPermissions();
