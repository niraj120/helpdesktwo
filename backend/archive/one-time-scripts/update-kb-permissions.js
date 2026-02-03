require('dotenv').config();
const mongoose = require('mongoose');

async function updateOldKBPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Old KB permissions that should be marked as inactive
    const oldKBCodes = [
      'KB_VIEW',
      'KB_CREATE',
      'KB_EDIT',
      'KB_DELETE',
      'KB_PUBLISH',
      'KB_UNPUBLISH',
      'KB_MANAGE_CATEGORIES',
      'KB_APPROVE',
      'KB_EXPORT'
    ];

    console.log('⛔ Marking old KB permissions as INACTIVE...\n');

    // Update each old permission to isActive: false
    const result = await db.collection('permissions').updateMany(
      { code: { $in: oldKBCodes } },
      { $set: { isActive: false, updatedAt: new Date() } }
    );

    console.log(`✅ Updated ${result.modifiedCount} old KB permissions to inactive`);

    // Verify the changes
    console.log('\n📊 Verification:');
    const oldPerms = await db.collection('permissions')
      .find({ code: { $in: oldKBCodes } })
      .toArray();

    oldPerms.forEach(p => {
      console.log(`   ${p.isActive ? '⚠️ STILL ACTIVE' : '✅ INACTIVE'}: ${p.code}`);
    });

    // Check new KB permissions are active
    const newKBCodes = ['KB_MANAGE', 'KB_MANAGE_LEVELS', 'KB_MANAGE_ARTICLES', 'KB_MANAGE_TABLES', 'KB_VIEW_CONTENT'];
    const newPerms = await db.collection('permissions')
      .find({ code: { $in: newKBCodes } })
      .toArray();

    console.log('\n📚 New KB Permissions Status:');
    newPerms.forEach(p => {
      console.log(`   ${p.isActive ? '✅ ACTIVE' : '❌ INACTIVE'}: ${p.code}`);
    });

    if (newPerms.length < 5) {
      console.log(`\n⚠️  WARNING: Only ${newPerms.length}/5 new KB permissions found!`);
      const missing = newKBCodes.filter(code => !newPerms.find(p => p.code === code));
      console.log(`   Missing: ${missing.join(', ')}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Database updated and disconnected');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateOldKBPermissions();
    
    // Check if KB_MANAGE exists, if not create it
    console.log('\n📝 Checking KB_MANAGE permission...\n');
    
    const kbManageExists = await Permission.findOne({ code: 'KB_MANAGE' });
    
    if (kbManageExists) {
      console.log('✅ KB_MANAGE permission already exists');
      console.log('   Current name:', kbManageExists.name);
      console.log('   Current description:', kbManageExists.description);
    } else {
      console.log('➕ Creating KB_MANAGE permission...');
      
      const newPermission = await Permission.create({
        module: 'Knowledge Base',
        name: 'Manage KB System',
        code: 'KB_MANAGE',
        description: 'Full access to manage KB levels, articles, and tables in the new modular system',
        category: 'knowledge-base'
      });
      
      console.log('✅ Created KB_MANAGE permission');
      console.log('   ID:', newPermission._id);
    }
    
    // Display all KB permissions
    console.log('\n📋 All Knowledge Base Permissions:\n');
    const allKBPerms = await Permission.find({ 
      code: { $regex: '^KB_' } 
    }).sort({ code: 1 });
    
    allKBPerms.forEach((perm, idx) => {
      console.log(`${(idx + 1).toString().padStart(2, ' ')}. ${perm.code.padEnd(25)} - ${perm.name}`);
      console.log(`    ${perm.description}`);
    });
    
    console.log('\n✅ KB permissions updated successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Go to RBAC Setup in the admin panel');
    console.log('   2. Assign KB permissions to roles as needed:');
    console.log('      - KB_VIEW: For users who only need to view KB content');
    console.log('      - KB_CREATE/KB_EDIT/KB_DELETE: For content creators');
    console.log('      - KB_MANAGE: For KB system administrators');
    console.log('   3. Users need to logout and login again to get updated permissions');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateKBPermissions();
