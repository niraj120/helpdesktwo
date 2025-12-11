/**
 * Script to create FAQ permission documents and add them to SUPER_ADMIN role
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log('✅ Connected to MongoDB\n');

  try {
    // Get collections
    const Permission = mongoose.connection.collection('permissions');
    const Role = mongoose.connection.collection('roles');

    // Define FAQ permissions to create
    const faqPermissionsToCreate = [
      {
        code: 'FAQ_VIEW',
        name: 'View FAQs',
        description: 'Can view FAQ articles',
        module: 'FAQ',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        code: 'FAQ_CREATE',
        name: 'Create FAQs',
        description: 'Can create new FAQ articles',
        module: 'FAQ',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        code: 'FAQ_EDIT',
        name: 'Edit FAQs',
        description: 'Can edit existing FAQ articles',
        module: 'FAQ',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        code: 'FAQ_DELETE',
        name: 'Delete FAQs',
        description: 'Can delete FAQ articles',
        module: 'FAQ',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        code: 'FAQ_MANAGE',
        name: 'Manage FAQs',
        description: 'Full management access to FAQ module',
        module: 'FAQ',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    console.log('🔍 Checking existing FAQ permissions...\n');
    
    const createdPermissions = [];
    
    for (const permData of faqPermissionsToCreate) {
      // Check if permission already exists
      const existing = await Permission.findOne({ code: permData.code });
      
      if (existing) {
        console.log(`✓ ${permData.code} already exists (ID: ${existing._id})`);
        createdPermissions.push(existing._id);
      } else {
        // Create new permission
        const result = await Permission.insertOne(permData);
        console.log(`✅ Created ${permData.code} (ID: ${result.insertedId})`);
        createdPermissions.push(result.insertedId);
      }
    }

    console.log(`\n📋 Total FAQ permissions: ${createdPermissions.length}\n`);

    // Find SUPER_ADMIN role
    console.log('🔍 Finding SUPER_ADMIN role...');
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (!superAdminRole) {
      console.log('❌ SUPER_ADMIN role not found!\n');
      process.exit(1);
    }

    console.log('✅ Found SUPER_ADMIN role\n');

    // Remove any string-based FAQ permissions from the role
    console.log('🧹 Removing old string-based FAQ permissions...');
    const currentPermissions = superAdminRole.permissions || [];
    const cleanedPermissions = currentPermissions.filter(p => {
      const permStr = String(p);
      return !permStr.includes('FAQ_');
    });
    
    console.log(`   Removed ${currentPermissions.length - cleanedPermissions.length} string entries`);

    // Add ObjectId-based FAQ permissions
    console.log('➕ Adding ObjectId-based FAQ permissions...');
    const updatedPermissions = [...cleanedPermissions, ...createdPermissions];
    
    await Role.updateOne(
      { code: 'SUPER_ADMIN' },
      { 
        $set: { permissions: updatedPermissions },
        $currentDate: { updatedAt: true }
      }
    );

    console.log(`✅ Updated SUPER_ADMIN role with ${updatedPermissions.length} total permissions\n`);

    // Verify the update
    console.log('🔍 Verifying update...');
    const verifyRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    const faqPermsInRole = verifyRole.permissions.filter(p => {
      const permId = String(p);
      return createdPermissions.some(cp => String(cp) === permId);
    });

    console.log(`✅ FAQ permissions in SUPER_ADMIN role: ${faqPermsInRole.length}`);
    
    if (faqPermsInRole.length === faqPermissionsToCreate.length) {
      console.log('✅ All FAQ permissions successfully added!\n');
    } else {
      console.log('⚠️  Warning: Not all FAQ permissions were added\n');
    }

    console.log('🎉 Done!');
    console.log('\n📝 Next steps:');
    console.log('   1. Clear browser cache (localStorage)');
    console.log('   2. Logout and login again');
    console.log('   3. FAQ menu should now appear');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  }
});
