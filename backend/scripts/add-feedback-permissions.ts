import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import models
import { Permission } from '../src/models/Permission';
import { Role } from '../src/models/Role';

const feedbackPermissions = [
  {
    code: 'FEEDBACK_FORM_CREATE',
    name: 'Create Feedback Forms',
    description: 'Can create new feedback forms',
    module: 'Feedback',
    category: 'feedback',
  },
  {
    code: 'FEEDBACK_FORM_EDIT',
    name: 'Edit Feedback Forms',
    description: 'Can edit existing feedback forms',
    module: 'Feedback',
    category: 'feedback',
  },
  {
    code: 'FEEDBACK_FORM_DELETE',
    name: 'Delete Feedback Forms',
    description: 'Can delete feedback forms',
    module: 'Feedback',
    category: 'feedback',
  },
  {
    code: 'FEEDBACK_VIEW',
    name: 'View Feedback',
    description: 'Can view submitted feedback responses',
    module: 'Feedback',
    category: 'feedback',
  },
  {
    code: 'FEEDBACK_EXPORT',
    name: 'Export Feedback',
    description: 'Can export feedback responses',
    module: 'Feedback',
    category: 'feedback',
  },
];

async function addFeedbackPermissions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected');

    // Check if permissions already exist
    const existingPermissions = await Permission.find({
      code: { $in: feedbackPermissions.map(p => p.code) }
    });

    if (existingPermissions.length > 0) {
      console.log(`⚠️  Found ${existingPermissions.length} existing feedback permissions`);
      console.log('   Existing codes:', existingPermissions.map(p => p.code).join(', '));
      
      // Delete existing ones to re-insert
      await Permission.deleteMany({
        code: { $in: feedbackPermissions.map(p => p.code) }
      });
      console.log('🗑️  Deleted existing feedback permissions');
    }

    // Insert new permissions
    console.log('🌱 Adding feedback permissions...');
    const inserted = await Permission.insertMany(feedbackPermissions);
    console.log(`✅ Added ${inserted.length} feedback permissions`);

    // Add permissions to Super Admin role
    console.log('🔐 Updating Super Admin role...');
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
    
    if (superAdminRole) {
      const newPermissionIds = inserted.map(p => p._id);
      
      // Add new permission IDs to Super Admin (avoid duplicates)
      superAdminRole.permissions = [
        ...new Set([
          ...superAdminRole.permissions.map(p => p.toString()),
          ...newPermissionIds.map(id => id.toString())
        ])
      ];
      
      await superAdminRole.save();
      console.log(`✅ Added ${newPermissionIds.length} permissions to Super Admin role`);
      console.log(`   Super Admin now has ${superAdminRole.permissions.length} total permissions`);
    } else {
      console.log('⚠️  Super Admin role not found');
    }

    console.log('\n✅ Feedback permissions added successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Hard refresh your browser (Ctrl + Shift + R)');
    console.log('   2. Logout and login again as Super Admin');
    console.log('   3. You should now see "Feedback" menu in the sidebar');

    await mongoose.disconnect();
    console.log('✅ Database disconnected');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addFeedbackPermissions();
