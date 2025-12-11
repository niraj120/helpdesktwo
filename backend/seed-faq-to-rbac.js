/**
 * Script to add FAQ permissions to the permissions collection for RBAC
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

mongoose.connect(MONGODB_URI);

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log('✅ Connected to MongoDB\n');

  try {
    const Permission = mongoose.connection.collection('permissions');

    // Define FAQ permissions
    const faqPermissions = [
      {
        module: 'FAQ',
        name: 'View FAQs',
        code: 'FAQ_VIEW',
        description: 'Can view FAQ articles',
        category: 'faq',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'FAQ',
        name: 'Create FAQs',
        code: 'FAQ_CREATE',
        description: 'Can create new FAQ articles',
        category: 'faq',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'FAQ',
        name: 'Edit FAQs',
        code: 'FAQ_EDIT',
        description: 'Can edit existing FAQ articles',
        category: 'faq',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'FAQ',
        name: 'Delete FAQs',
        code: 'FAQ_DELETE',
        description: 'Can delete FAQ articles',
        category: 'faq',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'FAQ',
        name: 'Manage FAQs',
        code: 'FAQ_MANAGE',
        description: 'Can manage FAQ settings and categories',
        category: 'faq',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    console.log('🔍 Checking for existing FAQ permissions...\n');

    // Check if FAQ permissions already exist
    for (const perm of faqPermissions) {
      const existing = await Permission.findOne({ code: perm.code });
      if (!existing) {
        await Permission.insertOne(perm);
        console.log(`✅ Added: ${perm.code} - ${perm.name}`);
      } else {
        console.log(`⏭️  Already exists: ${perm.code}`);
      }
    }

    console.log('\n🎉 FAQ permissions are now available in RBAC!');
    console.log('\n📝 Next steps:');
    console.log('   1. Refresh the RBAC page in the browser');
    console.log('   2. You should now see "FAQ" category in permissions');
    console.log('   3. Assign FAQ permissions to roles as needed\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
});
