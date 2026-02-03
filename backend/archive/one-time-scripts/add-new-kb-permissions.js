require('dotenv').config();
const mongoose = require('mongoose');

async function addNewKBPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, {strict: false, collection: 'permissions'}));
    
    console.log('📝 Adding New KB Modular System Permissions...\n');
    
    const newPermissions = [
      {
        module: 'Knowledge Base (New)',
        name: 'Manage KB Levels',
        code: 'KB_MANAGE_LEVELS',
        description: 'Can create, edit, and delete KB levels/categories in the new modular system',
        category: 'knowledge-base'
      },
      {
        module: 'Knowledge Base (New)',
        name: 'Manage KB Articles',
        code: 'KB_MANAGE_ARTICLES',
        description: 'Can create, edit, and delete KB articles in the new modular system',
        category: 'knowledge-base'
      },
      {
        module: 'Knowledge Base (New)',
        name: 'Manage KB Tables',
        code: 'KB_MANAGE_TABLES',
        description: 'Can create, edit, and delete KB tables in the new modular system',
        category: 'knowledge-base'
      },
      {
        module: 'Knowledge Base (New)',
        name: 'View KB Content',
        code: 'KB_VIEW_CONTENT',
        description: 'Can view KB content (levels, articles, tables) in the new modular system',
        category: 'knowledge-base'
      }
    ];
    
    for (const perm of newPermissions) {
      const exists = await Permission.findOne({ code: perm.code });
      
      if (exists) {
        console.log(`ℹ️  ${perm.code} already exists`);
      } else {
        await Permission.create(perm);
        console.log(`✅ Created ${perm.code} - ${perm.name}`);
      }
    }
    
    // Update existing KB_MANAGE permission
    await Permission.updateOne(
      { code: 'KB_MANAGE' },
      { 
        $set: {
          module: 'Knowledge Base (New)',
          name: 'Manage KB System',
          description: 'Full administrative access to the new KB system (levels, articles, tables)'
        }
      }
    );
    console.log('\n✅ Updated KB_MANAGE permission');
    
    // Update legacy permissions
    const legacyUpdates = [
      { code: 'KB_VIEW', name: 'View Knowledge Base (Legacy)', description: 'Can view knowledge base articles (legacy system)' },
      { code: 'KB_CREATE', name: 'Create Articles (Legacy)', description: 'Can create new knowledge base articles (legacy system)' },
      { code: 'KB_EDIT', name: 'Edit Articles (Legacy)', description: 'Can edit existing knowledge base articles (legacy system)' },
      { code: 'KB_DELETE', name: 'Delete Articles (Legacy)', description: 'Can delete knowledge base articles (legacy system)' },
      { code: 'KB_MANAGE_CATEGORIES', name: 'Manage Categories (Legacy)', description: 'Can create and manage KB categories (legacy system)' }
    ];
    
    for (const update of legacyUpdates) {
      await Permission.updateOne(
        { code: update.code },
        { $set: update }
      );
    }
    console.log('✅ Updated legacy permissions\n');
    
    // Display all KB permissions grouped
    console.log('📋 ALL KNOWLEDGE BASE PERMISSIONS:\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('🆕 NEW MODULAR SYSTEM (Recommended):');
    const newPerms = await Permission.find({ 
      code: { $in: ['KB_MANAGE', 'KB_MANAGE_LEVELS', 'KB_MANAGE_ARTICLES', 'KB_MANAGE_TABLES', 'KB_VIEW_CONTENT'] }
    }).sort({ code: 1 });
    
    newPerms.forEach(perm => {
      console.log(`   ✓ ${perm.code.padEnd(25)} - ${perm.name}`);
      console.log(`     ${perm.description}`);
    });
    
    console.log('\n📜 LEGACY SYSTEM:');
    const legacyPerms = await Permission.find({ 
      code: { $in: ['KB_VIEW', 'KB_CREATE', 'KB_EDIT', 'KB_DELETE', 'KB_PUBLISH', 'KB_UNPUBLISH', 'KB_MANAGE_CATEGORIES', 'KB_APPROVE', 'KB_EXPORT'] }
    }).sort({ code: 1 });
    
    legacyPerms.forEach(perm => {
      console.log(`   ○ ${perm.code.padEnd(25)} - ${perm.name}`);
    });
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('\n💡 NEXT STEPS:\n');
    console.log('1. Go to RBAC Setup in admin panel');
    console.log('2. Assign NEW MODULAR SYSTEM permissions to Ankit Mehta\'s role:');
    console.log('   ✓ KB_VIEW_CONTENT - For viewing KB content');
    console.log('   ✓ KB_MANAGE_LEVELS - For managing levels');
    console.log('   ✓ KB_MANAGE_ARTICLES - For managing articles');
    console.log('   ✓ KB_MANAGE_TABLES - For managing tables');
    console.log('   ✓ KB_MANAGE - For full KB admin access');
    console.log('\n3. Ankit must LOGOUT and LOGIN again');
    console.log('4. Knowledge Base menu will appear with project switcher');
    console.log('\n✨ Project switcher is now visible for ALL KB users!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addNewKBPermissions();
